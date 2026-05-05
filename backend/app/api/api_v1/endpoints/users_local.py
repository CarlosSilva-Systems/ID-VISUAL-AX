from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from typing import List, Optional
from pydantic import BaseModel
import uuid

from app.api import deps
from app.models.user import User, UserRole
from app.core.security import get_password_hash

router = APIRouter()

class LocalUserCreate(BaseModel):
    username: str
    full_name: str
    password: str
    role: UserRole

class LocalUserResponse(BaseModel):
    id: uuid.UUID
    username: str
    full_name: Optional[str]
    role: UserRole
    is_active: bool
    is_local: bool

class PasswordUpdate(BaseModel):
    new_password: str

@router.get("/", response_model=List[LocalUserResponse])
async def get_local_users(
    session: AsyncSession = Depends(deps.get_session),
    current_user: User = Depends(deps.require_ti_role)
):
    """Lista todos os usuários locais (Gestão de Acessos)."""
    stmt = select(User).where(User.is_local == True)
    result = await session.execute(stmt)
    return result.scalars().all()

@router.post("/", response_model=LocalUserResponse)
async def create_local_user(
    user_in: LocalUserCreate,
    session: AsyncSession = Depends(deps.get_session),
    current_user: User = Depends(deps.require_ti_role)
):
    """Cria um novo usuário local."""
    stmt = select(User).where(User.username == user_in.username)
    result = await session.execute(stmt)
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Usuário já existe.")
        
    db_user = User(
        username=user_in.username,
        full_name=user_in.full_name,
        role=user_in.role,
        hashed_password=get_password_hash(user_in.password),
        is_local=True,
        is_active=True
    )
    session.add(db_user)
    await session.commit()
    await session.refresh(db_user)
    return db_user

@router.patch("/{user_id}/password")
async def update_local_user_password(
    user_id: uuid.UUID,
    payload: PasswordUpdate,
    session: AsyncSession = Depends(deps.get_session),
    current_user: User = Depends(deps.require_ti_role)
):
    """Redefine a senha de um usuário local."""
    stmt = select(User).where(User.id == user_id, User.is_local == True)
    result = await session.execute(stmt)
    db_user = result.scalars().first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuário local não encontrado.")
        
    db_user.hashed_password = get_password_hash(payload.new_password)
    session.add(db_user)
    await session.commit()
    return {"message": "Senha atualizada com sucesso."}

@router.delete("/{user_id}")
async def delete_local_user(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(deps.get_session),
    current_user: User = Depends(deps.require_ti_role)
):
    """Deleta um usuário local."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Não é possível deletar o próprio usuário.")
        
    stmt = select(User).where(User.id == user_id, User.is_local == True)
    result = await session.execute(stmt)
    db_user = result.scalars().first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuário local não encontrado.")
        
    await session.delete(db_user)
    await session.commit()
    return {"message": "Usuário deletado."}
