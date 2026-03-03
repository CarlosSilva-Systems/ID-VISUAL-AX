from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.api.deps import get_session
from app.api.api_v1.endpoints.odoo import get_odoo_client
from app.core.config import settings
from app.models.andon import AndonStatus, AndonEvent, AndonMaterialRequest, AndonCall
from app.models.id_request import IDRequest, IDRequestStatus
from app.models.manufacturing import ManufacturingOrder
from app.services.odoo_utils import normalize_label

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

# --- New Structured Endpoints ---

class AndonCallCreate(BaseModel):
    color: str
    category: str
    reason: str
    description: Optional[str] = None
    workcenter_id: int
    workcenter_name: str
    mo_id: Optional[int] = None
    triggered_by: str
    is_stop: bool = False

class AndonCallUpdate(BaseModel):
    status: str
    resolved_note: Optional[str] = None

@router.post("/calls")
async def create_andon_call(
    req: AndonCallCreate,
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client)
):
    """Cria um chamado Andon estruturado e dispara automações Odoo."""
    from app.api.api_v1.endpoints.sync import update_sync_version
    
    call = AndonCall(
        color=req.color,
        category=req.category,
        reason=req.reason,
        description=req.description,
        workcenter_id=req.workcenter_id,
        workcenter_name=req.workcenter_name,
        mo_id=req.mo_id,
        status="OPEN",
        triggered_by=req.triggered_by,
        is_stop=req.is_stop
    )
    session.add(call)
    await session.commit()
    await session.refresh(call)

    # Automação Odoo baseada na cor e categoria
    if req.color == "YELLOW" and req.category == "Material":
        # Tenta criar picking (mesma lógica do trigger antigo)
        picking_type_id = settings.ANDON_INTERNAL_PICKING_TYPE_ID
        if picking_type_id and req.mo_id:
            # Simula um workorder_id fixo ou busca se necessário (aqui mantemos simplificado)
            res = await odoo.create_internal_picking(0, req.mo_id, req.workcenter_name, call.id, picking_type_id)
            if res["path"] == "odoo_picking":
                call.odoo_picking_id = res["picking_id"]
                await odoo.post_chatter_message(req.mo_id, f"📦 <b>Andon Amarelo</b>: {req.reason} (Chamado #{call.id})")

    elif req.color == "RED":
        # Pausa MO e cria atividade
        if req.mo_id:
            # Busca a WO ativa para pausar
            wo = await odoo.get_active_workorder(req.workcenter_id, settings.ANDON_WO_STATES)
            if wo:
                pause_res = await odoo.pause_workorder(wo["id"])
                call.odoo_activity_id = await odoo.create_andon_activity(req.mo_id, req.reason, settings.ANDON_ENGINEERING_USER_ID)
                await odoo.post_chatter_message(req.mo_id, f"🔴 <b>Andon Vermelho</b>: {req.reason} (Chamado #{call.id})")

    # Atualiza o status visual legado para retrocompatibilidade
    await update_or_create_status(session, req.workcenter_id, req.workcenter_name, req.color.lower(), req.triggered_by)
    
    update_sync_version("andon_version")
    await session.commit()
    return call

@router.get("/calls", response_model=List[AndonCall])
async def list_andon_calls(
    active_only: bool = True,
    session: AsyncSession = Depends(get_session)
):
    """Lista chamados Andon ordenados por prioridade (Vermelho > Amarelo) e data."""
    stmt = select(AndonCall)
    if active_only:
        stmt = stmt.where(AndonCall.status != "RESOLVED")
    
    result = await session.execute(stmt)
    calls = result.scalars().all()
    
    # Ordenação: RED (0) < YELLOW (1) para priorizar vermelho, depois data
    sorted_calls = sorted(
        calls, 
        key=lambda x: (0 if x.color == "RED" else 1, x.created_at)
    )
    return sorted_calls

@router.patch("/calls/{call_id}/status")
async def update_call_status(
    call_id: int,
    req: AndonCallUpdate,
    session: AsyncSession = Depends(get_session)
):
    """Atualiza o status de um chamado (EM ATENDIMENTO, RESOLVIDO)."""
    from app.api.api_v1.endpoints.sync import update_sync_version
    
    stmt = select(AndonCall).where(AndonCall.id == call_id)
    result = await session.execute(stmt)
    call = result.scalars().first()
    
    if not call:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    
    call.status = req.status
    call.updated_at = datetime.utcnow()
    if req.status == "RESOLVED":
        call.resolved_note = req.resolved_note
        # Se resolveu, libera a mesa no status legado
        await update_or_create_status(session, call.workcenter_id, call.workcenter_name, "verde", "System")

    session.add(call)
    await session.commit()
    update_sync_version("andon_version")
    return call

