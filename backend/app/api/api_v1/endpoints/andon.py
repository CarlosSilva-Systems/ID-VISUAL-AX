from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, WebSocket, WebSocketDisconnect
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from sqlalchemy import or_, and_
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta, timezone
import uuid
from pydantic import BaseModel, ConfigDict

from app.api.deps import get_session, get_odoo_client
from app.core.config import settings
from app.models.andon import AndonStatus, AndonCall, SyncQueue
from app.models.id_request import IDRequest, IDRequestStatus
from app.models.manufacturing import ManufacturingOrder
from app.services.odoo_utils import normalize_label
from app.services.sync_service import add_to_sync_queue, process_sync_queue
from app.services.justification_service import (
    compute_downtime_minutes,
    compute_requires_justification,
    validate_root_cause_category,
    ROOT_CAUSE_CATEGORIES,
)
from app.services.websocket_manager import ws_manager

import logging
import json
import traceback
logger = logging.getLogger(__name__)

router = APIRouter()

# ── WebSocket — Andon TV ──────────────────────────────────────────────────────

@router.websocket("/ws")
async def andon_websocket(websocket: WebSocket):
    """
    WebSocket dedicado para o Andon TV.
    O cliente conecta e fica aguardando mensagens do servidor.
    Quando qualquer dado do Andon muda (chamado, ID Visual, etc.), o servidor
    envia { "event": "andon_version_changed" } e o cliente faz fetch imediato
    do /tv-data em vez de esperar o próximo ciclo de polling.
    """
    await ws_manager.connect(websocket)
    try:
        while True:
            # Manter conexão viva — cliente pode enviar ping a qualquer momento
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

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
        record.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        record.updated_by = user
    
    await session.commit()
    
    # Enviar estado atualizado para ESP32 vinculado a este workcenter
    # Tanto o app quanto o ESP32 podem mudar o estado — ambos devem ficar sincronizados
    from app.models.esp_device import ESPDevice
    stmt_device = select(ESPDevice).where(ESPDevice.workcenter_id == wc_id)
    result_device = await session.execute(stmt_device)
    device = result_device.scalars().first()
    
    if device:
        # Mapear status do banco para estado MQTT (aceita português e inglês)
        status_map = {
            "verde": "GREEN",
            "green": "GREEN",
            "amarelo": "YELLOW",
            "amarelo_suave": "YELLOW",
            "yellow": "YELLOW",
            "vermelho": "RED",
            "red": "RED",
            "cinza": "GRAY",
            "gray": "GRAY"
        }
        mqtt_state = status_map.get(status, "GRAY")
        from app.services.mqtt_service import _send_andon_state
        await _send_andon_state(device.mac_address, mqtt_state)
        logger.info(f"Estado {mqtt_state} enviado para ESP32 {device.mac_address} (workcenter {wc_id})")

# --- Endpoints ---

