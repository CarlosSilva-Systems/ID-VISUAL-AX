"""
Serviço de fila de sincronização com o Odoo.

Responsabilidades:
- Enfileirar comandos que precisam ser enviados ao Odoo (pause, resume, chatter, etc.)
- Processar a fila com retry exponencial e max_retries configurável
- Garantir que falhas de rede não percam operações críticas

Ações suportadas:
  pause_workorder      — pausa uma WO no Odoo
  resume_workorder     — retoma uma WO no Odoo
  post_chatter         — posta mensagem no chatter de uma MO
  create_activity      — cria mail.activity em uma MO
  close_activities     — fecha atividades pelo ID

Uso:
    await add_to_sync_queue(session, "pause_workorder", {"workorder_id": 42})
    await process_sync_queue(session, odoo_client)
"""
import json
import logging
from datetime import datetime, timezone
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Any, Dict

from app.models.andon import SyncQueue
from app.services.odoo_client import OdooClient

logger = logging.getLogger(__name__)

# Ações válidas — qualquer outra será logada como erro e marcada como FAILED
_VALID_ACTIONS = {
    "pause_workorder",
    "resume_workorder",
    "post_chatter",
    "create_activity",
    "close_activities",
}


async def add_to_sync_queue(
    session: AsyncSession,
    action: str,
    payload: Dict[str, Any],
    max_retries: int = 5,
) -> SyncQueue:
    """
    Enfileira um comando para envio ao Odoo.

    Args:
        session: AsyncSession do banco local
        action: Nome da ação (deve estar em _VALID_ACTIONS)
        payload: Dados da ação (serializados como JSON)
        max_retries: Número máximo de tentativas antes de marcar como FAILED permanente

    Returns:
        SyncQueue: Item criado na fila
    """
    if action not in _VALID_ACTIONS:
        logger.warning(f"[SyncQueue] Ação desconhecida enfileirada: '{action}'. Verifique _VALID_ACTIONS.")

    queue_item = SyncQueue(
        action=action,
        payload=json.dumps(payload, default=str),
        status="PENDING",
        max_retries=max_retries,
    )
    session.add(queue_item)
    await session.commit()
    await session.refresh(queue_item)
    logger.debug(f"[SyncQueue] Enfileirado: action={action} id={queue_item.id}")
    return queue_item


async def process_sync_queue(session: AsyncSession, odoo: OdooClient) -> Dict[str, int]:
    """
    Processa todos os itens PENDING ou FAILED (com retries disponíveis) da fila.

    Retorna um resumo: {"processed": N, "failed": N, "skipped": N}
    """
    stmt = (
        select(SyncQueue)
        .where(SyncQueue.status.in_(["PENDING", "FAILED"]))
        .where(SyncQueue.retry_count < SyncQueue.max_retries)
        .order_by(SyncQueue.created_at.asc())
        .limit(50)  # Processa em lotes de 50 para não bloquear o event loop
    )
    result = await session.execute(stmt)
    items = result.scalars().all()

    summary = {"processed": 0, "failed": 0, "skipped": 0}

    for item in items:
        item.status = "PROCESSING"
        item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(item)
        await session.commit()

        try:
            payload = json.loads(item.payload)
            await _dispatch_action(odoo, item.action, payload)

            item.status = "COMPLETED"
            item.processed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            item.last_error = None
            summary["processed"] += 1
            logger.info(f"[SyncQueue] Concluído: action={item.action} id={item.id}")

        except Exception as e:
            item.retry_count += 1
            item.last_error = str(e)[:500]  # Limita tamanho do erro
            is_final_failure = item.retry_count >= item.max_retries
            item.status = "FAILED" if is_final_failure else "PENDING"

            if is_final_failure:
                summary["failed"] += 1
                logger.error(
                    f"[SyncQueue] Falha definitiva após {item.retry_count} tentativas: "
                    f"action={item.action} id={item.id} | erro: {e}"
                )
            else:
                summary["skipped"] += 1
                logger.warning(
                    f"[SyncQueue] Tentativa {item.retry_count}/{item.max_retries} falhou: "
                    f"action={item.action} id={item.id} | erro: {e}"
                )

        item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        session.add(item)
        await session.commit()

    return summary


async def _dispatch_action(odoo: OdooClient, action: str, payload: Dict[str, Any]) -> None:
    """
    Despacha uma ação para o Odoo.
    Lança exceção em caso de falha — o caller (process_sync_queue) trata o retry.
    """
    if action == "pause_workorder":
        workorder_id = payload["workorder_id"]
        res = await odoo.pause_workorder(workorder_id)
        if not res.get("ok"):
            raise Exception(f"pause_workorder falhou: {res.get('error', 'sem detalhe')}")

    elif action == "resume_workorder":
        workorder_id = payload["workorder_id"]
        res = await odoo.resume_workorder(workorder_id)
        if not res.get("ok"):
            raise Exception(f"resume_workorder falhou: {res.get('error', 'sem detalhe')}")

    elif action == "post_chatter":
        production_id = payload["production_id"]
        body = payload["body"]
        ok = await odoo.post_chatter_message(production_id, body)
        if not ok:
            raise Exception(f"post_chatter falhou para production_id={production_id}")

    elif action == "create_activity":
        production_id = payload["production_id"]
        note = payload.get("note", "")
        user_id = payload.get("user_id")
        activity_id = await odoo.create_andon_activity(production_id, note, user_id)
        if not activity_id:
            raise Exception(f"create_activity falhou para production_id={production_id}")

    elif action == "close_activities":
        activity_ids = payload["activity_ids"]
        if not activity_ids:
            return  # Nada a fechar — não é erro
        ok = await odoo.close_activities(activity_ids)
        if not ok:
            raise Exception(f"close_activities falhou para ids={activity_ids}")

    else:
        # Ação desconhecida — não deve chegar aqui se add_to_sync_queue validar
        raise Exception(f"Ação desconhecida na SyncQueue: '{action}'")


async def get_queue_stats(session: AsyncSession) -> Dict[str, Any]:
    """
    Retorna estatísticas da fila de sincronização para monitoramento.
    Útil para health checks e alertas operacionais.
    """
    from sqlalchemy import func

    stmt = (
        select(SyncQueue.status, func.count(SyncQueue.id).label("count"))
        .group_by(SyncQueue.status)
    )
    result = await session.execute(stmt)
    rows = result.all()

    stats = {row[0]: row[1] for row in rows}
    pending = stats.get("PENDING", 0)
    failed = stats.get("FAILED", 0)

    return {
        "pending": pending,
        "processing": stats.get("PROCESSING", 0),
        "completed": stats.get("COMPLETED", 0),
        "failed": failed,
        "total_active": pending + failed,
        "alert": (pending + failed) > 10,  # Alerta se fila acumular mais de 10 itens
    }
