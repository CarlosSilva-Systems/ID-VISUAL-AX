from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from pydantic import BaseModel, ConfigDict
from typing import Any, Optional
import time
from datetime import datetime, timezone

from app.api.deps import get_session, verify_webhook_secret, get_odoo_client
from app.models.andon import AndonCall, AndonStatus
from app.api.api_v1.endpoints.sync import update_sync_version

router = APIRouter()

class OdooWorkorderWebhook(BaseModel):
    """
    Schema flexível para webhooks do Odoo.
    
    Suporta dois formatos:
    1. Formato legado (manual): {"wo_id": 123, "new_state": "progress", "timestamp": 123.0, "company_id": 1}
    2. Formato Odoo 19 nativo: {"_id": 429, "_model": "mrp.workorder", "id": 429, "state": "done"}
    """
    model_config = ConfigDict(extra="allow")  # Permite campos extras do Odoo
    
    # Formato legado (manual)
    wo_id: Optional[int] = None
    new_state: Optional[str] = None
    timestamp: Optional[float] = None
    company_id: Optional[int] = None
    
    # Formato Odoo 19 nativo
    id: Optional[int] = None
    _id: Optional[int] = None
    state: Optional[str] = None
    _model: Optional[str] = None
    _action: Optional[str] = None

@router.post("/odoo/workorder", dependencies=[Depends(verify_webhook_secret)])
async def odoo_workorder_webhook(
    payload: OdooWorkorderWebhook,
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client)
):
    """
    Recebe atualizações de estado do Odoo via Webhook.
    Implementa idempotência via timestamp e autorresolução de chamados.
    
    CRÍTICO: Sincroniza estado com ESP32 via MQTT para garantir que
    pausas/retomadas no Odoo sejam refletidas no botão físico.
    
    Suporta dois formatos de payload:
    - Formato legado (manual): {"wo_id": 123, "new_state": "progress", ...}
    - Formato Odoo 19 nativo: {"id": 429, "state": "done", "_model": "mrp.workorder", ...}
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # ── 0. Normalizar payload (detectar formato) ──────────────────────────────
    # Formato Odoo 19 nativo usa "id" e "state", formato legado usa "wo_id" e "new_state"
    if payload.id is not None and payload.state is not None:
        # Formato Odoo 19 nativo
        wo_id = payload.id
        new_state = payload.state
        logger.info(f"[Webhook] Formato Odoo 19 detectado: wo_id={wo_id} state={new_state}")
    elif payload.wo_id is not None and payload.new_state is not None:
        # Formato legado (manual)
        wo_id = payload.wo_id
        new_state = payload.new_state
        logger.info(f"[Webhook] Formato legado detectado: wo_id={wo_id} new_state={new_state}")
    else:
        raise HTTPException(
            status_code=400,
            detail="Payload inválido: esperado 'id'+'state' (Odoo 19) ou 'wo_id'+'new_state' (legado)"
        )
    
    # ── 1. Replay protection (apenas para formato legado com timestamp) ───────
    if payload.timestamp is not None:
        now = time.time()
        if payload.timestamp > now or abs(now - payload.timestamp) > 300:
            raise HTTPException(
                status_code=400,
                detail="Webhook timestamp inválido ou expirado"
            )
        
    # 1. Buscar a WO para identificar o workcenter
    # Nota: No futuro, o Odoo pode enviar o wc_id diretamente no payload
    wo_data = await odoo.search_read(
        "mrp.workorder",
        domain=[["id", "=", wo_id]],
        fields=["workcenter_id"],
        limit=1
    )
    
    if not wo_data:
        raise HTTPException(status_code=404, detail=f"Workorder {wo_id} not found in Odoo")
    
    wc_id = wo_data[0]["workcenter_id"][0]
    wc_name = wo_data[0]["workcenter_id"][1]

    # 2. Atualizar Cache de Status Local
    stmt_status = select(AndonStatus).where(AndonStatus.workcenter_odoo_id == wc_id)
    res_status = await session.execute(stmt_status)
    andon_status = res_status.scalars().first()
    
    # Mapeamento de estado Odoo para Cor Andon
    # Estados Odoo: ready, progress, done, cancel, pending, pause
    # Estados Andon: verde (progress), cinza (pause/pending/done/cancel)
    new_color = "verde" if new_state == "progress" else "cinza"
    mqtt_state = "GREEN" if new_state == "progress" else "GRAY"
    
    logger.info(f"[Webhook] WO {wo_id} → workcenter {wc_id} ({wc_name}) | state={new_state} → andon={new_color} mqtt={mqtt_state}")
    
    if andon_status:
        # Idempotência simples: só atualiza se o estado do Odoo for 'progress' 
        # ou se o status atual no App for condizente com a mudança.
        # Regra de Precedência: chamados ativos no App ainda podem sobrescrever 
        # a cor visual no dashboard, mas o estado de *referência* operacional muda.
        
        # Se mudou para progress, resolvemos chamados
        if new_state == "progress":
            andon_status.status = "verde"
            
            # Autorresolução de chamados bloqueantes
            stmt_calls = select(AndonCall).where(
                AndonCall.workcenter_id == wc_id,
                AndonCall.status != "RESOLVED"
            )
            res_calls = await session.execute(stmt_calls)
            active_calls = res_calls.scalars().all()
            
            for call in active_calls:
                call.status = "RESOLVED"
                call.resolved_note = "Chamado resolvido automaticamente: Produção retomada no Odoo."
                call.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                session.add(call)
                
                # Opcional: Log no Odoo Chatter via BackgroundTask ou direto
                if call.mo_id:
                    try:
                        await odoo.post_chatter_message(
                            call.mo_id, 
                            f"✅ <b>Andon</b>: Chamado #{call.id} resolvido automaticamente pelo sistema (Início de Produção)."
                        )
                    except Exception as e:
                        # Não falhar o webhook se o chatter falhar
                        logger.warning(f"[Webhook] Falha ao postar chatter para MO {call.mo_id}: {e}")

        elif new_state in ["pause", "pending"]:
            # Se pausou no Odoo e não temos chamado vermelho/amarelo bloqueante,
            # o status de referência vai para cinza.
            # Salvar estado anterior para permitir retomada correta
            if andon_status.status != "cinza":
                # Salvar estado anterior no campo updated_by com prefixo "prev:"
                andon_status.updated_by = f"prev:{andon_status.status}"
            andon_status.status = "cinza"
        
        elif new_state in ["done", "cancel"]:
            # WO finalizada ou cancelada → mesa fica disponível (cinza)
            andon_status.status = "cinza"
            if not andon_status.updated_by or not andon_status.updated_by.startswith("prev:"):
                andon_status.updated_by = "Odoo Sync (WO finalizada)"

        andon_status.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if not andon_status.updated_by or not andon_status.updated_by.startswith("prev:"):
            andon_status.updated_by = "Odoo Sync"
        session.add(andon_status)

    await session.commit()
    update_sync_version("andon_version")
    
    # 3. CRÍTICO: Sincronizar estado com ESP32 via MQTT
    # Garante que o botão físico reflete o estado atual do Odoo
    from app.services.mqtt_service import send_andon_state_by_workcenter
    await send_andon_state_by_workcenter(wc_id, mqtt_state)
    
    logger.info(f"[Webhook] Processado com sucesso: WO {wo_id} → workcenter {wc_id} → MQTT {mqtt_state}")
    
    return {"status": "ok", "processed": True, "workcenter_id": wc_id, "new_state": mqtt_state, "wo_id": wo_id}