@router.get("/workcenters")
@limiter.limit("10/minute")
async def get_workcenters_status(
    request: Request,
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client)
):
    """
    Retorna a lista de workcenters enriquecida com status, produção atual e planejamento.
    
    Otimizações:
    - Cache de 30 segundos (reduz carga no Odoo)
    - Queries paralelizadas (workcenters + workorders + productions)
    - Limit de 500 workorders (evita queries pesadas)
    - Rate limit de 10 req/min por cliente
    """
    from app.services.cache_service import cached
    
    @cached(ttl_seconds=30, key_prefix="workcenters")
    async def _fetch_workcenters_data(session_id: str, odoo_url: str):
        """Função interna cacheada para buscar dados do Odoo."""
        import asyncio
        
        # 1. Buscar dados do Odoo em paralelo (3 queries simultâneas)
        odoo_wcs_task = odoo.get_workcenters()
        all_wos_task = odoo.search_read(
            'mrp.workorder',
            domain=[
                ['state', 'in', ['progress', 'ready', 'waiting', 'pending']],
            ],
            fields=['workcenter_id', 'user_id', 'production_id', 'name', 'date_start', 'state'],
            limit=500  # Limit para evitar queries pesadas
        )
        
        # Executar em paralelo
        odoo_wcs, all_wos = await asyncio.gather(odoo_wcs_task, all_wos_task)
        
        # 2. Extrair production_ids e buscar detalhes
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
        
        return odoo_wcs, all_wos, production_map
    
    try:
        # Buscar dados cacheados (30s TTL)
        odoo_wcs, all_wos, production_map = await _fetch_workcenters_data(
            str(id(session)),  # Session ID para cache key
            settings.ODOO_URL  # URL para cache key
        )
        
        # 2. Status locais do banco (não cacheado — sempre fresh)
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

            # Status local gravado manualmente (ex: pausa via ESP32)
            local_status = local_statuses.get(wc_id, "cinza")
            is_manually_paused = local_status == "cinza"

            status_color = "cinza"
            status_reason = "Mesa disponível"

            # PAUSA tem precedência absoluta — se o operador pausou, mostra cinza
            # independente de chamados ativos (vermelho/amarelo ficam suspensos)
            if is_manually_paused:
                status_color = "cinza"
                status_reason = "Produção pausada"
            elif red_calls:
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
            
            # Fallback: WO pausada diretamente no Odoo
            if status_color == "verde" and enriched["current"] and enriched["current"]["state"] in ["pause", "pending"]:
                status_color = "cinza"
                status_reason = "Produção pausada no Odoo"

            current_mo = enriched["current"]["mo_name"] if enriched["current"] else "Sem fabricação em andamento"
            raw_owner = enriched["current"]["user_name"] if enriched["current"] else ""
            owner_name = raw_owner if raw_owner else (normalize_label(wc["name"]) if enriched["current"] else "Sem responsável definido")
            started_at = enriched["current"]["date_start"] if enriched["current"] else None

            # Quando pausado, não enviar started_at para o frontend parar o timer
            if status_color == "cinza":
                started_at = None

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
        logger.exception(f"Error in get_workcenters_status [ref:{request_id}]: {e}")
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
    resolved_calls: list = []
    if req.status == "verde":
        stmt = select(AndonCall).where(
            AndonCall.workcenter_id == req.workcenter_id,
            AndonCall.status != "RESOLVED"
        )
        result = await session.execute(stmt)
        active_calls = result.scalars().all()
        resolved_calls = []
        for call in active_calls:
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            call.status = "RESOLVED"
            call.resolved_note = f"Resolvido por {req.triggered_by} via Produção Normal"
            call.updated_at = now
            call.downtime_minutes = compute_downtime_minutes(call.created_at, now)
            session.add(call)
            resolved_calls.append(call)
    
    await session.commit()
    update_sync_version("andon_version")  # após commit — dados já persistidos

    # Invalidar cache de workcenters após mudança de status
    from app.services.cache_service import invalidate_cache_pattern
    await invalidate_cache_pattern("workcenters:")

    # Emitir WebSocket para chamados que requerem justificativa
    if req.status == "verde":
        for call in resolved_calls:
            if call.requires_justification:
                await ws_manager.broadcast("andon_justification_required", {
                    "call_id": call.id,
                    "workcenter_name": call.workcenter_name,
                    "color": call.color,
                    "reason": call.reason,
                    "downtime_minutes": call.downtime_minutes,
                })

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

class JustifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    root_cause_category: str
    root_cause_detail: str
    action_taken: str
    justified_by: str

class JustificationStats(BaseModel):
    total_pending: int
    by_color: dict
    oldest_pending_minutes: Optional[int]

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
        # Resolver chamados anteriores do mesmo workcenter antes de criar novo
        # Garante que app e ESP32 ficam sempre sincronizados — sem estados conflitantes
        stmt_prev = select(AndonCall).where(
            AndonCall.workcenter_id == req.workcenter_id,
            AndonCall.status != "RESOLVED"
        )
        res_prev = await session.execute(stmt_prev)
        prev_calls = res_prev.scalars().all()
        for prev_call in prev_calls:
            prev_call.status = "RESOLVED"
            prev_call.resolved_note = f"Substituído por novo acionamento {req.color} via app ({req.triggered_by})"
            prev_call.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.add(prev_call)

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
            is_stop=req.is_stop,
            requires_justification=compute_requires_justification(req.color, req.is_stop),
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
                            revisao_solicitada_em=datetime.now(timezone.utc).replace(tzinfo=None)
                        )
                        session.add(revisao)
                        await session.commit()
            except Exception as idv_err:
                logger.warning(f"ID Visual integration skipped: {idv_err}")

        # ── Integração Odoo em background ──
        async def _odoo_integration(call_id: int, triggered_by_mac: str | None):
            from app.db.session import async_session_factory
            from app.services.odoo_client import OdooClient
            from app.services.mqtt_service import notify_odoo_error
            local_odoo = OdooClient(
                url=settings.ODOO_URL, db=settings.ODOO_DB,
                auth_type=settings.ODOO_AUTH_TYPE,
                login=settings.ODOO_SERVICE_LOGIN, secret=settings.ODOO_SERVICE_PASSWORD
            )
            odoo_ok = True
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
                        except Exception as e:
                            logger.warning(f"[Andon Odoo] Falha ao buscar WO ativa para workcenter {req.workcenter_id}: {e}")
                            odoo_ok = False

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
                            except Exception as e:
                                logger.warning(f"[Andon Odoo] Falha ao postar chatter (YELLOW) para MO {req.mo_id}: {e}")
                                odoo_ok = False

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
                            except Exception as e:
                                logger.warning(f"[Andon Odoo] Falha ao postar chatter (RED) para MO {req.mo_id}: {e}")
                                odoo_ok = False

                    await s.commit()
            except Exception as e:
                odoo_ok = False
                logger.exception(f"[Andon Odoo] Falha na integração background para chamado {call_id}: {e}")
            finally:
                await local_odoo.close()

            # Notifica o ESP32 via MQTT se a integração Odoo falhou
            if not odoo_ok and triggered_by_mac:
                await notify_odoo_error(triggered_by_mac)

        # Resolver MAC do device que originou o chamado (se veio de ESP32)
        device_mac: str | None = None
        if req.triggered_by and req.triggered_by.startswith("ESP32"):
            try:
                from app.models.esp_device import ESPDevice
                stmt_dev = select(ESPDevice).where(ESPDevice.workcenter_id == req.workcenter_id)
                res_dev = await session.execute(stmt_dev)
                dev = res_dev.scalars().first()
                if dev:
                    device_mac = dev.mac_address
            except Exception:
                pass

        background_tasks.add_task(_odoo_integration, call.id, device_mac)

        await update_or_create_status(
            session, req.workcenter_id, req.workcenter_name,
            req.color.lower(), req.triggered_by
        )
        await session.commit()
        update_sync_version("andon_version")  # após commit — dados já persistidos
        
        # Invalidar cache de workcenters após criar chamado
        from app.services.cache_service import invalidate_cache_pattern
        await invalidate_cache_pattern("workcenters:")
        
        return call

    except Exception as e:
        req_id = str(uuid.uuid4())[:8]
        logger.exception(f"Error in create_andon_call [ref:{req_id}]: {e}")
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao criar chamado [ref:{req_id}]")

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

