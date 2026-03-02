from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from typing import Any, List, Optional
from datetime import datetime
from pydantic import BaseModel

from app.api.deps import get_session
from app.api.api_v1.endpoints.odoo import get_odoo_client
from app.core.config import settings
from app.models.andon import AndonStatus, AndonEvent, AndonMaterialRequest

router = APIRouter()

# --- Schemas ---

class TriggerAmareloRequest(BaseModel):
    workcenter_id: int
    workorder_id: int
    production_id: int
    workcenter_name: str
    triggered_by: str

class TriggerVermelhoRequest(BaseModel):
    workcenter_id: int
    workorder_id: int
    production_id: int
    workcenter_name: str
    reason: str
    triggered_by: str

class TriggerCinzaVerdeRequest(BaseModel):
    workcenter_id: int
    workcenter_name: str
    status: str  # verde | cinza
    triggered_by: str
    workorder_id: Optional[int] = None
    production_id: Optional[int] = None

# --- Helpers ---

async def update_or_create_status(
    session: AsyncSession, wc_id: int, wc_name: str, status: str, user: str
):
    stmt = select(AndonStatus).where(AndonStatus.workcenter_odoo_id == wc_id)
    result = await session.execute(stmt)
    record = result.scalars().first()
    
    if not record:
        record = AndonStatus(
            workcenter_odoo_id=wc_id,
            workcenter_name=wc_name,
            status=status,
            updated_by=user
        )
        session.add(record)
    else:
        record.status = status
        record.updated_at = datetime.utcnow()
        record.updated_by = user
    
    await session.commit()

# --- Endpoints ---

@router.get("/workcenters")
async def get_workcenters_status(
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client)
):
    """Retorna a lista de workcenters do Odoo combinada com o AndonStatus do SQLite."""
    try:
        odoo_wcs = await odoo.get_workcenters()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    stmt = select(AndonStatus)
    result = await session.execute(stmt)
    local_statuses = {s.workcenter_odoo_id: s.status for s in result.scalars().all()}
    
    response = []
    for wc in odoo_wcs:
        response.append({
            "id": wc["id"],
            "name": wc["name"],
            "code": wc.get("code", ""),
            "status": local_statuses.get(wc["id"], "cinza")
        })
    return response

