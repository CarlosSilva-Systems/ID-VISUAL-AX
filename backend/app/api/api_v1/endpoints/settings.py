from typing import Any, List, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.models.system_setting import SystemSetting
from app.services.odoo_client import OdooClient
from app.core.config import settings

router = APIRouter()

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
    current_user: Any = Depends(deps.get_current_user)
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
            
        # Verify in Odoo
        client = OdooClient(
            url=settings.ODOO_URL,
            db=settings.ODOO_DB,
            auth_type=settings.ODOO_AUTH_TYPE,
            login=settings.ODOO_SERVICE_LOGIN,
            secret=settings.ODOO_SERVICE_PASSWORD
        )
        try:
            user = await client.search_read('res.users', domain=[['id', '=', user_id]], fields=['id', 'active'])
            if not user or not user[0]['active']:
                raise HTTPException(status_code=422, detail="Usuário inexistente ou inativo no Odoo.")
        finally:
            await client.close()

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
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user)
) -> Any:
    """
    Limpa todos os dados operacionais locais.
    Preserva: usuários, configurações do sistema e dispositivos ESP32.
    """
    from sqlalchemy import text

    # Um único statement — mais seguro e atômico
    truncate_sql = """
        TRUNCATE TABLE
            andon_call,
            andon_event,
            andon_status,
            andon_material_request,
            sync_queue
        RESTART IDENTITY CASCADE
    """

    optional_tables = [
        "batch",
        "id_request",
        "manufacturing_order",
        "esp_device_logs",
        "ota_update_log",
        "mpr_analytics_snapshot",
    ]

    try:
        await session.execute(text(truncate_sql))
        for table in optional_tables:
            try:
                await session.execute(text(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE'))
            except Exception:
                pass  # tabela pode não existir
        await session.commit()
        return {"status": "success", "message": "Dados operacionais resetados com sucesso."}
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao resetar banco: {str(e)}")
