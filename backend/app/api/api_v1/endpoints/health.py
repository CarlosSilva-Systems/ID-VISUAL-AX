"""
Endpoint de health check do sistema.
Inclui status da fila de sincronização com o Odoo para monitoramento operacional.
"""
from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_session

router = APIRouter()


@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "backend": "running",
    }


@router.get("/health/sync-queue")
async def sync_queue_health(session: AsyncSession = Depends(get_session)):
    """
    Retorna o status da fila de sincronização com o Odoo.

    Útil para monitoramento operacional — alerta se houver acúmulo de itens
    PENDING ou FAILED que indicam falha de comunicação com o Odoo.
    """
    from app.services.sync_service import get_queue_stats
    stats = await get_queue_stats(session)
    status = "degraded" if stats["alert"] else "ok"
    return {"status": status, **stats}
