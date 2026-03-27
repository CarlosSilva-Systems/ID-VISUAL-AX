from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta, timezone
import uuid
from pydantic import BaseModel, ConfigDict

from app.api.deps import get_session, get_odoo_client
from app.core.config import settings
from app.models.andon import AndonStatus, AndonEvent, AndonMaterialRequest, AndonCall, SyncQueue
from app.models.id_request import IDRequest, IDRequestStatus
from app.models.manufacturing import ManufacturingOrder
from app.services.odoo_utils import normalize_label
from app.services.sync_service import add_to_sync_queue, process_sync_queue

import logging
import traceback
import json
logger = logging.getLogger(__name__)

router = APIRouter()

def _build_mo_name(p_info: dict) -> str:
    """Monta o nome da fabricação no formato 'Obra | MO' ou só um deles se o outro faltar."""
    obra = normalize_label(p_info.get('x_studio_nome_da_obra') or "")
    mo   = normalize_label(p_info.get('name') or "")
    if obra and mo:
        return f"{obra} | {mo}"
    return obra or mo or "Sem fabricação"

# --- Schemas ---

class TriggerAmareloRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workcenter_id: int
    workorder_id: int
    production_id: int
    workcenter_name: str
    triggered_by: str

class TriggerVermelhoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workcenter_id: int
    workorder_id: int
    production_id: int
    workcenter_name: str
    reason: str
    triggered_by: str

class TriggerCinzaVerdeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
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
    """
    Retorna a lista de workcenters enriquecida com status, produção atual e planejamento.
    """
    try:
        # 1. Buscar Workcenters do Odoo
        odoo_wcs = await odoo.get_workcenters()
        
        # 2. Status locais do SQLite (vermelho/amarelo manual)
        stmt = select(AndonStatus)
        result = await session.execute(stmt)
        local_statuses = {s.workcenter_odoo_id: s.status for s in result.scalars().all()}

        # 3. Buscar Chamados Ativos para detectar is_stop
        stmt_active_calls = select(AndonCall).where(AndonCall.status != "RESOLVED")
        res_active_calls = await session.execute(stmt_active_calls)
        all_active_calls = res_active_calls.scalars().all()
        wc_calls_map = {}
        for c in all_active_calls:
            wc_calls_map.setdefault(c.workcenter_id, []).append(c)

        # 4. Buscar Ordens de Fabricação Ativas e Planejadas
        all_wos = await odoo.search_read(
            'mrp.workorder',
            domain=[
                ['state', 'in', ['progress', 'ready', 'waiting', 'pending']],
            ],
            fields=['workcenter_id', 'user_id', 'production_id', 'name', 'date_start', 'state']
        )

        prod_ids = []
        for wo in all_wos:
            p_id = wo.get('production_id')
            if p_id and isinstance(p_id, (list, tuple)) and len(p_id) > 0:
                prod_ids.append(p_id[0])
            elif isinstance(p_id, int):
                prod_ids.append(p_id)
        
        prod_ids = list(set(prod_ids))
        production_map = {}
        if prod_ids:
            try:
                prods = await odoo.search_read(
                    'mrp.production',
                    domain=[['id', 'in', prod_ids]],
                    fields=['x_studio_nome_da_obra', 'name']
                )
                production_map = {p['id']: p for p in prods}
            except Exception as pe:
                logger.warning(f"Failed to fetch production details: {pe}")

        wc_data_enriched = {}
        for wo in all_wos:
            wc_id_val = wo.get('workcenter_id')
            if not wc_id_val: continue
            
            wc_id = wc_id_val[0] if isinstance(wc_id_val, (list, tuple)) else wc_id_val
            
            p_id_val = wo.get('production_id')
            p_id = p_id_val[0] if isinstance(p_id_val, (list, tuple)) else p_id_val
            p_info = production_map.get(p_id, {}) if p_id else {}
            
            wo_data = {
                "obra": normalize_label(p_info.get('x_studio_nome_da_obra') or ""),
                "fabrication": normalize_label(p_info.get('name') or ""),
                "mo_name": _build_mo_name(p_info),
                "date_start": wo.get('date_start'),
                "state": wo.get('state'),
                "user_name": normalize_label(wo.get('user_id')) or ""
            }

            if wc_id not in wc_data_enriched:
                wc_data_enriched[wc_id] = {"current": None, "planned": []}
            
            if wo['state'] == 'progress':
                wc_data_enriched[wc_id]["current"] = wo_data
            else:
                wc_data_enriched[wc_id]["planned"].append(wo_data)

        # 5. Buscar Fila de Sincronização para flags de pendência
        stmt_sync = select(SyncQueue).where(SyncQueue.status.in_(["PENDING", "FAILED", "PROCESSING"]))
        res_sync = await session.execute(stmt_sync)
        sync_items = res_sync.scalars().all()
        wc_sync_map = {}
        for item in sync_items:
            try:
                p = json.loads(item.payload)
                # Tentar mapear para workcenter_id (pode exigir busca se payload só tiver wo_id)
                if "workcenter_id" in p:
                    wc_sync_map[p["workcenter_id"]] = True
            except: pass

        # 6. Montar Resposta Final com Regras de Precedência
        response = []
        for wc in odoo_wcs:
            wc_id = wc["id"]
            active_calls = wc_calls_map.get(wc_id, [])
            enriched = wc_data_enriched.get(wc_id, {"current": None, "planned": []})
            
            # --- Regra de Precedência e Motivo ---
            red_calls = [c for c in active_calls if c.color == "RED"]
            yellow_stop_calls = [c for c in active_calls if c.color == "YELLOW" and c.is_stop]
            yellow_soft_calls = [c for c in active_calls if c.color == "YELLOW" and not c.is_stop]
            
            status_color = "cinza"
            status_reason = "Mesa disponível"
            
            if red_calls:
                status_color = "vermelho"
                status_reason = f"PARADA CRÍTICA: {red_calls[0].reason}"
            elif yellow_stop_calls:
                status_color = "amarelo"
                status_reason = f"ALERTA (PARADO): {yellow_stop_calls[0].reason}"
            elif yellow_soft_calls:
                status_color = "amarelo_suave" if enriched["current"] else "amarelo"
                status_reason = f"ALERTA: {yellow_soft_calls[0].reason}"
            elif enriched["current"]:
                status_color = "verde"
                status_reason = "Produção em andamento"
            elif enriched["planned"]:
                status_color = "cinza"
                status_reason = "Aguardando início de OP"
            
            if status_color == "verde" and enriched["current"] and enriched["current"]["state"] in ["pause", "pending"]:
                status_color = "cinza"
                status_reason = "Produção pausada no Odoo"

            current_mo = enriched["current"]["mo_name"] if enriched["current"] else "Sem fabricação em andamento"
            # owner_name: usa user_id da WO; se vazio, o workcenter já tem o nome do operador
            raw_owner = enriched["current"]["user_name"] if enriched["current"] else ""
            owner_name = raw_owner if raw_owner else (normalize_label(wc["name"]) if enriched["current"] else "Sem responsável definido")
            started_at = enriched["current"]["date_start"] if enriched["current"] else None

            if started_at and isinstance(started_at, str) and ' ' in started_at:
                started_at = started_at.replace(' ', 'T') + 'Z'

            response.append({
                "id": wc_id,
                "name": normalize_label(wc["name"]),
                "code": normalize_label(wc.get("code", "")),
                "status": status_color,
                "status_reason": status_reason,
                "owner_name": owner_name,
                "current_mo": current_mo,
                "started_at": started_at,
                "planned_mos": sorted(enriched["planned"], key=lambda x: str(x.get('date_start') or ""))[:5],
                "sync_pending": wc_sync_map.get(wc_id, False),
                "active_calls_count": len(active_calls)
            })
        
        return response

    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        error_msg = traceback.format_exc()
        logger.error(f"Error in get_workcenters_status [ref:{request_id}]: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Erro interno no servidor [ref: {request_id}]")

