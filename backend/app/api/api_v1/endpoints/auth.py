from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from fastapi.security import OAuth2PasswordRequestForm
from typing import Any
import uuid
import logging
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

from app.core.config import settings

logger = logging.getLogger(__name__)
from app.api import deps
from app.models.user import User
from app.core.security import create_access_token
from app.api.api_v1.endpoints.odoo import get_odoo_client

router = APIRouter()

@router.post("/login")
@limiter.limit("5/minute")
async def login_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(deps.get_session),
    service_odoo: Any = Depends(get_odoo_client) # This is the service account
) -> Any:
    """
    OAuth2 compatible token login.
    1. Valida User_Credentials no Odoo usando Active_Database
    2. Cria sessão local com JWT (uid, name, email)
    3. NUNCA armazena senha do usuário
    
    Fallback: Se autenticação Odoo falhar, tenta Employee (Name + Phone).
    """
    import re
    from app.services.odoo_client import OdooClient
    from app.services.odoo_utils import get_active_odoo_db
    from app.models.user import User as UserModel, UserRole
    
    def sanitize_error_message(error: str) -> str:
        """Remove credenciais de mensagens de erro."""
        sanitized = error.replace(settings.ODOO_SERVICE_PASSWORD or "", "***")
        sanitized = sanitized.replace(settings.ODOO_SERVICE_LOGIN or "", "***")
        return sanitized
    
    async def _ensure_local_user(username: str, auth_source: str) -> None:
        """Creates a local User record if it doesn't exist (JIT sync at login)."""
        try:
            stmt = select(UserModel).where(UserModel.username == username)
            result = await session.execute(stmt)
            local_user = result.scalars().first()
            if not local_user:
                local_user = UserModel(
                    username=username,
                    hashed_password=f"EXTERNAL_AUTH_{auth_source.upper()}",
                    role=UserRole.OPERATOR,
                    is_active=True
                )
                session.add(local_user)
                await session.commit()
                logger.info(f"Login JIT: Created local user '{username}' (source: {auth_source})")
        except Exception as e:
            logger.warning(f"Login JIT: Failed to create local user '{username}': {e}")
    
    # Obter banco ativo dinamicamente
    active_db = await get_active_odoo_db(session)
    
    try:
        # Cria cliente temporário com credenciais do usuário
        temp_odoo = OdooClient(
            url=settings.ODOO_URL,
            db=active_db,  # Usa banco ativo
            auth_type="jsonrpc_password",
            login=form_data.username,  # User_Credentials
            secret=form_data.password
        )
        try:
            session_id = await temp_odoo._jsonrpc_authenticate()
            # If we reach here, Odoo auth succeeded
            await _ensure_local_user(form_data.username, "odoo")
            return {
                "access_token": create_access_token(subject=form_data.username),
                "token_type": "bearer",
            }
        finally:
            await temp_odoo.close()

    except Exception as e:
        error_msg = str(e)
        request_id = str(uuid.uuid4())[:8]
        
        if error_msg == "AUTHENTICATION_FAILED":
            # 2. Access Denied -> Try Employee Fallback
            try:
                # Search for employee by name (case-insensitive)
                login_clean = form_data.username.strip()
                employees = await service_odoo.search_read(
                    "hr.employee",
                    [["name", "ilike", login_clean], ["active", "=", True]],
                    fields=["id", "name", "mobile_phone", "user_id"],
                    limit=10 # Check a few to handle ambiguity
                )
                
                if not employees:
                    raise HTTPException(status_code=401, detail="Credenciais inválidas.")

                # Filter for strong match (normalize spaces and ignore case)
                def normalize_name(n):
                    return " ".join(n.lower().split())
                
                strong_matches = [e for e in employees if normalize_name(e['name']) == normalize_name(login_clean)]
                
                if len(strong_matches) > 1:
                    raise HTTPException(status_code=401, detail="Usuário ambíguo, contate o admin.")
                
                if not strong_matches:
                    raise HTTPException(status_code=401, detail="Credenciais inválidas.")
                
                employee = strong_matches[0]
                
                # Check for Odoo Account Bypass
                if employee.get("user_id"):
                    raise HTTPException(
                        status_code=401, 
                        detail="Este usuário possui conta Odoo. Use sua senha do Odoo."
                    )
                
                # Validate Password (Mobile Phone)
                def normalize_phone(p):
                    return re.sub(r'\D', '', str(p or ""))
                
                input_phone = normalize_phone(form_data.password)
                stored_phone = normalize_phone(employee.get("mobile_phone"))
                
                if not input_phone or input_phone != stored_phone:
                    raise HTTPException(status_code=401, detail="Credenciais inválidas.")
                
                # Fallback Success
                await _ensure_local_user(employee['name'], "employee")
                return {
                    "access_token": create_access_token(subject=employee['name']),
                    "token_type": "bearer",
                }

            except HTTPException:
                raise
            except Exception as inner_e:
                safe_msg = sanitize_error_message(str(inner_e))
                logger.error(f"Fallback Error [ref:{request_id}]: {safe_msg}")
                raise HTTPException(
                    status_code=502, 
                    detail=f"Erro ao validar funcionário [ref: {request_id}]"
                )
        
        elif error_msg == "ODOO_UNAVAILABLE":
            raise HTTPException(
                status_code=502, 
                detail=f"Odoo indisponível [ref: {request_id}]"
            )
        else:
            # Other errors (500, etc)
            safe_msg = sanitize_error_message(error_msg)
            logger.error(f"Odoo Auth Error [ref:{request_id}]: {safe_msg}")
            raise HTTPException(
                status_code=502, 
                detail=f"Erro de infraestrutura Odoo [ref: {request_id}]"
            )

