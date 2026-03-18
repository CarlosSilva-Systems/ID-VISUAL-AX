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
        record.updated_at = datetime.now(timezone.utc)
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
                ['date_finished', '=', False]
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
                "obra": normalize_label(p_info.get('x_studio_nome_da_obra') or "Sem Obra"),
                "fabrication": normalize_label(p_info.get('name') or "---"),
                "mo_name": normalize_label(f"{p_info.get('x_studio_nome_da_obra') or '---'} | {p_info.get('name') or '---'}"),
                "date_start": wo.get('date_start'),
                "state": wo.get('state'),
                "user_name": normalize_label(wo.get('user_id'))
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
            
            # --- Regra de Precedência ---
            red_calls = [c for c in active_calls if c.color == "RED"]
            yellow_stop_calls = [c for c in active_calls if c.color == "YELLOW" and c.is_stop]
            yellow_soft_calls = [c for c in active_calls if c.color == "YELLOW" and not c.is_stop]
            
            status_color = "cinza"
            if red_calls:
                status_color = "vermelho"
            elif yellow_stop_calls:
                status_color = "amarelo"
            elif yellow_soft_calls:
                # Amarelo Suave: se estiver produzindo (progress), prevalece o verde como fundo
                # mas mantemos a flag para o frontend mostrar o ícone/alerta
                status_color = "amarelo_suave" if enriched["current"] else "amarelo"
            elif enriched["current"]:
                status_color = "verde"
            elif enriched["planned"]:
                status_color = "cinza" # Ou algum status de "preparado"
            
            # Se o Odoo diz que está pausado mas não temos chamado bloqueante, 
            # forçamos cinza (Produção Parada)
            if status_color == "verde" and enriched["current"] and enriched["current"]["state"] in ["pause", "pending"]:
                status_color = "cinza"

            current_mo = enriched["current"]["mo_name"] if enriched["current"] else "Sem fabricação em andamento"
            owner_name = enriched["current"]["user_name"] if enriched["current"] else "Sem responsável definido"
            started_at = enriched["current"]["date_start"] if enriched["current"] else None

            if started_at and isinstance(started_at, str) and ' ' in started_at:
                started_at = started_at.replace(' ', 'T') + 'Z'

            response.append({
                "id": wc_id,
                "name": normalize_label(wc["name"]),
                "code": normalize_label(wc.get("code", "")),
                "status": status_color,
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
            call.updated_at = datetime.now(timezone.utc)
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

    # 1. Integração Odoo via Background Tasks para não travar a UI
    async def process_odoo_integration(call_id: int, req: AndonCallCreate):
        from app.db.session import async_session_factory
        from app.services.odoo_client import OdooClient
        
        local_odoo = OdooClient(
            url=settings.ODOO_URL,
            db=settings.ODOO_DB,
            auth_type=settings.ODOO_AUTH_TYPE,
            login=settings.ODOO_LOGIN,
            secret=settings.ODOO_PASSWORD
        )
        try:
            async with async_session_factory() as local_session:
                stmt_call = select(AndonCall).where(AndonCall.id == call_id)
                res = await local_session.execute(stmt_call)
                local_call = res.scalars().first()
                if not local_call:
                    return

                if req.color == "YELLOW" and req.category == "Material":
                    picking_type_id = settings.ANDON_INTERNAL_PICKING_TYPE_ID
                    if picking_type_id and req.mo_id:
                        res_picking = await local_odoo.create_internal_picking(0, req.mo_id, req.workcenter_name, local_call.id, picking_type_id)
                        if res_picking["path"] == "odoo_picking":
                            local_call.odoo_picking_id = res_picking["picking_id"]
                            await local_odoo.post_chatter_message(req.mo_id, f"📦 <b>Andon Amarelo</b>: {req.reason} (Chamado #{local_call.id})")
                    
                    if req.is_stop and req.mo_id:
                        wo = await local_odoo.get_active_workorder(req.workcenter_id, settings.ANDON_WO_STATES)
                        if wo:
                            await add_to_sync_queue(local_session, "pause_workorder", {"workorder_id": wo["id"]})
                            await process_sync_queue(local_session, local_odoo)

                elif req.color == "RED":
                    if req.mo_id:
                        wo = await local_odoo.get_active_workorder(req.workcenter_id, settings.ANDON_WO_STATES)
                        if wo:
                            await add_to_sync_queue(local_session, "pause_workorder", {"workorder_id": wo["id"]})
                            await process_sync_queue(local_session, local_odoo)
                            
                            local_call.odoo_activity_id = await local_odoo.create_andon_activity(req.mo_id, req.reason, settings.ANDON_ENGINEERING_USER_ID)
                            await local_odoo.post_chatter_message(req.mo_id, f"🔴 <b>Andon Vermelho</b>: {req.reason} (Chamado #{local_call.id})")
                
                await local_session.commit()
        except Exception as e:
            request_id = str(uuid.uuid4())[:8]
            logger.exception(f"Error in background Odoo integration for call {call_id} [ref:{request_id}]: {e}")
        finally:
            await local_odoo.close()

    background_tasks.add_task(process_odoo_integration, call.id, req)

    await update_or_create_status(session, req.workcenter_id, req.workcenter_name, req.color.lower(), req.triggered_by)
    update_sync_version("andon_version")
    await session.commit()
    return call

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
    call.updated_at = datetime.now(timezone.utc)
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

        # 3. Mapear e Enriquecer
        tv_data = []
        for wc in odoo_wcs:
            wc_id = wc["id"]
            local_status = local_statuses.get(wc_id, "cinza")
            active_calls = wc_calls_map.get(wc_id, [])
            
            # Decisão de status para TV: se houver chamado aberto, reflete a cor do chamado mais crítico
            if active_calls:
                is_red = any(c.color == "RED" for c in active_calls)
                status_color = "vermelho" if is_red else "amarelo"
            else:
                status_color = local_status

            tv_data.append({
                "id": wc_id,
                "name": normalize_label(wc["name"]),
                "code": normalize_label(wc.get("code", "")),
                "status": status_color,
                "active_calls_count": len(active_calls)
            })
            
        return tv_data
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