@router.get("/calls/pending-justification")
async def get_pending_justification(
    workcenter_id: Optional[int] = None,
    color: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client),
):
    """Retorna chamados resolvidos que requerem justificativa, enriquecidos com dados do Odoo."""
    stmt = select(AndonCall).where(
        AndonCall.requires_justification == True,
        AndonCall.justified_at == None,
        AndonCall.status == "RESOLVED",
    )
    if workcenter_id is not None:
        stmt = stmt.where(AndonCall.workcenter_id == workcenter_id)
    if color is not None:
        stmt = stmt.where(AndonCall.color == color)
    if from_date is not None:
        stmt = stmt.where(AndonCall.created_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(AndonCall.created_at <= to_date)
    stmt = stmt.order_by(AndonCall.created_at.asc())
    result = await session.execute(stmt)
    calls = result.scalars().all()

    if not calls:
        return []

    # Enriquecer com dados do Odoo: owner_name e work_type por workcenter
    wc_ids = list({c.workcenter_id for c in calls})
    wc_info: dict[int, dict] = {}

    def _extract_owner(user_val: Any, workcenter_val: Any = None) -> str:
        """Extrai nome do responsável.
        Tenta user_id primeiro; se vazio, usa o nome do workcenter como fallback
        (no Odoo desta empresa o workcenter_id[1] contém o nome do operador)."""
        # Tenta user_id primeiro
        if user_val and user_val is not False:
            if isinstance(user_val, (list, tuple)) and len(user_val) >= 2:
                name = normalize_label(str(user_val[1]))
                if name:
                    return name
            elif isinstance(user_val, str) and user_val.strip():
                return normalize_label(user_val)

        # Fallback: nome do workcenter (ex: [28, 'CASSIO HENRIQUE'] → 'CASSIO HENRIQUE')
        if workcenter_val and workcenter_val is not False:
            if isinstance(workcenter_val, (list, tuple)) and len(workcenter_val) >= 2:
                name = normalize_label(str(workcenter_val[1]))
                if name:
                    return name

        return '—'

    def _extract_work_type(wo_name: str) -> str:
        """Extrai tipo de montagem do campo name da WO — retorna o nome original se não mapear."""
        if not wo_name:
            return '—'
        name_lower = wo_name.lower()
        if 'pré' in name_lower or 'pre-' in name_lower or 'pre ' in name_lower:
            return 'Pré Montagem'
        if 'completo' in name_lower or 'complete' in name_lower or 'completa' in name_lower:
            return 'Completo'
        if 'montagem' in name_lower or 'assembly' in name_lower:
            return 'Montagem'
        # Retorna o nome original normalizado em vez de '—'
        cleaned = normalize_label(wo_name)
        return cleaned if cleaned else '—'

    def _extract_production_name(production_val: Any) -> str:
        """Extrai o nome da fabricação do campo production_id (ex: [1839, 'WH/FAB/01638'])."""
        if not production_val or production_val is False:
            return '—'
        if isinstance(production_val, (list, tuple)) and len(production_val) >= 2:
            name = normalize_label(str(production_val[1]))
            return name if name else '—'
        return '—'

    def _process_wos(wos: list, priority_states: list) -> None:
        """Processa lista de WOs e preenche wc_info priorizando estados específicos."""
        for wo in wos:
            wc_id_val = wo.get('workcenter_id')
            if not wc_id_val:
                continue
            wc_id_int = wc_id_val[0] if isinstance(wc_id_val, (list, tuple)) else wc_id_val
            wo_state = wo.get('state', '')
            is_priority = wo_state in priority_states

            # Só sobrescreve se: ainda não tem info OU esta WO tem estado prioritário
            if wc_id_int not in wc_info or is_priority:
                owner = _extract_owner(wo.get('user_id'), wo.get('workcenter_id'))
                work_type = _extract_work_type(wo.get('name') or '')
                production_name = _extract_production_name(wo.get('production_id'))
                wc_info[wc_id_int] = {
                    'owner_name': owner,
                    'work_type': work_type,
                    'production_name': production_name,
                }
                logger.debug(
                    f"WO enrich wc_id={wc_id_int} state={wo_state} "
                    f"owner={owner!r} work_type={work_type!r} "
                    f"production={production_name!r} wo_name={wo.get('name')!r}"
                )

    try:
        # Passagem 1: WOs em estados ativos (progress, ready, waiting, pending)
        active_states = ['progress', 'ready', 'waiting', 'pending']
        wos_active = await odoo.search_read(
            'mrp.workorder',
            domain=[
                ['workcenter_id', 'in', wc_ids],
                ['state', 'in', active_states],
            ],
            fields=['workcenter_id', 'user_id', 'name', 'state', 'production_id'],
            limit=500,
            order='write_date desc',
        )
        logger.info(f"Pendências enrich: {len(wos_active)} WOs ativas para wc_ids={wc_ids}")
        _process_wos(wos_active, priority_states=['progress'])

        # Passagem 2: Para workcenters sem info, busca WOs recentes (qualquer estado)
        missing_wc_ids = [wc_id for wc_id in wc_ids if wc_id not in wc_info]
        if missing_wc_ids:
            logger.info(f"Pendências enrich: buscando WOs recentes para wc_ids sem info: {missing_wc_ids}")
            wos_recent = await odoo.search_read(
                'mrp.workorder',
                domain=[
                    ['workcenter_id', 'in', missing_wc_ids],
                ],
                fields=['workcenter_id', 'user_id', 'name', 'state', 'production_id'],
                limit=200,
                order='write_date desc',
            )
            logger.info(f"Pendências enrich: {len(wos_recent)} WOs recentes encontradas")
            _process_wos(wos_recent, priority_states=['progress', 'done'])

        logger.info(f"Pendências enrich resultado: {wc_info}")

    except Exception as e:
        logger.error(f"Falha ao buscar dados Odoo para pendências: {e}", exc_info=True)

    # Montar resposta enriquecida
    enriched = []
    for call in calls:
        info = wc_info.get(call.workcenter_id, {})
        enriched.append({
            "id": call.id,
            "color": call.color,
            "category": call.category,
            "reason": call.reason,
            "workcenter_id": call.workcenter_id,
            "workcenter_name": call.workcenter_name,
            "owner_name": info.get('owner_name', '—'),
            "work_type": info.get('work_type', '—'),
            "production_name": info.get('production_name', '—'),
            "is_stop": call.is_stop,
            "status": call.status,
            "created_at": call.created_at.isoformat() if call.created_at else None,
            "updated_at": call.updated_at.isoformat() if call.updated_at else None,
            "downtime_minutes": call.downtime_minutes,
            "requires_justification": call.requires_justification,
            "justified_at": call.justified_at.isoformat() if call.justified_at else None,
            "justified_by": call.justified_by,
        })
    return enriched


@router.get("/calls/justification-stats", response_model=JustificationStats)
async def get_justification_stats(session: AsyncSession = Depends(get_session)):
    """Retorna estatísticas de chamados pendentes de justificativa."""
    stmt = select(AndonCall).where(
        AndonCall.requires_justification == True,
        AndonCall.justified_at == None,
        AndonCall.status == "RESOLVED",
    )
    result = await session.execute(stmt)
    pending = result.scalars().all()

    total_pending = len(pending)
    by_color = {"RED": 0, "YELLOW": 0}
    oldest_pending_minutes: Optional[int] = None

    for call in pending:
        if call.color in by_color:
            by_color[call.color] += 1
        if call.updated_at:
            minutes = int((datetime.now(timezone.utc).replace(tzinfo=None) - call.updated_at).total_seconds() // 60)
            if oldest_pending_minutes is None or minutes > oldest_pending_minutes:
                oldest_pending_minutes = minutes

    return JustificationStats(
        total_pending=total_pending,
        by_color=by_color,
        oldest_pending_minutes=oldest_pending_minutes,
    )


@router.patch("/calls/{call_id}/justify")
async def justify_call(
    call_id: int,
    req: JustifyRequest,
    session: AsyncSession = Depends(get_session),
):
    """Registra a justificativa de uma parada Andon."""
    stmt = select(AndonCall).where(AndonCall.id == call_id)
    result = await session.execute(stmt)
    call = result.scalars().first()

    if not call:
        raise HTTPException(status_code=404, detail=f"Chamado #{call_id} não encontrado")

    if not call.requires_justification:
        raise HTTPException(status_code=422, detail="Chamado não requer justificativa")

    if call.status != "RESOLVED":
        raise HTTPException(
            status_code=422,
            detail="Chamado precisa estar com status RESOLVED antes de ser justificado",
        )

    if call.justified_at is not None:
        raise HTTPException(status_code=409, detail="Chamado já foi justificado")

    if not validate_root_cause_category(req.root_cause_category):
        raise HTTPException(
            status_code=422,
            detail=f"Categoria de causa raiz inválida. Valores aceitos: {', '.join(sorted(ROOT_CAUSE_CATEGORIES))}",
        )

    call.root_cause_category = req.root_cause_category
    call.root_cause_detail = req.root_cause_detail
    call.action_taken = req.action_taken
    call.justified_by = req.justified_by
    call.justified_at = datetime.now(timezone.utc).replace(tzinfo=None)

    session.add(call)
    await session.commit()
    await session.refresh(call)

    await ws_manager.broadcast("andon_call_justified", {
        "call_id": call.id,
        "workcenter_name": call.workcenter_name,
        "justified_by": call.justified_by,
    })

    return call


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
    call.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    
    if req.status == "RESOLVED":
        call.resolved_note = req.resolved_note
        # Calcular downtime automaticamente ao resolver
        call.downtime_minutes = compute_downtime_minutes(call.created_at, call.updated_at)
        await update_or_create_status(session, call.workcenter_id, call.workcenter_name, "verde", "System")
    
    session.add(call)
    await session.commit()
    update_sync_version("andon_version")
    
    # Emitir WebSocket após commit para garantir dados persistidos
    if req.status == "RESOLVED" and call.requires_justification:
        await ws_manager.broadcast("andon_justification_required", {
            "call_id": call.id,
            "workcenter_name": call.workcenter_name,
            "color": call.color,
            "reason": call.reason,
            "downtime_minutes": call.downtime_minutes,
        })
    
    return call

@router.get("/tv-data")
async def get_tv_data(
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client),
):
    """
    Endpoint de dados para o Andon TV.
    Dados de status e chamados vêm do banco local (rápido e consistente).
    Nome do operador é enriquecido via Odoo (WOs ativas), com fallback para
    AndonStatus.updated_by caso o Odoo esteja indisponível.
    """
    from app.api.api_v1.endpoints.sync import _sync_state
    from fastapi.responses import JSONResponse
    import time

    def iso_utc(dt) -> str | None:
        """Converte datetime para ISO 8601 UTC com sufixo Z."""
        return dt.isoformat() + 'Z' if dt else None

    def _extract_operator(user_val: Any, workcenter_val: Any = None) -> str:
        """
        Extrai o nome do operador do campo user_id ou workcenter_id do Odoo.
        No Odoo desta empresa, workcenter_id[1] contém o nome do operador
        (ex: [28, 'CASSIO HENRIQUE']).
        """
        # Tenta user_id primeiro
        if user_val and user_val is not False:
            if isinstance(user_val, (list, tuple)) and len(user_val) >= 2:
                name = normalize_label(str(user_val[1]))
                if name:
                    return name
            elif isinstance(user_val, str) and user_val.strip():
                return normalize_label(user_val)

        # Fallback: workcenter_id[1] contém o nome do operador neste Odoo
        if workcenter_val and workcenter_val is not False:
            if isinstance(workcenter_val, (list, tuple)) and len(workcenter_val) >= 2:
                name = normalize_label(str(workcenter_val[1]))
                if name:
                    return name

        return ""

    try:
        # 1. Obter status locais do banco (sem Odoo)
        stmt = select(AndonStatus)
        result = await session.execute(stmt)
        all_statuses = result.scalars().all()
        local_statuses = {s.workcenter_odoo_id: s for s in all_statuses}

        # 2. Chamados ativos
        active_calls_stmt = select(AndonCall).where(AndonCall.status != "RESOLVED")
        res_active_calls = await session.execute(active_calls_stmt)
        all_active_calls = res_active_calls.scalars().all()
        wc_calls_map: dict = {}
        for c in all_active_calls:
            wc_calls_map.setdefault(c.workcenter_id, []).append(c)

        # 3. Buscar nomes de operadores via Odoo (WOs ativas nos workcenters conhecidos)
        #    Mesma lógica do /workcenters e /calls/pending-justification.
        #    Falha silenciosa — fallback para updated_by do AndonStatus.
        wc_ids = list(local_statuses.keys())
        odoo_operator_map: dict[int, str] = {}  # wc_id → nome do operador
        odoo_fabrication_map: dict[int, str] = {}  # wc_id → código de fabricação
        odoo_obra_map: dict[int, str] = {}  # wc_id → nome da obra
        odoo_started_at_map: dict[int, str | None] = {}  # wc_id → data de início

        if wc_ids:
            try:
                wos = await odoo.search_read(
                    'mrp.workorder',
                    domain=[
                        ['workcenter_id', 'in', wc_ids],
                        ['state', 'in', ['progress', 'ready', 'waiting', 'pending']],
                    ],
                    fields=['workcenter_id', 'user_id', 'production_id', 'name', 'date_start', 'state'],
                    limit=500,
                    order='write_date desc',
                )

                # Coletar production_ids para buscar obra
                prod_ids = []
                for wo in wos:
                    p_val = wo.get('production_id')
                    if p_val and isinstance(p_val, (list, tuple)) and len(p_val) > 0:
                        prod_ids.append(p_val[0])
                    elif isinstance(p_val, int):
                        prod_ids.append(p_val)

                production_map: dict = {}
                if prod_ids:
                    try:
                        prods = await odoo.search_read(
                            'mrp.production',
                            domain=[['id', 'in', list(set(prod_ids))]],
                            fields=['x_studio_nome_da_obra', 'name'],
                        )
                        production_map = {p['id']: p for p in prods}
                    except Exception as pe:
                        logger.warning(f"[TV] Falha ao buscar produções do Odoo: {pe}")

                # Processar WOs — prioriza estado 'progress'
                for wo in wos:
                    wc_val = wo.get('workcenter_id')
                    if not wc_val:
                        continue
                    wc_id_int = wc_val[0] if isinstance(wc_val, (list, tuple)) else wc_val

                    # Só sobrescreve se ainda não tem info OU esta WO está em progresso
                    already_has_progress = wc_id_int in odoo_operator_map and wo.get('state') != 'progress'
                    if already_has_progress:
                        continue

                    operator = _extract_operator(wo.get('user_id'), wo.get('workcenter_id'))
                    if operator:
                        odoo_operator_map[wc_id_int] = operator

                    p_val = wo.get('production_id')
                    p_id = p_val[0] if isinstance(p_val, (list, tuple)) else p_val
                    p_info = production_map.get(p_id, {}) if p_id else {}

                    fab_code = normalize_label(p_info.get('name') or '')
                    obra = normalize_label(p_info.get('x_studio_nome_da_obra') or '')
                    if fab_code:
                        odoo_fabrication_map[wc_id_int] = fab_code
                    if obra:
                        odoo_obra_map[wc_id_int] = obra

                    date_start = wo.get('date_start')
                    if date_start and isinstance(date_start, str):
                        date_start = date_start.replace(' ', 'T') + 'Z'
                    odoo_started_at_map[wc_id_int] = date_start or None

            except Exception as e:
                logger.warning(f"[TV] Falha ao buscar operadores do Odoo (usando fallback): {e}")

        # 4. Montar workcenters combinando dados locais + Odoo
        workcenters_data = []
        for wc_id, status_rec in local_statuses.items():
            active_calls = wc_calls_map.get(wc_id, [])

            if active_calls:
                is_red = any(c.color == "RED" for c in active_calls)
                status_color = "vermelho" if is_red else "amarelo"
            else:
                status_color = status_rec.status

            # Nome do operador: Odoo (user_id ou workcenter_id[1]) → updated_by → "---"
            operator_name = odoo_operator_map.get(wc_id, "")
            if not operator_name:
                # Fallback: quem acionou a mesa por último (excluindo sistema e ESP32)
                ub = status_rec.updated_by or ""
                if ub and ub not in ("System", "system:reset") and not ub.startswith("ESP32"):
                    operator_name = normalize_label(ub)
            if not operator_name:
                operator_name = "---"

            fabrication_code = odoo_fabrication_map.get(wc_id, "---")
            obra_name = odoo_obra_map.get(wc_id, "---")
            started_at = odoo_started_at_map.get(wc_id)
            has_active = status_color in ["verde", "amarelo_suave"] or bool(odoo_started_at_map.get(wc_id))

            workcenters_data.append({
                "id": wc_id,
                "name": normalize_label(status_rec.workcenter_name),
                "code": "",
                "status": status_color,
                "active_calls_count": len(active_calls),
                "operational_status": "PRODUÇÃO LIGADA" if status_color == "verde" else "PARADO",
                "has_active_production": has_active,
                "operator_name": operator_name,
                "fabrication_code": fabrication_code,
                "obra_name": obra_name,
                "stage": "Livre",
                "started_at": started_at,
                "is_online": True,
                "sync_pending": False
            })

        # 4. Construir recent_events (apenas banco local)
        recent_date = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
        stmt_calls = select(AndonCall).where(AndonCall.created_at >= recent_date)
        recent_calls = (await session.execute(stmt_calls)).scalars().all()

        stmt_idrs = select(IDRequest, ManufacturingOrder).join(ManufacturingOrder).where(
            or_(
                IDRequest.status != IDRequestStatus.CONCLUIDA,
                and_(
                    IDRequest.concluido_em != None,  # noqa: E711
                    IDRequest.concluido_em >= recent_date,
                ),
                and_(
                    IDRequest.finished_at != None,  # noqa: E711
                    IDRequest.finished_at >= recent_date,
                ),
            )
        )
        recent_idrs_joined = (await session.execute(stmt_idrs)).all()

        id_reqs_data = []
        recent_events = []

        # Build Call Events
        for c in recent_calls:
            recent_events.append({
                "event_type": "CALL_OPENED",
                "entity_id": c.id,
                "color": c.color,
                "reason": c.reason,
                "workcenter_name": c.workcenter_name,
                "triggered_by": c.triggered_by,
                "created_at": iso_utc(c.created_at)
            })
            if c.status == "IN_PROGRESS":
                recent_events.append({
                    "event_type": "CALL_IN_PROGRESS",
                    "entity_id": c.id,
                    "reason": c.reason,
                    "workcenter_name": c.workcenter_name,
                    "triggered_by": c.triggered_by,
                    "created_at": iso_utc(c.updated_at)
                })
            if c.status == "RESOLVED":
                dur = (c.updated_at - c.created_at).total_seconds() / 60 if c.updated_at and c.created_at else 0
                recent_events.append({
                    "event_type": "CALL_RESOLVED",
                    "entity_id": c.id,
                    "workcenter_name": c.workcenter_name,
                    "triggered_by": c.triggered_by,
                    "duration_minutes": dur,
                    "resolved_note": c.resolved_note,
                    "resolved_at": iso_utc(c.updated_at)
                })
        
        # Build IDRequests and ID Request Events
        for idr, mo in recent_idrs_joined:
            prod_status = "waiting"
            if idr.status == IDRequestStatus.CONCLUIDA:
                prod_status = "done"
            elif idr.status in [IDRequestStatus.EM_PROGRESSO, IDRequestStatus.EM_LOTE, IDRequestStatus.TRIAGEM]:
                prod_status = "in_progress"
                
            # Usa concluido_em como fallback quando finished_at não foi setado
            # (registros finalizados antes da correção do id_request_service)
            effective_finished_at = idr.finished_at or idr.concluido_em

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
                "created_at": iso_utc(idr.created_at),
                "started_at": iso_utc(idr.started_at),
                "finished_at": iso_utc(effective_finished_at),
            })
            
            idr_id_str = str(idr.id)
            recent_events.append({
                "event_type": "IDVISUAL_CREATED",
                "entity_id": idr_id_str,
                "mo_number": mo.name,
                "requester_name": idr.requester_name,
                "source": idr.source,
                "created_at": iso_utc(idr.created_at)
            })
            if idr.transferred_to_queue and idr.transferred_at:
                recent_events.append({
                    "event_type": "IDVISUAL_TRANSFERRED",
                    "entity_id": idr_id_str,
                    "mo_number": mo.name,
                    "requester_name": idr.requester_name,
                    "created_at": iso_utc(idr.transferred_at)
                })
            if idr.started_at:
                recent_events.append({
                    "event_type": "IDVISUAL_STARTED",
                    "entity_id": idr_id_str,
                    "mo_number": mo.name,
                    "requester_name": idr.requester_name,
                    "created_at": iso_utc(idr.started_at)
                })
            # Gera IDVISUAL_DONE usando concluido_em como fallback para finished_at
            if idr.status == IDRequestStatus.CONCLUIDA and effective_finished_at:
                ref_start = idr.started_at or idr.iniciado_em or idr.created_at
                dur = (effective_finished_at - ref_start).total_seconds() / 60 if ref_start else 0
                recent_events.append({
                    "event_type": "IDVISUAL_DONE",
                    "entity_id": idr_id_str,
                    "mo_number": mo.name,
                    "requester_name": idr.requester_name,
                    "notes": idr.notes,
                    "duration_minutes": dur,
                    "finished_at": iso_utc(effective_finished_at)
                })

        def get_time(ev: dict) -> str:
            return ev.get('finished_at') or ev.get('resolved_at') or ev.get('created_at') or ""
        # Ordenar do mais recente para o mais antigo (Req 8 AC 7)
        recent_events.sort(key=get_time, reverse=True)
            
        calls_data = []
        for c in all_active_calls:
            calls_data.append({
                "id": c.id, "color": c.color, "category": c.category, "reason": c.reason,
                "description": c.description, "workcenter_id": c.workcenter_id,
                "workcenter_name": c.workcenter_name, "mo_id": c.mo_id, "status": c.status,
                "triggered_by": c.triggered_by, "assigned_team": c.assigned_team,
                "created_at": iso_utc(c.created_at),
                "updated_at": iso_utc(c.updated_at)
            })

        payload = {
            "version": _sync_state.get("andon_version", str(int(time.time()))),
            "workcenters": workcenters_data,
            "calls": calls_data,
            "id_requests": id_reqs_data,
            "recent_events": recent_events[:60]
        }
        # Cache-Control: no-store garante que o browser nunca sirva uma resposta cacheada
        return JSONResponse(content=payload, headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        })
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
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    stmt = select(AndonCall).where(AndonCall.created_at >= cutoff)
    result = await session.execute(stmt)
    calls = result.scalars().all()
    
    # Agrupa por categoria para o gráfico
    stats = {}
    for c in calls:
        cat = c.category or "Outros"
        stats[cat] = stats.get(cat, 0) + 1
        
    return [{"label": k, "value": v} for k, v in stats.items()]


