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
    model_config = ConfigDict(extra="forbid")
    wo_id: int
    new_state: str
    timestamp: float
    company_id: int

@router.post("/odoo/workorder", dependencies=[Depends(verify_webhook_secret)])
async def odoo_workorder_webhook(
    payload: OdooWorkorderWebhook,
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client)
):
    """
    Recebe atualizações de estado do Odoo via Webhook.
    Implementa idempotência via timestamp e autorresolução de chamados.
    """
    # 0. Replay protection — rejeita timestamps expirados OU no futuro
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
        domain=[["id", "=", payload.wo_id]],
        fields=["workcenter_id"],
        limit=1
    )
    
    if not wo_data:
        raise HTTPException(status_code=404, detail="Workorder not found in Odoo")
    
    wc_id = wo_data[0]["workcenter_id"][0]
    wc_name = wo_data[0]["workcenter_id"][1]

    # 2. Atualizar Cache de Status Local
    stmt_status = select(AndonStatus).where(AndonStatus.workcenter_odoo_id == wc_id)
    res_status = await session.execute(stmt_status)
    andon_status = res_status.scalars().first()
    
    # Mapeamento simples de estado Odoo para Cor Andon
    new_color = "verde" if payload.new_state == "progress" else "cinza"
    
    if andon_status:
        # Idempotência simples: só atualiza se o estado do Odoo for 'progress' 
        # ou se o status atual no App for condizente com a mudança.
        # Regra de Precedência: chamados ativos no App ainda podem sobrescrever 
        # a cor visual no dashboard, mas o estado de *referência* operacional muda.
        
        # Se mudou para progress, resolvemos chamados
        if payload.new_state == "progress":
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
                call.updated_at = datetime.now(timezone.utc)
                session.add(call)
                
                # Opcional: Log no Odoo Chatter via BackgroundTask ou direto
                await odoo.post_chatter_message(
                    call.mo_id, 
                    f"✅ <b>Andon</b>: Chamado #{call.id} resolvido automaticamente pelo sistema (Início de Produção)."
                ) if call.mo_id else None

        elif payload.new_state in ["pause", "pending"]:
            # Se pausou no Odoo e não temos chamado vermelho/amarelo bloqueante,
            # o status de referência vai para cinza.
            andon_status.status = "cinza"

        andon_status.updated_at = datetime.now(timezone.utc)
        andon_status.updated_by = "Odoo Sync"
        session.add(andon_status)

    await session.commit()
    update_sync_version("andon_version")
    
    return {"status": "ok", "processed": True}
