from typing import Any, List, Dict
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.api.deps import get_odoo_client
from app.models.system_setting import SystemSetting
from app.services.odoo_client import OdooClient
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/", response_model=List[Dict[str, Any]])
async def get_all_settings(
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user)
) -> Any:
    """
    Get all system settings.
    """
    result = await session.exec(select(SystemSetting))
    return [{"key": s.key, "value": s.value, "description": s.description} for s in result.all()]

@router.patch("/", response_model=Dict[str, Any])
async def update_settings(
    updates: Dict[str, str],
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
    client: OdooClient = Depends(deps.get_odoo_client)
) -> Any:
    """
    Update system settings with validation.
    """
    # 1. Validation for Odoo User ID
    if "odoo_id_visual_activity_user_id" in updates:
        user_id_str = updates["odoo_id_visual_activity_user_id"]
        try:
            user_id = int(user_id_str)
        except ValueError:
            raise HTTPException(status_code=400, detail="ID de usuário inválido (deve ser um número)")
            
        # Verify in Odoo (cliente injetado respeita ambiente do usuário)
        try:
            user = await client.search_read('res.users', domain=[['id', '=', user_id]], fields=['id', 'active'])
            if not user or not user[0]['active']:
                raise HTTPException(status_code=422, detail="Usuário inexistente ou inativo no Odoo.")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error verifying Odoo user: {e}")
            raise HTTPException(status_code=502, detail="Falha ao verificar usuário no Odoo.")

    # 2. Persist
    for key, value in updates.items():
        stmt = select(SystemSetting).where(SystemSetting.key == key)
        result = await session.exec(stmt)
        setting = result.first()
        
        if setting:
            setting.value = value
        else:
            setting = SystemSetting(key=key, value=value)
            
        session.add(setting)
    
    await session.commit()
    return {"status": "success", "updated_keys": list(updates.keys())}

@router.post("/reset-database")
async def reset_database(
    current_user: Any = Depends(deps.get_current_user)
) -> Any:
    """
    DANGER: Resets the entire local database.
    """
    from app.db.session import engine, init_db
    from sqlalchemy import create_engine
    from sqlmodel import SQLModel
    
    sync_url = settings.DATABASE_URL.replace("+aiosqlite", "")
    sync_engine = create_engine(sync_url)
    
    # Use a separate connection to avoid locking issues if possible
    try:
        # Import all models to ensure they are in metadata
        import app.models # noqa
        
        SQLModel.metadata.drop_all(sync_engine)
        SQLModel.metadata.create_all(sync_engine)
        return {"status": "success", "message": "Base de dados resetada com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao resetar banco: {str(e)}")