@router.delete("/reset")
async def reset_andon_data(
    session: AsyncSession = Depends(get_session),
):
    """
    Reseta dados de teste do sistema Andon.
    - Remove chamados ativos criados nos últimos 7 dias
    - Remove IDRequests manuais em estados abertos
    - Reseta todos os AndonStatus para cinza
    - Incrementa andon_version para forçar atualização do frontend
    """
    from app.api.api_v1.endpoints.sync import update_sync_version
    from sqlmodel import delete

    try:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=7)

        # 1. Deletar chamados ativos recentes
        stmt_calls = select(AndonCall).where(
            AndonCall.status != "RESOLVED",
            AndonCall.created_at >= cutoff,
        )
        res_calls = await session.execute(stmt_calls)
        calls_to_delete = res_calls.scalars().all()
        calls_deleted = len(calls_to_delete)
        for call in calls_to_delete:
            await session.delete(call)

        # 2. Deletar IDRequests manuais em estados abertos
        open_statuses = [
            IDRequestStatus.NOVA.value,
            IDRequestStatus.TRIAGEM.value,
            IDRequestStatus.EM_LOTE.value,
        ]
        stmt_idrs = select(IDRequest).where(
            IDRequest.source == "manual",
            IDRequest.status.in_(open_statuses),
        )
        res_idrs = await session.execute(stmt_idrs)
        idrs_to_delete = res_idrs.scalars().all()
        id_requests_deleted = len(idrs_to_delete)
        for idr in idrs_to_delete:
            await session.delete(idr)

        # 3. Resetar todos os AndonStatus para cinza
        stmt_statuses = select(AndonStatus)
        res_statuses = await session.execute(stmt_statuses)
        all_statuses = res_statuses.scalars().all()
        statuses_reset = len(all_statuses)
        for s in all_statuses:
            s.status = "cinza"
            s.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            s.updated_by = "system:reset"

        await session.commit()

        # 4. Forçar atualização do frontend via versão
        update_sync_version("andon_version")

        logger.info(
            f"[Andon Reset] calls_deleted={calls_deleted} "
            f"id_requests_deleted={id_requests_deleted} "
            f"statuses_reset={statuses_reset}"
        )

        return {
            "calls_deleted": calls_deleted,
            "id_requests_deleted": id_requests_deleted,
            "statuses_reset": statuses_reset,
        }

    except Exception as e:
        req_id = str(uuid.uuid4())[:8]
        logger.exception(f"Erro em reset_andon_data [ref:{req_id}]: {e}")
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Erro interno no servidor [ref: {req_id}]")

