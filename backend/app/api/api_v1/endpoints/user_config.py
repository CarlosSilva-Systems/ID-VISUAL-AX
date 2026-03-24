from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Any

from app.api import deps
from app.models.user import User
from app.schemas.user_config import UserOdooConfig, UserOdooConfigUpdate

router = APIRouter()

@router.get("/odoo-config", response_model=UserOdooConfig)
async def get_user_odoo_config(
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Retorna as preferências de ambiente Odoo do usuário atual.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    return UserOdooConfig(
        is_odoo_test_mode=current_user.is_odoo_test_mode,
        odoo_test_url=current_user.odoo_test_url,
        department=current_user.department
    )

@router.patch("/odoo-config", response_model=UserOdooConfig)
async def update_user_odoo_config(
    payload: UserOdooConfigUpdate,
    session: AsyncSession = Depends(deps.get_session),
    current_user: User = Depends(deps.get_current_user)
) -> Any:
    """
    Atualiza as preferências de ambiente Odoo.
    REGRAS: 
    - Apenas usuários do departamento 'T.I' podem realizar esta alteração.
    - O isolamento é por usuário (persistência individual no banco).
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # RBAC: Verificação de departamento
    if not current_user.department or current_user.department.upper() != "T.I":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado: Apenas o departamento de T.I pode alterar o ambiente Odoo."
        )

    # Atualização parcial
    if payload.is_odoo_test_mode is not None:
        current_user.is_odoo_test_mode = payload.is_odoo_test_mode
    
    if payload.odoo_test_url is not None:
        # Pydantic HttpUrl já validou o formato básico. Convertemos para string para o banco.
        current_user.odoo_test_url = str(payload.odoo_test_url)

    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)

    return UserOdooConfig(
        is_odoo_test_mode=current_user.is_odoo_test_mode,
        odoo_test_url=current_user.odoo_test_url,
        department=current_user.department
    )