@router.get("/workcenters/{wc_id}/current_order")
async def get_current_order(
    wc_id: int,
    odoo: Any = Depends(get_odoo_client)
):
    try:
        wo = await odoo.get_active_workorder(wc_id, settings.ANDON_WO_STATES)
        return wo
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        logger.error(f"Error in get_current_order [ref:{request_id}]: {e}")
        raise HTTPException(status_code=500, detail=f"Erro interno no servidor [ref: {request_id}]")

@router.post("/trigger/{color}")
@limiter.limit("5/second")
async def trigger_andon_basic(
    request: Request,
    color: str,
    req: TriggerCinzaVerdeRequest,
    session: AsyncSession = Depends(get_session)
):
    """
    Endpoint para acionamentos básicos (verde/cinza) que não geram chamados estruturados,
    ou para retornar um posto ao estado normal.
    """
    from app.api.api_v1.endpoints.sync import update_sync_version
    
    # 1. Atualizar o cache de status
    await update_or_create_status(
        session, 
        req.workcenter_id, 
        req.workcenter_name, 
        req.status, # 'verde' ou 'cinza'
        req.triggered_by
    )
    
    # 2. Se o status for verde, resolver chamados abertos para este workcenter
    if req.status == "verde":
        stmt = select(AndonCall).where(
            AndonCall.workcenter_id == req.workcenter_id,
            AndonCall.status != "RESOLVED"
        )
        result = await session.execute(stmt)
        active_calls = result.scalars().all()
        for call in active_calls:
            call.status = "RESOLVED"
            call.resolved_note = f"Resolvido por {req.triggered_by} via Produção Normal"
            call.updated_at = datetime.utcnow()
            session.add(call)
    
    update_sync_version("andon_version")
    await session.commit()
    
    return {"status": "ok", "message": f"Status alterado para {req.status}"}

class AndonCallCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
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
    model_config = ConfigDict(extra="forbid")
    status: str
    resolved_note: Optional[str] = None

