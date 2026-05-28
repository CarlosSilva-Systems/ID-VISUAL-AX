from typing import Generator, Optional
from fastapi import Depends, HTTPException, status, Query, Header
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlmodel.ext.asyncio.session import AsyncSession
import uuid
import logging

logger = logging.getLogger(__name__)

from app.core import security
from app.core.config import settings
from app.db.session import get_session
from app.models.user import User

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False
)

async def get_current_user(
    session: AsyncSession = Depends(get_session),
    token_header: Optional[str] = Depends(reusable_oauth2),
    token_query: Optional[str] = Query(None, alias="token")
) -> Optional[User]:
    token = token_header or token_query
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = payload.get("sub")
        if token_data is None:
            return None
            
        user_identifier = str(token_data)
    except (JWTError, ValidationError, ValueError, TypeError):
        return None
    
    from sqlmodel import select
    try:
        # Tenta interpretar como UUID (usuários locais), se falhar usa como string (usuários Odoo)
        try:
            user_id = uuid.UUID(user_identifier)
            stmt = select(User).where(User.id == user_id)
        except ValueError:
            # Se não for UUID, busca por username (Odoo users)
            stmt = select(User).where(User.username == user_identifier)
            
        result = await session.execute(stmt)
        user = result.scalars().first()
        
        if not user or not user.is_active:
            return None
            
        return user
    except Exception as e:
        logger.error(f"User lookup failed for {user_identifier}: {e}")
        # Rollback explícito para limpar qualquer estado de transação inválida
        # antes que a mesma sessão seja usada pelo endpoint downstream.
        try:
            await session.rollback()
        except Exception:
            pass
        return None


async def require_current_user(
    current_user: Optional[User] = Depends(get_current_user),
) -> User:
    """Dependência que exige autenticação obrigatória. Lança 401 se não autenticado."""
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autenticado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


async def require_ti_role(
    current_user: User = Depends(require_current_user),
) -> User:
    """Exige que o usuário tenha o papel de TI."""
    from app.models.user import UserRole
    if current_user.role not in [UserRole.TI, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito à equipe de TI.",
        )
    return current_user



async def get_odoo_client(
    session: AsyncSession = Depends(get_session),
    current_user: Optional[User] = Depends(get_current_user)
):
    from app.services.odoo_client import OdooClient
    from app.services.odoo_utils import get_active_odoo_db
    
    # Obter banco ativo dinamicamente
    active_db = await get_active_odoo_db(session)
    
    # URL Dinâmica: Staging vs Produção
    # Se o usuário está em modo teste e tem uma URL configurada, usamos ela.
    # Caso contrário, fallback para a URL padrão dos settings.
    odoo_url = settings.ODOO_URL
    if current_user and current_user.is_odoo_test_mode and current_user.odoo_test_url:
        odoo_url = current_user.odoo_test_url
        logger.info(f"Usuário {current_user.username} operando em MODO TESTE: {odoo_url}")

    client = OdooClient(
        url=odoo_url,
        db=active_db,  # Usa banco ativo ao invés de settings.ODOO_DB
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_SERVICE_LOGIN,
        secret=settings.ODOO_SERVICE_PASSWORD
    )
    try:
        yield client
    finally:
        await client.close()

async def verify_webhook_secret(
    x_andon_webhook_secret: str = Header(..., alias="X-Andon-Webhook-Secret")
):
    if x_andon_webhook_secret != settings.ODOO_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook secret"
        )


async def validate_production_write_protection(
    session: AsyncSession = Depends(get_session),
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Dependência que valida se operações de escrita em produção estão permitidas.
    
    REGRA DE PROTEÇÃO:
    - Se o banco ativo NÃO é produção, BLOQUEIA qualquer escrita que possa afetar produção
    - Se o banco ativo É produção, PERMITE escritas normalmente
    
    Esta dependência deve ser usada em TODOS os endpoints que realizam operações
    de escrita (POST, PUT, PATCH, DELETE) que possam afetar dados do Odoo.
    
    Raises:
        HTTPException 403: Quando tentativa de escrita em produção é bloqueada
        
    Examples:
        @router.post("/batches")
        async def create_batch(
            ...,
            _: None = Depends(validate_production_write_protection)
        ):
            # Código do endpoint
    """
    from app.services.odoo_utils import is_production_write_blocked, get_active_odoo_db
    
    # Verificar se escritas em produção estão bloqueadas
    if await is_production_write_blocked(session):
        active_db = await get_active_odoo_db(session)
        logger.warning(
            f"🚫 PRODUCTION WRITE BLOCKED: User '{current_user.username if current_user else 'anonymous'}' "
            f"attempted write operation while active database is '{active_db}' (not production)"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Operação bloqueada: O banco ativo é '{active_db}' (ambiente de teste). "
                f"Não é permitido modificar o banco de produção quando outro banco está selecionado. "
                f"Para realizar operações em produção, selecione o banco de produção nas configurações."
            )
        )
    
    # Se chegou aqui, está em produção e pode escrever
    logger.debug(f"✓ Production write allowed for user '{current_user.username if current_user else 'anonymous'}'")

