import json
import logging
from datetime import datetime
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Any, Dict

from app.models.andon import SyncQueue
from app.services.odoo_client import OdooClient

logger = logging.getLogger(__name__)

async def add_to_sync_queue(session: AsyncSession, action: str, payload: Dict):
    """Adiciona um comando à fila de sincronização."""
    queue_item = SyncQueue(
        action=action,
        payload=json.dumps(payload),
        status="PENDING"
    )
    session.add(queue_item)
    await session.commit()
    await session.refresh(queue_item)
    return queue_item

async def process_sync_queue(session: AsyncSession, odoo: OdooClient):
    """
    Processa itens pendentes na fila de sincronização.
    Pode ser chamado periodicamente ou via BackgroundTasks.
    """
    stmt = select(SyncQueue).where(SyncQueue.status.in_(["PENDING", "FAILED"])).where(SyncQueue.retry_count < SyncQueue.max_retries)
    result = await session.execute(stmt)
    items = result.scalars().all()
    
    for item in items:
        item.status = "PROCESSING"
        item.updated_at = datetime.utcnow()
        session.add(item)
        await session.commit()
        
        try:
            payload = json.loads(item.payload)
            if item.action == "pause_workorder":
                res = await odoo.pause_workorder(payload["workorder_id"])
                if res["ok"]:
                    item.status = "COMPLETED"
                else:
                    raise Exception(res["error"])
            
            # Adicionar outras ações conforme necessário
            
            item.processed_at = datetime.utcnow()
            item.last_error = None
        except Exception as e:
            item.retry_count += 1
            item.last_error = str(e)
            item.status = "FAILED" if item.retry_count >= item.max_retries else "PENDING"
            logger.error(f"Sync error for item {item.id}: {e}")
        
        item.updated_at = datetime.utcnow()
        session.add(item)
        await session.commit()