@router.post("/calls")
@limiter.limit("5/second")
async def create_andon_call(
    request: Request,
    req: AndonCallCreate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client)
):
    from app.api.api_v1.endpoints.sync import update_sync_version

    try:
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

        # ── Integração Retrabalho ID Visual ──
        if req.category == "ID Visual" and req.mo_id:
            try:
                from app.models.analytics import RevisaoIDVisual, MotivoRevisao
                stmt_mo = select(ManufacturingOrder).where(ManufacturingOrder.odoo_id == req.mo_id)
                res_mo = await session.execute(stmt_mo)
                local_mo = res_mo.scalars().first()
                if local_mo:
                    stmt_idr = select(IDRequest).where(IDRequest.mo_id == local_mo.id).order_by(IDRequest.created_at.desc())
                    res_idr = await session.execute(stmt_idr)
                    id_request = res_idr.scalars().first()
                    if id_request:
                        mapped_motivo = MotivoRevisao.OUTRO
                        reason_lower = (req.reason or "").lower()
                        if "informa" in reason_lower or "incorret" in reason_lower:
                            mapped_motivo = MotivoRevisao.INFORMACAO_INCORRETA
                        elif "falta" in reason_lower or "componente" in reason_lower:
                            mapped_motivo = MotivoRevisao.FALTA_COMPONENTE
                        elif "diagrama" in reason_lower:
                            mapped_motivo = MotivoRevisao.ERRO_DIAGRAMACAO
                        elif "especifica" in reason_lower or "mudança" in reason_lower:
                            mapped_motivo = MotivoRevisao.MUDANCA_ESPECIFICACAO
                        revisao = RevisaoIDVisual(
                            id_visual_id=id_request.id,
                            motivo=mapped_motivo,
                            revisao_solicitada_em=datetime.utcnow()
                        )
                        session.add(revisao)
                        await session.commit()
            except Exception as idv_err:
                logger.warning(f"ID Visual integration skipped: {idv_err}")

        # ── Integração Odoo em background ──
        async def _odoo_integration(call_id: int):
            from app.db.session import async_session_factory
            from app.services.odoo_client import OdooClient
            local_odoo = OdooClient(
                url=settings.ODOO_URL, db=settings.ODOO_DB,
                auth_type=settings.ODOO_AUTH_TYPE,
                login=settings.ODOO_LOGIN, secret=settings.ODOO_PASSWORD
            )
            try:
                async with async_session_factory() as s:
                    res_c = await s.execute(select(AndonCall).where(AndonCall.id == call_id))
                    local_call = res_c.scalars().first()
                    if not local_call:
                        return

                    wo = None
                    if req.mo_id:
                        try:
                            wo = await local_odoo.get_active_workorder(
                                req.workcenter_id,
                                settings.ANDON_WO_STATES or ["progress", "ready"]
                            )
                        except Exception:
                            pass

                    if req.color == "YELLOW":
                        if req.is_stop and wo:
                            await add_to_sync_queue(s, "pause_workorder", {"workorder_id": wo["id"]})
                            await process_sync_queue(s, local_odoo)
                        if req.mo_id:
                            stop_label = " — PRODUÇÃO PARADA" if req.is_stop else ""
                            try:
                                await local_odoo.post_chatter_message(
                                    req.mo_id,
                                    f"🟡 <b>Andon Amarelo</b>{stop_label}: {req.reason} (Chamado #{call_id}, por {req.triggered_by})"
                                )
                            except Exception:
                                pass

                    elif req.color == "RED":
                        if wo:
                            await add_to_sync_queue(s, "pause_workorder", {"workorder_id": wo["id"]})
                            await process_sync_queue(s, local_odoo)
                        if req.mo_id:
                            try:
                                eng_uid = settings.ANDON_ENGINEERING_USER_ID
                                if eng_uid:
                                    local_call.odoo_activity_id = await local_odoo.create_andon_activity(
                                        req.mo_id, req.reason, eng_uid
                                    )
                                await local_odoo.post_chatter_message(
                                    req.mo_id,
                                    f"🔴 <b>Andon Vermelho — PARADA CRÍTICA</b>: {req.reason} (Chamado #{call_id}, por {req.triggered_by})"
                                )
                            except Exception:
                                pass

                    await s.commit()
            except Exception as e:
                logger.exception(f"Odoo background integration failed for call {call_id}: {e}")
            finally:
                await local_odoo.close()

        background_tasks.add_task(_odoo_integration, call.id)

        await update_or_create_status(
            session, req.workcenter_id, req.workcenter_name,
            req.color.lower(), req.triggered_by
        )
        update_sync_version("andon_version")
        await session.commit()
        return call

    except Exception as e:
        req_id = str(uuid.uuid4())[:8]
        logger.exception(f"Error in create_andon_call [ref:{req_id}]: {e}")
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao criar chamado: {str(e)} [ref:{req_id}]")

@router.get("/calls", response_model=List[AndonCall])
async def list_andon_calls(
    active_only: bool = True,
    session: AsyncSession = Depends(get_session)
):
    stmt = select(AndonCall)
    if active_only:
        stmt = stmt.where(AndonCall.status != "RESOLVED")
    result = await session.execute(stmt)
    calls = result.scalars().all()
    sorted_calls = sorted(calls, key=lambda x: (0 if x.color == "RED" else 1, x.created_at))
    return sorted_calls

@router.patch("/calls/{call_id}/status")
async def update_call_status(
    call_id: int,
    req: AndonCallUpdate,
    session: AsyncSession = Depends(get_session)
):
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
        await update_or_create_status(session, call.workcenter_id, call.workcenter_name, "verde", "System")
    session.add(call)
    await session.commit()
    update_sync_version("andon_version")
    return call

