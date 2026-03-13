from typing import Generator, Optional
from fastapi import Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlmodel.ext.asyncio.session import AsyncSession
import uuid

from app.core import security
from app.core.config import settings
from app.db.session import get_session
from app.models.user import User
from app.services.odoo_client import OdooClient

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
            
        # Ensure token_data is a valid UUID to avoid SQLAlchemy errors
        user_id = uuid.UUID(str(token_data))
    except (JWTError, ValidationError, ValueError, TypeError):
        return None
    
    from sqlmodel import select
    try:
        stmt = select(User).where(User.id == user_id)
        result = await session.execute(stmt)
        user = result.scalars().first()
    except Exception as e:
        logger.error(f"User lookup failed: {e}")
        return None
        
    if not user or not user.is_active:
        return None
        
    return user

async def get_odoo_client():
    from app.services.odoo_client import OdooClient
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    try:
        yield client
    finally:
        await client.close()