# Manter endpoints legados por enquanto para não quebrar a UI durante a transição
# ... (os endpoints anteriores continuam aqui)

# ── TV Data Endpoint ─────────────────────────────────────────────

_tv_version: int = 0

def _bump_tv_version():
    global _tv_version
    _tv_version += 1

@router.get("/tv-data")
async def get_tv_data(
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client)
):
    """Endpoint consolidado para o Andon TV: workcenters, calls, recent_events, id_requests, version."""
    from app.api.api_v1.endpoints.sync import _sync_state as _sync_versions

    # --- Workcenters ---
    try:
        odoo_wcs = await odoo.get_workcenters()
    except Exception:
        odoo_wcs = []

    stmt_status = select(AndonStatus)
    res_status = await session.execute(stmt_status)
    local_statuses = {s.workcenter_odoo_id: s.status for s in res_status.scalars().all()}

    # --- Fetch active calls for is_stop detection ---
    stmt_active_calls = select(AndonCall).where(AndonCall.status != "RESOLVED")
    res_active_calls = await session.execute(stmt_active_calls)
    all_active_calls = res_active_calls.scalars().all()
    
    # Map workcenter_id -> list of active calls
    wc_calls_map = {}
    for c in all_active_calls:
        if c.workcenter_id not in wc_calls_map:
            wc_calls_map[c.workcenter_id] = []
        wc_calls_map[c.workcenter_id].append(c)

    # --- Fetch active workorders with detailed fields ---
    wc_production_info = {}
    try:
        # Check for WOs that are started (date_start not null) but not finished (date_finished null)
        # We also check state in standard active states
        # Fetch WOs that are either in progress or ready
        active_wos = await odoo.search_read(
            'mrp.workorder',
            domain=[
                ['date_finished', '=', False],
                ['state', 'in', ['progress', 'ready', 'waiting', 'pending']]
            ],
            fields=[
                'workcenter_id', 'user_id', 'production_id', 
                'name', 'date_start', 'state'
            ]
        )
        print(f"DEBUG_ANDON: Found {len(active_wos)} workorders")
        if active_wos:
            print(f"DEBUG_ANDON: First WO: {active_wos[0]}")
        # Collect unique production IDs for batch fetch
        prod_ids = list(set(
            wo['production_id'][0] 
            for wo in active_wos 
            if wo.get('production_id') and isinstance(wo['production_id'], (list, tuple))
        ))
        
        production_map = {}
        if prod_ids:
            try:
                prods = await odoo.search_read(
                    'mrp.production',
                    domain=[['id', 'in', prod_ids]],
                    fields=['x_studio_nome_da_obra', 'name'],
                    limit=len(prod_ids)
                )
                for p in prods:
                    production_map[p['id']] = p
            except Exception as pe:
                print(f"Warning: Failed to batch fetch production data: {pe}")

        for wo in active_wos:
            if not wo.get('workcenter_id'):
                continue
            
            wc_id = wo['workcenter_id'][0]
            
            # Deterministic Choice: Prioritize 'progress', then most recent date_start
            existing = wc_production_info.get(wc_id)
            if existing:
                # If existing is 'progress' and current is not, skip
                if existing['state'] == 'progress' and wo.get('state') != 'progress':
                    continue
                # If states are equal or both not 'progress', check date_start
                if wo.get('date_start') and existing.get('started_at'):
                    if wo['date_start'] < existing['started_at']:
                        continue
            

            # Normalized data
            p_id = wo['production_id'][0] if wo.get('production_id') and isinstance(wo['production_id'], (list, tuple)) else None
            p_data = production_map.get(p_id, {}) if p_id else {}
            
            obra_name = p_data.get('x_studio_nome_da_obra')
            if not obra_name or obra_name is False:
                obra_name = "---"
            
            mo_name = p_data.get('name') or (wo['production_id'][1] if wo.get('production_id') and isinstance(wo['production_id'], (list, tuple)) else "---")

            started_at = wo.get('date_start')
            if started_at and isinstance(started_at, str):
                if 'T' not in started_at:
                    started_at = started_at.replace(' ', 'T') + 'Z'

            wc_production_info[wc_id] = {
                "has_active_production": True,
                "operator_name": normalize_label(wo.get('user_id')),
                "fabrication_code": normalize_label(mo_name),
                "obra_name": normalize_label(obra_name),
                "stage": normalize_label(wo.get('name', "---")),
                "started_at": started_at,
                "state": wo.get('state')
            }
    except Exception as e:
        print(f"Warning: Failed to fetch detailed workorders: {e}")

    workcenters = []
    for wc in odoo_wcs:
        wc_id = wc["id"]
        prod_info = wc_production_info.get(wc_id, {
            "has_active_production": False,
            "operator_name": "---",
            "fabrication_code": "---",
            "obra_name": "---",
            "stage": "---",
            "started_at": None
        })

        # --- Status Logic (Text and Color) ---
        current_status_color = local_statuses.get(wc_id, "cinza")
        active_calls_for_wc = wc_calls_map.get(wc_id, [])
        
        # Priority 1: Parada Real (is_stop)
        has_stop_call = any(c.is_stop for c in active_calls_for_wc)
        
        operational_status = "SEM PRODUÇÃO"
        if has_stop_call:
            operational_status = "PARADO"
        elif prod_info["has_active_production"]:
            operational_status = "EM PRODUÇÃO"
        
        # Override color if in production and not RED/YELLOW
        if current_status_color not in ("amarelo", "vermelho"):
            if prod_info["has_active_production"]:
                current_status_color = "verde"
        
        workcenters.append({
            "id": wc_id,
            "name": normalize_label(wc["name"]),
            "code": normalize_label(wc.get("code", "")),
            "status": current_status_color, # Color indicator
            "operational_status": operational_status, # Text status
            "has_active_production": prod_info["has_active_production"],
            "operator_name": normalize_label(prod_info["operator_name"]),
            "fabrication_code": normalize_label(prod_info["fabrication_code"]),
            "obra_name": normalize_label(prod_info["obra_name"]),
            "stage": normalize_label(prod_info["stage"]),
            "started_at": prod_info["started_at"],
            "is_online": None # Enviar null conforme solicitado se não houver dado real (evita OFFLINE falso)
        })

    # --- Active Calls (OPEN + IN_PROGRESS) ---
    stmt_calls = select(AndonCall).where(AndonCall.status != "RESOLVED")
    res_calls = await session.execute(stmt_calls)
    active_calls = res_calls.scalars().all()
    active_calls_sorted = sorted(
        active_calls,
        key=lambda x: (0 if x.color == "RED" else 1, x.created_at)
    )
    calls_out = [
        {
            "id": c.id,
            "color": c.color,
            "category": normalize_label(c.category),
            "reason": normalize_label(c.reason),
            "description": normalize_label(c.description),
            "workcenter_id": c.workcenter_id,
            "workcenter_name": normalize_label(c.workcenter_name),
            "mo_id": c.mo_id,
            "status": c.status,
            "triggered_by": normalize_label(c.triggered_by),
            "assigned_team": normalize_label(c.assigned_team),
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in active_calls_sorted
    ]

    # --- Recent Events (last 50, last 24h) ---
    cutoff_24h = datetime.utcnow() - timedelta(hours=24)
    recent_events: List[Dict] = []

    # AndonCall events (all calls touched in last 24h including RESOLVED)
    stmt_recent_calls = (
        select(AndonCall)
        .where(AndonCall.updated_at >= cutoff_24h)
        .order_by(AndonCall.updated_at.desc())
        .limit(100)
    )
    res_rc = await session.execute(stmt_recent_calls)
    recent_calls = res_rc.scalars().all()

    for c in recent_calls:
        # Always emit CALL_OPENED
        recent_events.append({
            "event_type": "CALL_OPENED",
            "entity_id": c.id,
            "entity_type": "andon_call",
            "workcenter_name": normalize_label(c.workcenter_name),
            "color": c.color,
            "reason": normalize_label(c.reason),
            "triggered_by": normalize_label(c.triggered_by),
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "resolved_at": None,
            "resolved_note": None,
            "duration_minutes": None,
        })
        if c.status == "IN_PROGRESS":
            recent_events.append({
                "event_type": "CALL_IN_PROGRESS",
                "entity_id": c.id,
                "entity_type": "andon_call",
                "workcenter_name": normalize_label(c.workcenter_name),
                "color": c.color,
                "reason": normalize_label(c.reason),
                "triggered_by": normalize_label(c.triggered_by),
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "resolved_at": None,
                "resolved_note": None,
                "duration_minutes": None,
            })
        elif c.status == "RESOLVED":
            resolved_at = c.updated_at or datetime.utcnow()
            duration = None
            if c.created_at:
                duration = round((resolved_at - c.created_at).total_seconds() / 60.0, 1)
            recent_events.append({
                "event_type": "CALL_RESOLVED",
                "entity_id": c.id,
                "entity_type": "andon_call",
                "workcenter_name": normalize_label(c.workcenter_name),
                "color": c.color,
                "reason": normalize_label(c.reason),
                "triggered_by": normalize_label(c.triggered_by),
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "resolved_at": resolved_at.isoformat(),
                "resolved_note": normalize_label(c.resolved_note),
                "duration_minutes": duration,
            })

    # IDRequest events (manual, last 24h)
    stmt_recent_ir = (
        select(IDRequest, ManufacturingOrder)
        .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id)
        .where(IDRequest.source == "manual", IDRequest.updated_at >= cutoff_24h)
        .order_by(IDRequest.updated_at.desc())
        .limit(100)
    )
    res_ir = await session.execute(stmt_recent_ir)
    for req, mo in res_ir:
        s = req.status
        if hasattr(s, "value"):
            s = s.value
        if req.transferred_to_queue and s in ("nova", "triagem"):
            ev_type = "IDVISUAL_TRANSFERRED"
        elif s in ("nova", "triagem"):
            ev_type = "IDVISUAL_CREATED"
        elif s in ("em_lote", "em_progresso"):
            ev_type = "IDVISUAL_STARTED"
        elif s in ("concluida", "entregue"):
            ev_type = "IDVISUAL_DONE"
        else:
            ev_type = "IDVISUAL_CREATED"

        duration = None
        if ev_type == "IDVISUAL_DONE" and req.finished_at and req.created_at:
            duration = round((req.finished_at - req.created_at).total_seconds() / 60.0, 1)

        recent_events.append({
            "event_type": ev_type,
            "entity_id": str(req.id),
            "entity_type": "id_request",
            "mo_number": normalize_label(mo.name),
            "requester_name": normalize_label(req.requester_name),
            "notes": normalize_label(req.notes),
            "status": s,
            "created_at": req.created_at.isoformat() if req.created_at else None,
            "finished_at": req.finished_at.isoformat() if req.finished_at else None,
            "duration_minutes": duration,
        })

    # Sort all events by created_at desc, keep top 50
    recent_events.sort(
        key=lambda e: e.get("resolved_at") or e.get("finished_at") or e.get("created_at") or "",
        reverse=True
    )
    recent_events = recent_events[:50]

    # --- ID Requests for TV panels ---
    # All active (nova, triagem, em_lote, em_progresso) — no time limit
    stmt_active_ir = (
        select(IDRequest, ManufacturingOrder)
        .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id)
        .where(
            IDRequest.source == "manual",
            IDRequest.status.in_([s.value for s in [
                IDRequestStatus.NOVA, IDRequestStatus.TRIAGEM,
                IDRequestStatus.EM_LOTE, IDRequestStatus.EM_PROGRESSO
            ]])
        )
        .order_by(IDRequest.created_at.asc())
    )
    res_active_ir = await session.execute(stmt_active_ir)
    active_ir_rows = res_active_ir.all()

    # Last 20 concluded (concluida) — no time filter, by finished_at desc
    stmt_done_ir = (
        select(IDRequest, ManufacturingOrder)
        .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id)
        .where(
            IDRequest.source == "manual",
            IDRequest.status == IDRequestStatus.CONCLUIDA
        )
        .order_by(IDRequest.finished_at.desc())
        .limit(20)
    )
    res_done_ir = await session.execute(stmt_done_ir)
    done_ir_rows = res_done_ir.all()

    def _ir_to_dict(req: IDRequest, mo: ManufacturingOrder) -> Dict:
        s = req.status
        if hasattr(s, "value"):
            s = s.value
            
        # Determine TV production status
        # RULE: If transferred to Dashboard, it appears as "Trabalhando" (in_progress)
        if req.transferred_to_queue and s not in ("concluida", "entregue"):
            production_status = "in_progress"
        elif s in ("nova", "triagem"):
            production_status = "waiting"
        elif s in ("em_lote", "em_progresso"):
            production_status = "in_progress"
        else:
            production_status = "done"

        return {
            "id": str(req.id),
            "mo_number": normalize_label(mo.name),
            "obra": normalize_label(mo.x_studio_nome_da_obra or "Sem Obra"),
            "package_code": req.package_code if isinstance(req.package_code, str) else (req.package_code.value if req.package_code else "ID"),
            "status": s,
            "production_status": production_status,
            "is_transferred": req.transferred_to_queue,
            "requester_name": normalize_label(req.requester_name),
            "notes": normalize_label(req.notes),
            "priority": req.priority or "normal",
            "created_at": req.created_at.isoformat() if req.created_at else None,
            "started_at": req.started_at.isoformat() if req.started_at else None,
            "finished_at": req.finished_at.isoformat() if req.finished_at else None,
        }

    id_requests_out = (
        [_ir_to_dict(r, m) for r, m in active_ir_rows] +
        [_ir_to_dict(r, m) for r, m in done_ir_rows]
    )

    # Version — use sync version if available, else use our counter
    version = _sync_versions.get("andon_version", _tv_version)

    # --- Final Payload Construction (GUARANTEED KEYS) ---
    return {
        "workcenters": workcenters or [],
        "calls": calls_out or [],
        "recent_events": recent_events or [],
        "id_requests": id_requests_out or [],
        "version": version,
        "sync_versions": _sync_versions
    }


# ─────────────────────────────────────────────────────────────────

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