@router.get("/me")
async def read_users_me(
    user_token: str = Depends(deps.reusable_oauth2),
    session: AsyncSession = Depends(deps.get_session),
    odoo: Any = Depends(get_odoo_client)
) -> dict:
    """
    Returns the profile of the current user.
    JWT-first: always returns a valid profile from the token.
    Odoo enrichment (name, admin, groups) is optional.
    """
    from jose import jwt, JWTError
    from app.core import security
    
    if not user_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    try:
        payload = jwt.decode(
            user_token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        subject = payload.get("sub")
        if not subject:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Base profile from JWT (always available, no external dependency)
    profile = {
        "user": subject,
        "name": subject,
        "is_admin": False,
        "auth_source": "jwt",
        "uid_odoo": None,
        "id": None,
        "employee_id": None,
        "roles": []
    }

    # --- JIT User Sync (ensures local UUID for Reports/Agent) ---
    try:
        from app.models.user import User, UserRole
        stmt = select(User).where(User.username == subject)
        result = await session.execute(stmt)
        local_user = result.scalars().first()
        if not local_user:
            local_user = User(
                username=subject,
                hashed_password="EXTERNAL_AUTH_ODOO",
                role=UserRole.OPERATOR,
                is_active=True
            )
            session.add(local_user)
            await session.commit()
            await session.refresh(local_user)
        profile["id"] = local_user.id
    except Exception as e:
        logger.warning(f"Auth /me: JIT user sync failed for '{subject}': {e}")

    # --- Optional Odoo enrichment (never blocks the response) ---
    try:
        user_data = await odoo.get_user_info(subject)
        if user_data:
            uid = user_data["id"]
            groups_id = user_data.get("groups_id", [])
            admin_group_id = settings.ID_VISUAL_ADMIN_GROUP_ID
            is_admin = admin_group_id and int(admin_group_id) in groups_id

            profile["name"] = user_data.get("name", subject)
            profile["is_admin"] = bool(is_admin)
            profile["auth_source"] = "odoo"
            profile["uid_odoo"] = uid
            profile["roles"] = groups_id
            logger.info(f"Auth /me: Enriched with Odoo data for '{subject}' (ID: {uid})")
    except Exception as e:
        logger.warning(f"Auth /me: Odoo enrichment skipped for '{subject}': {e}")

    logger.info(f"Auth /me: Returning profile for '{subject}' (source: {profile['auth_source']})")
    return profile