@router.get("/tv-data")
async def get_tv_data(
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client)
):
    from app.api.api_v1.endpoints.sync import _sync_state
    import time
    try:
        # 1. Obter todos os Workcenters do Odoo
        odoo_wcs = await odoo.get_workcenters()
        
        # 2. Obter status locais do SQLite
        stmt = select(AndonStatus)
        result = await session.execute(stmt)
        local_statuses = {s.workcenter_odoo_id: s.status for s in result.scalars().all()}
        
        active_calls_stmt = select(AndonCall).where(AndonCall.status != "RESOLVED")
        res_active_calls = await session.execute(active_calls_stmt)
        all_active_calls = res_active_calls.scalars().all()
        wc_calls_map = {}
        for c in all_active_calls:
            wc_calls_map.setdefault(c.workcenter_id, []).append(c)

        # 3. Mapear Workcenters
        workcenters_data = []
        for wc in odoo_wcs:
            wc_id = wc["id"]
            local_status = local_statuses.get(wc_id, "cinza")
            active_calls = wc_calls_map.get(wc_id, [])
            
            if active_calls:
                is_red = any(c.color == "RED" for c in active_calls)
                status_color = "vermelho" if is_red else "amarelo"
            else:
                status_color = local_status

            workcenters_data.append({
                "id": wc_id,
                "name": normalize_label(wc["name"]),
                "code": normalize_label(wc.get("code", "")),
                "status": status_color,
                "active_calls_count": len(active_calls),
                "operational_status": "PRODUÇÃO LIGADA" if status_color == "verde" else "PARADO",
                "has_active_production": status_color in ["verde", "amarelo_suave"],
                "operator_name": "---", 
                "fabrication_code": "---",
                "obra_name": "---",
                "stage": "Livre",
                "started_at": None,
                "is_online": True,
                "sync_pending": False
            })
            
        # 4. Construir recent_events
        recent_date = datetime.utcnow() - timedelta(hours=24)
        stmt_calls = select(AndonCall).where(AndonCall.created_at >= recent_date)
        recent_calls = (await session.execute(stmt_calls)).scalars().all()
        
        stmt_idrs = select(IDRequest, ManufacturingOrder).join(ManufacturingOrder).where(
            (IDRequest.status != IDRequestStatus.CONCLUIDA) | 
            (IDRequest.updated_at >= recent_date)
        )
        recent_idrs_joined = (await session.execute(stmt_idrs)).all()
        
        id_reqs_data = []
        recent_events = []
        
        # Build Call Events
        for c in recent_calls:
            recent_events.append({
                "event_type": "CALL_OPENED",
                "color": c.color,
                "reason": c.reason,
                "workcenter_name": c.workcenter_name,
                "triggered_by": c.triggered_by,
                "created_at": c.created_at.isoformat() if c.created_at else None
            })
            if c.status == "IN_PROGRESS":
                recent_events.append({
                    "event_type": "CALL_IN_PROGRESS",
                    "reason": c.reason,
                    "workcenter_name": c.workcenter_name,
                    "triggered_by": c.triggered_by,
                    "created_at": c.updated_at.isoformat() if c.updated_at else None
                })
            if c.status == "RESOLVED":
                dur = (c.updated_at - c.created_at).total_seconds() / 60 if c.updated_at and c.created_at else 0
                recent_events.append({
                    "event_type": "CALL_RESOLVED",
                    "workcenter_name": c.workcenter_name,
                    "triggered_by": c.triggered_by,
                    "duration_minutes": dur,
                    "resolved_note": c.resolved_note,
                    "resolved_at": c.updated_at.isoformat() if c.updated_at else None
                })
        
        # Build IDRequests and ID Request Events
        for idr, mo in recent_idrs_joined:
            prod_status = "waiting"
            if idr.status == IDRequestStatus.CONCLUIDA:
                prod_status = "done"
            elif idr.status in [IDRequestStatus.EM_PROGRESSO, IDRequestStatus.EM_LOTE, IDRequestStatus.TRIAGEM]:
                prod_status = "in_progress"
                
            id_reqs_data.append({
                "id": str(idr.id),
                "mo_number": mo.name,
                "obra": mo.x_studio_nome_da_obra or "Sem Obra",
                "package_code": idr.package_code,
                "status": idr.status,
                "production_status": prod_status,
                "requester_name": idr.requester_name,
                "notes": idr.notes,
                "priority": idr.priority,
                "is_transferred": idr.transferred_to_queue,
                "created_at": idr.created_at.isoformat() if idr.created_at else None,
                "started_at": idr.started_at.isoformat() if idr.started_at else None,
                "finished_at": idr.finished_at.isoformat() if idr.finished_at else None,
            })
            
            recent_events.append({
                "event_type": "IDVISUAL_CREATED",
                "mo_number": mo.name,
                "requester_name": idr.requester_name,
                "source": idr.source,
                "created_at": idr.created_at.isoformat() if idr.created_at else None
            })
            if idr.transferred_to_queue and idr.transferred_at:
                recent_events.append({
                    "event_type": "IDVISUAL_TRANSFERRED",
                    "mo_number": mo.name,
                    "requester_name": idr.requester_name,
                    "created_at": idr.transferred_at.isoformat()
                })
            if idr.started_at:
                recent_events.append({
                    "event_type": "IDVISUAL_STARTED",
                    "mo_number": mo.name,
                    "requester_name": idr.requester_name,
                    "created_at": idr.started_at.isoformat()
                })
            if idr.status == IDRequestStatus.CONCLUIDA and idr.finished_at:
                dur = (idr.finished_at - (idr.started_at or idr.created_at)).total_seconds() / 60
                recent_events.append({
                    "event_type": "IDVISUAL_DONE",
                    "mo_number": mo.name,
                    "requester_name": idr.requester_name,
                    "notes": idr.notes,
                    "duration_minutes": dur,
                    "finished_at": idr.finished_at.isoformat()
                })

        def get_time(ev):
            return ev.get('finished_at') or ev.get('resolved_at') or ev.get('created_at') or ""
        recent_events.sort(key=get_time)
            
        calls_data = []
        for c in all_active_calls:
            calls_data.append({
                "id": c.id, "color": c.color, "category": c.category, "reason": c.reason,
                "description": c.description, "workcenter_id": c.workcenter_id,
                "workcenter_name": c.workcenter_name, "mo_id": c.mo_id, "status": c.status,
                "triggered_by": c.triggered_by, "assigned_team": c.assigned_team,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None
            })

        return {
            "version": _sync_state.get("andon_version", str(int(time.time()))),
            "workcenters": workcenters_data,
            "calls": calls_data,
            "id_requests": id_reqs_data,
            "recent_events": recent_events[-60:]
        }
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        logger.error(f"Error in get_tv_data [ref:{request_id}]: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Erro interno no servidor [ref: {request_id}]")

@router.get("/downtime")
async def get_downtime_report(
    session: AsyncSession = Depends(get_session)
):
    # Simplificado para o relatório consolidar por workcenter
    stmt = select(AndonCall)
    result = await session.execute(stmt)
    calls = result.scalars().all()
    
    report = {}
    for c in calls:
        if c.workcenter_name not in report:
            report[c.workcenter_name] = {"RED": 0, "YELLOW": 0, "total": 0}
        report[c.workcenter_name][c.color] += 1
        report[c.workcenter_name]["total"] += 1
        
    return report

@router.get("/history")
async def get_andon_history(
    session: AsyncSession = Depends(get_session),
    days: int = 7
):
    """Retorna o histórico de chamados Andon para o Dashboard BI."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    stmt = select(AndonCall).where(AndonCall.created_at >= cutoff)
    result = await session.execute(stmt)
    calls = result.scalars().all()
    
    # Agrupa por categoria para o gráfico
    stats = {}
    for c in calls:
        cat = c.category or "Outros"
        stats[cat] = stats.get(cat, 0) + 1
        
    return [{"label": k, "value": v} for k, v in stats.items()]

