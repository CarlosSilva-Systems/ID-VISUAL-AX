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
    service_odoo: Any = Depends(get_odoo_client) # This is the service account
) -> Any:
    """
    OAuth2 compatible token login.
    1. Try Odoo authentication for standard users.
    2. If Access Denied, try Employee fallback (Name + Phone).
    """
    import re
    from app.services.odoo_client import OdooClient
    
    try:
        temp_odoo = OdooClient(
            url=settings.ODOO_URL,
            db=settings.ODOO_DB,
            auth_type="jsonrpc_password",
            login=form_data.username,
            secret=form_data.password
        )
        try:
            session_id = await temp_odoo._jsonrpc_authenticate()
            # If we reach here, Odoo auth succeeded
            return {
                "access_token": create_access_token(subject=form_data.username),
                "token_type": "bearer",
            }
        finally:
            await temp_odoo.close()

    except Exception as e:
        error_msg = str(e)
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
                return {
                    "access_token": create_access_token(subject=employee['name']),
                    "token_type": "bearer",
                }

            except HTTPException:
                raise
            except Exception as inner_e:
                import uuid
                request_id = str(uuid.uuid4())[:8]
                logger.error(f"Fallback Error [{request_id}]: {inner_e}")
                raise HTTPException(
                    status_code=502, 
                    detail={"message": "Erro ao validar funcionário", "stage": "fallback", "request_id": request_id}
                )
        
        elif error_msg == "ODOO_UNAVAILABLE":
            import uuid
            request_id = str(uuid.uuid4())[:8]
            raise HTTPException(
                status_code=502, 
                detail={"message": "Odoo indisponível", "stage": "auth", "request_id": request_id}
            )
        else:
            # Other errors (500, etc)
            import uuid
            request_id = str(uuid.uuid4())[:8]
            logger.error(f"Odoo Auth Error [{request_id}]: {e}")
            raise HTTPException(
                status_code=502, 
                detail={"message": "Erro de infraestrutura Odoo", "stage": "auth", "request_id": request_id}
            )

@router.get("/me")
async def read_users_me(
    user_token: str = Depends(deps.reusable_oauth2),
    session: AsyncSession = Depends(deps.get_session),
    odoo: Any = Depends(get_odoo_client)
) -> dict:

    """
    Returns the profile of the current user.
    Handles both Odoo users and Fallback employees.
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
        logger.info(f"Auth /me: Extracted subject '{subject}' from token")
        if not subject:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # 1. Try to find as Odoo User
    try:
        user_data = await odoo.get_user_info(subject)
        if user_data:
            uid = user_data["id"]
            groups_id = user_data.get("groups_id", [])
            admin_group_id = settings.ID_VISUAL_ADMIN_GROUP_ID
            is_admin = False
            if admin_group_id and int(admin_group_id) in groups_id:
                is_admin = True

            logger.info(f"Auth /me: Successfully matched Odoo user '{subject}' (ID: {uid})")
            logger.info(f"Auth /me: Successfully matched Odoo user '{subject}' (ID: {uid})")
            
            # --- JIT User Sync (Ensures UUID for Reports/Agent) ---
            from sqlmodel import select
            from app.models.user import User, UserRole
            
            # Check if user exists in local DB
            stmt = select(User).where(User.username == subject)
            result = await session.execute(stmt)
            local_user = result.scalars().first()
            
            if not local_user:
                logger.info(f"Auth /me: Creating local shadow user for Odoo user '{subject}'")
                local_user = User(
                    username=subject,
                    hashed_password="EXTERNAL_AUTH_ODOO", # Placeholder
                    role=UserRole.ADMIN if is_admin else UserRole.OPERATOR,
                    is_active=True
                )
                session.add(local_user)
                await session.commit()
                await session.refresh(local_user)
            
            return {
                "user": subject,
                "name": user_data.get("name"),
                "is_admin": is_admin,
                "auth_source": "odoo",
                "uid_odoo": uid,
                "id": local_user.id, # Importante: Retornar o UUID local
                "employee_id": None,
                "roles": groups_id
            }

    except Exception as e:
        logger.warning(f"Failed to fetch Odoo user info for {subject}: {e}")

    # 2. Try to find as Employee
    try:
        logger.info(f"Auth /me: Attempting employee fallback for '{subject}'")
        employees = await odoo.search_read(
            "hr.employee",
            [["name", "ilike", subject], ["active", "=", True]],
            fields=["id", "name"],
            limit=1
        )
        if employees:
            emp = employees[0]
            logger.info(f"Auth /me: Successfully matched employee fallback '{subject}' (ID: {emp['id']})")
            logger.info(f"Auth /me: Successfully matched employee fallback '{subject}' (ID: {emp['id']})")
            
            # --- JIT User Sync ---
            from sqlmodel import select
            from app.models.user import User, UserRole
            
            stmt = select(User).where(User.username == subject)
            result = await session.execute(stmt)
            local_user = result.scalars().first()
            
            if not local_user:
                local_user = User(
                    username=subject,
                    hashed_password="EXTERNAL_AUTH_EMPLOYEE",
                    role=UserRole.OPERATOR,
                    is_active=True
                )
                session.add(local_user)
                await session.commit()
                await session.refresh(local_user)
                
            return {
                "user": subject,
                "name": emp.get("name"),
                "is_admin": False,
                "auth_source": "employee",
                "uid_odoo": None,
                "id": local_user.id,
                "employee_id": emp["id"],
                "roles": []
            }

    except Exception as e:
        logger.error(f"Failed to fetch employee info for {subject}: {e}")

    logger.error(f"Auth /me: User '{subject}' not found in Odoo or Employees")
    raise HTTPException(
        status_code=502,
        detail=(
            f"Não foi possível validar o usuário '{subject}'. "
            "Verifique se as credenciais do Odoo (ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_PASSWORD) "
            "estão corretamente preenchidas no arquivo .env."
        )
    )