@router.get("/workcenters/{wc_id}/current_order")
async def get_current_order(
    wc_id: int,
    odoo: Any = Depends(get_odoo_client)
):
    """Retorna a WO ativa do workcenter, ou null."""
    try:
        wo = await odoo.get_active_workorder(wc_id, settings.ANDON_WO_STATES)
        return wo
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/trigger/amarelo")
async def trigger_amarelo(
    req: TriggerAmareloRequest,
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client)
):
    """Aciona status amarelo: cria AndonEvent e gera picking/material request."""
    # 1. Cria o evento preliminar para pegar o ID
    event = AndonEvent(
        workcenter_odoo_id=req.workcenter_id,
        workcenter_name=req.workcenter_name,
        workorder_odoo_id=req.workorder_id,
        production_odoo_id=req.production_id,
        status="amarelo",
        triggered_by=req.triggered_by
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    
    # 2. Tenta criar picking de estoque
    picking_type_id = settings.ANDON_INTERNAL_PICKING_TYPE_ID
    if not picking_type_id:
        raise HTTPException(status_code=500, detail="ANDON_INTERNAL_PICKING_TYPE_ID não configurado.")
        
    picking_res = await odoo.create_internal_picking(
        req.workorder_id, req.production_id, req.workcenter_name, event.id, picking_type_id
    )
    
    if picking_res["path"] == "odoo_picking":
        event.odoo_picking_id = picking_res["picking_id"]
        # Tracker obrigatório no chatter da MO
        body = (f"📦 <b>Requisição de Material — Andon</b><br>"
                f"Mesa: {req.workcenter_name} | WO: {req.workorder_id}<br>"
                f"Picking criado: <b>#{picking_res['picking_id']}</b> | Evento Andon: <b>#{event.id}</b>")
        await odoo.post_chatter_message(req.production_id, body)
    else:
        # Fallback para Material Request local
        mat_req = AndonMaterialRequest(
            event_id=event.id,
            workcenter_odoo_id=req.workcenter_id,
            workorder_odoo_id=req.workorder_id,
            production_odoo_id=req.production_id,
            note="Solicitação gerada via botão Amarelo (sem componentes mapeados)"
        )
        session.add(mat_req)
        await session.commit()
        await session.refresh(mat_req)
        event.material_request_id = mat_req.id
        
    await session.commit()
    
    # 3. Atualiza cache de status
    await update_or_create_status(session, req.workcenter_id, req.workcenter_name, "amarelo", req.triggered_by)
    
    return {
        "event_id": event.id,
        "status": "amarelo",
        "path": picking_res["path"],
        "picking_id": picking_res["picking_id"]
    }

@router.post("/trigger/vermelho")
async def trigger_vermelho(
    req: TriggerVermelhoRequest,
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client)
):
    """Aciona status vermelho: requer motivo, pausa WO, cria activity e discuss."""
    if not req.reason or not req.reason.strip():
        raise HTTPException(status_code=422, detail="Motivo é obrigatório para parada crítica.")
        
    if not settings.ANDON_CHANNEL_ID or not settings.ANDON_ENGINEERING_USER_ID:
        raise HTTPException(status_code=500, detail="Discuss/Eng configuration missing in .env")

    # 1. Cria o evento preliminar
    event = AndonEvent(
        workcenter_odoo_id=req.workcenter_id,
        workcenter_name=req.workcenter_name,
        workorder_odoo_id=req.workorder_id,
        production_odoo_id=req.production_id,
        status="vermelho",
        reason=req.reason,
        triggered_by=req.triggered_by
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    
    # 2. Pausa a Workorder
    pause_res = await odoo.pause_workorder(req.workorder_id)
    event.pause_ok = pause_res["ok"]
    event.pause_method = pause_res["method_used"]
    
    # 3. Cria Activity para engenharia
    activity_id = await odoo.create_andon_activity(
        req.production_id, req.reason, settings.ANDON_ENGINEERING_USER_ID
    )
    event.odoo_activity_id = activity_id
    await session.commit()
    
    # 4. Posta no Discuss
    msg = f"🔴 <b>PARADA CRÍTICA</b> — {req.workcenter_name} | WO {req.workorder_id} | Motivo: {req.reason} | Evento #{event.id}"
    discuss_ok = await odoo.post_discuss_message(settings.ANDON_CHANNEL_ID, msg)
    
    # 5. Atualiza status
    await update_or_create_status(session, req.workcenter_id, req.workcenter_name, "vermelho", req.triggered_by)
    
    return {
        "event_id": event.id,
        "status": "vermelho",
        "pause_ok": pause_res["ok"],
        "pause_error": pause_res["error"],
        "activity_id": activity_id,
        "discuss_ok": discuss_ok
    }

@router.post("/trigger/basico")
async def trigger_basico(
    req: TriggerCinzaVerdeRequest,
    session: AsyncSession = Depends(get_session)
):
    """Aciona status Vede ou Cinza. (Não interage diretamente com OP do Odoo)"""
    if req.status not in ["verde", "cinza"]:
        raise HTTPException(status_code=422, detail="Status inválido para trigger básico.")
        
    event = AndonEvent(
        workcenter_odoo_id=req.workcenter_id,
        workcenter_name=req.workcenter_name,
        workorder_odoo_id=req.workorder_id,
        production_odoo_id=req.production_id,
        status=req.status,
        triggered_by=req.triggered_by
    )
    session.add(event)
    await session.commit()
    
    await update_or_create_status(session, req.workcenter_id, req.workcenter_name, req.status, req.triggered_by)
    
    return {"event_id": event.id, "status": req.status}

@router.get("/downtime")
async def get_downtime(
    session: AsyncSession = Depends(get_session)
):
    """Agrega intervalos vermelho->não-vermelho da disponibilidade (Downtime).
    Para simplicidade, avalia apenas hoje ou últimos 7 dias.
    Deduplica ocorrências vermelho->vermelho contíguas."""
    
    # Busca cache de nomes atuais
    stmt_wc = select(AndonStatus)
    res_wc = await session.execute(stmt_wc)
    wc_map = {s.workcenter_odoo_id: s.workcenter_name for s in res_wc.scalars().all()}
    
    # Busca eventos ordernados
    stmt = select(AndonEvent).order_by(AndonEvent.workcenter_odoo_id, AndonEvent.timestamp.asc())
    res = await session.execute(stmt)
    events = res.scalars().all()
    
    # Agrupa por WC
    wc_events = {}
    for ev in events:
        wc_events.setdefault(ev.workcenter_odoo_id, []).append(ev)
        
    results = []
    
    for wc_id, ev_list in wc_events.items():
        intervals = []
        interval_start = None
        
        for ev in ev_list:
            if ev.status == "vermelho" and interval_start is None:
                interval_start = ev.timestamp
            elif ev.status != "vermelho" and interval_start is not None:
                duration = (ev.timestamp - interval_start).total_seconds() / 60.0
                intervals.append({
                    "start": interval_start.isoformat(),
                    "end": ev.timestamp.isoformat(),
                    "duration_min": round(duration, 1),
                    "open": False
                })
                interval_start = None
                
        if interval_start is not None:
            now = datetime.utcnow()
            duration = (now - interval_start).total_seconds() / 60.0
            intervals.append({
                "start": interval_start.isoformat(),
                "end": now.isoformat(),
                "duration_min": round(duration, 1),
                "open": True
            })
            
        total_time = sum(i["duration_min"] for i in intervals)
        
        results.append({
            "workcenter_id": wc_id,
            "workcenter_name": wc_map.get(wc_id, f"Mesa {wc_id}"),
            "total_downtime_min": round(total_time, 1),
            "intervals": intervals
        })
        
    return results
