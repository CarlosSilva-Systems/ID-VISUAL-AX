from typing import Any, List, Dict, Optional
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select, col, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.models.id_request import IDRequest, IDRequestStatus, IDRequestTask, OPEN_STATUSES
from app.models.manufacturing import ManufacturingOrder
from app.models.audit import HistoryLog
from app.models.system_setting import SystemSetting
from app.services.odoo_client import OdooClient
from app.services.odoo_utils import normalize_many2one_display
from app.services.status_mappers import map_mrp_state
from app.core.config import settings
from app.api.api_v1.endpoints.sync import update_sync_version
from app.schemas.id_request import ManualRequestResponse
from app.services.task_service import initialize_request_tasks

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/manual", response_model=List[ManualRequestResponse])
async def get_manual_requests(
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
    client: OdooClient = Depends(deps.get_odoo_client)
) -> Any:
    """
    List open manual requests that are NOT yet transferred to standard queue.
    
    Uses get_odoo_client() dependency to ensure Service_Account and Active_Database are used.
    """
    stmt = (
        select(IDRequest, ManufacturingOrder)
        .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id)
        .where(
            IDRequest.source == "manual",
            IDRequest.transferred_to_queue == False,
            col(IDRequest.status).in_([s.value for s in OPEN_STATUSES])
        )
        .order_by(IDRequest.created_at.desc())
    )
    results = (await session.exec(stmt)).all()
    
    # ── Real-time Odoo Fetch for Fresh Status ──
    # Collect IDs to fetch
    req_mo_map = {req.id: mo for req, mo in results}
    odoo_ids = [mo.odoo_id for req, mo in results if mo.odoo_id]
    
    # Map for fresh states
    fresh_states = {} 
    
    if odoo_ids:
        try:
            # Read 'state' for these IDs using injected client
            fresh_data = await client.search_read(
                'mrp.production',
                domain=[['id', 'in', odoo_ids]],
                fields=['id', 'state']
            )
            
            # Update local map and DB
            for item in fresh_data:
                fresh_states[item['id']] = item['state']
            
            # Optional: Update DB in background or now? 
            # Ideally we update the local MOs to keep them synced.
            # We already have the MO objects in session (from join).
            for req, mo in results:
                if mo.odoo_id in fresh_states:
                    new_state = fresh_states[mo.odoo_id]
                    if mo.state != new_state:
                         mo.state = new_state
                         mo.last_sync_at = datetime.now(timezone.utc).replace(tzinfo=None)
                         session.add(mo)
            
            # Commit updates to local DB so next read is fast/correct
            await session.commit()
            
        except Exception as e:
            logger.warning(f"Warning: Failed to fetch fresh Odoo states: {e}")
            # Fallback to local state if Odoo fails
    
    response = []
    for req, mo in results:
        # Use fresh state if available, else local
        current_state = fresh_states.get(mo.odoo_id, mo.state)
        
        # Map to UI
        status_info = map_mrp_state(current_state)
        
        response.append({
            "request_id": req.id,
            "odoo_mo_id": mo.odoo_id,
            "mo_number": str(mo.name),
            "product_name": mo.product_name,
            "obra_nome": normalize_many2one_display(mo.x_studio_nome_da_obra),
            "product_qty": float(mo.product_qty),
            "date_start": mo.date_start,
            "requester_name": req.requester_name,
            "notes": req.notes,
            "priority": str(req.priority.value if hasattr(req.priority, 'value') else req.priority),
            "status": str(req.status.value if hasattr(req.status, 'value') else req.status),
            "created_at": req.created_at,
            "mo_state": str(current_state),
            "mo_state_label": str(status_info["label"]),
            "mo_state_variant": str(status_info["variant"])
        })
    return response

@router.get("/manual/count", response_model=Dict[str, int])
async def count_manual_requests(
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user)
) -> Any:
    """
    Count open manual requests not transferred.
    """
    stmt = (
        select(func.count(IDRequest.id))
        .where(
            IDRequest.source == "manual",
            IDRequest.transferred_to_queue == False,
            col(IDRequest.status).in_([s.value for s in OPEN_STATUSES])
        )
    )
    count = await session.exec(stmt)
    return {"open_count": count.first() or 0}

@router.post("/manual/{request_id}/transfer", response_model=Dict[str, Any])
async def transfer_manual_request(
    request_id: str,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user)
) -> Any:
    """
    Transfer a manual request to the Standard Queue (Odoo Activity).
    Idempotent: Reuses existing activity if found.
    """
    # 1. Validate Request
    try:
        req_uuid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    stmt = (
        select(IDRequest, ManufacturingOrder)
        .join(ManufacturingOrder)
        .where(IDRequest.id == req_uuid)
    )
    result = await session.exec(stmt)
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
        
    req, mo = row
    
    if req.source != "manual":
        raise HTTPException(status_code=400, detail="Only manual requests can be transferred")
        
    if req.transferred_to_queue:
        return {
            "created_activity": False, 
            "activity_id": req.odoo_activity_id, 
            "status": "already_transferred"
        }

    # Validate that MO is actually linked to Odoo
    if not mo.odoo_id:
        raise HTTPException(
            status_code=400, 
            detail="Cannot transfer: This MO is not linked to Odoo (missing odoo_id)."
        )

    # 2. Odoo Interaction (Idempotent)
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_SERVICE_LOGIN,
        secret=settings.ODOO_SERVICE_PASSWORD
    )
    
    activity_id = None
    created = False
    
    try:
        # 2a. Resolve Activity Type (Strict)
        act_type_id = settings.ODOO_ID_VISUAL_ACTIVITY_TYPE_ID
        
        if not act_type_id:
            # Search by name
            type_domain = [['name', 'ilike', 'Imprimir ID Visual']]
            activity_types = await client.search_read('mail.activity.type', domain=type_domain, fields=['id'], limit=1)
            if activity_types:
                act_type_id = activity_types[0]['id']
        
        if not act_type_id:
            # STRICT FAILURE
            raise HTTPException(
                status_code=422, 
                detail="Activity Type 'Imprimir ID Visual' not found in Odoo. "
                       "Please create it in Odoo or configure ODOO_ID_VISUAL_ACTIVITY_TYPE_ID in .env."
            )

        # 2b. Resolve res_model_id (Safe Payload)
        # Many Odoo versions require integer res_model_id for activity creation
        model_domain = [['model', '=', 'mrp.production']]
        models = await client.search_read('ir.model', domain=model_domain, fields=['id'], limit=1)
        if not models:
             raise HTTPException(status_code=500, detail="Critical: Odoo Model 'mrp.production' not found in ir.model")
        res_model_id = models[0]['id']

        # 2c. Resolve Assignee (Dynamic from SystemSettings)
        stmt = select(SystemSetting).where(SystemSetting.key == "odoo_id_visual_activity_user_id")
        result = await session.exec(stmt)
        setting = result.first()
        
        if not setting or not setting.value:
             raise HTTPException(
                status_code=422,
                detail="Responsável pela ID Visual não configurado. Acesse as configurações para definir um usuário do Odoo."
            )
        
        try:
            user_id = int(setting.value)
        except ValueError:
            raise HTTPException(status_code=500, detail="Configuração de usuário Odoo inválida no banco de dados.")

        # Optional: Verify if user still exists/active (already done on save, but good for runtime safety)
        # We'll trust the setting for now to avoid extra roundtrips per transfer, 
        # unless transfer fails.

        # 2d. Prepare Payload
        summary = 'Imprimir ID Visual'
        deadline = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        note_content = (
            f"<p><strong>Solicitação de ID Visual</strong></p>"
            f"<ul>"
            f"<li><strong>Solicitante:</strong> {req.requester_name or 'Não informado'}</li>"
            f"<li><strong>OF:</strong> {mo.name}</li>"
            f"<li><strong>ID Interno:</strong> {req.id}</li>"
            f"<li><strong>Notas:</strong> {req.notes or '-'}</li>"
            f"</ul>"
        )

        # 2e. Check existing activity (Idempotency - Hardened)
        # Nota: mail.activity nao tem campo 'active' em Odoo 16/17 — removido do dominio
        domain = [
            ['res_model', '=', 'mrp.production'],
            ['res_id', '=', mo.odoo_id],
            ['activity_type_id', '=', act_type_id],
            ['user_id', '=', user_id],
            ['summary', '=', summary],
        ]
        
        existing = await client.search_read('mail.activity', domain=domain, fields=['id'], limit=1)
        
        if existing:
            activity_id = existing[0]['id']
            created = False
            logger.debug(f"Reusing existing Odoo activity {activity_id} for MO {mo.name}")
        else:
            # 2f. Create Activity (Full Payload)
            # res_model (string) e res_model_id (int) sao ambos necessarios dependendo da versao do Odoo
            payload = {
                'res_model': 'mrp.production',
                'res_model_id': res_model_id,
                'res_id': mo.odoo_id,
                'activity_type_id': act_type_id,
                'summary': summary,
                'note': note_content,
                'date_deadline': deadline,
                'user_id': user_id,
            }
            
            logger.debug(f"Sending Payload to Odoo -> {payload}")
            
            new_act = await client.call_kw('mail.activity', 'create', args=[payload])
            activity_id = new_act
            created = True
            
    except HTTPException:
        raise # Re-raise known HTTP exceptions (422, 500)
    except Exception as e:
        ref = str(uuid.uuid4())[:8]
        err_msg = str(e)
        logger.exception(f"Odoo Transfer Execution Failed [ref:{ref}]: {err_msg}")
        # Expoe a mensagem do Odoo RPC diretamente para facilitar diagnostico,
        # mas sem stack trace (ja logado acima).
        detail = f"Erro na transferência para o Odoo [ref: {ref}]"
        if "Odoo RPC Error" in err_msg:
            # Extrai a parte legivel da mensagem de erro do Odoo
            detail = f"{detail} — {err_msg}"
        raise HTTPException(status_code=500, detail=detail)
    finally:
        await client.close()
        
    # 3. Update Local State
    req.transferred_to_queue = True
    req.transferred_at = datetime.now(timezone.utc).replace(tzinfo=None)
    req.odoo_activity_id = activity_id
    # Optional: Change status to something else? Keep as is but filter out via 'transferred_to_queue' flag?
    # User suggestion: "status='transferida' (ou remover dos status abertos)"
    # I'll update to 'transferida' if valid enum, but IDRequestStatus doesn't have it yet?
    # I should add 'transferida' to enum if I want to use it. Or just rely on boolean flag.
    # The filter uses transferred_to_queue=False. So keeping status is fine, boolean hides it from list.
    
    session.add(req)
    
    # 4. Initialize Checklist Tasks (Poka-yoke)
    # This ensures that once transferred, the request already has the standard tasks ready.
    await initialize_request_tasks(req.id, session)
    
    # 5. History Log
    log = HistoryLog(
        entity_type="id_request",
        entity_id=req.id,
        action="MANUAL_REQUEST_TRANSFERRED",
        after_json={"odoo_activity_id": activity_id, "created": created}
    )
    session.add(log)
    
    await session.commit()
    await session.refresh(req)
    
    # Invalidate both caches (request is gone from manual, appears in Odoo queue)
    update_sync_version("odoo_version")
    update_sync_version("requests_version")
    # Notificar Andon TV sobre transferência (dispara evento IDVISUAL_TRANSFERRED)
    update_sync_version("andon_version")
    
    return {
        "created_activity": created,
        "activity_id": activity_id,
        "manual_request_status": req.status
    }
@router.post("/manual/bulk-transfer", response_model=Dict[str, Any])
async def bulk_transfer_manual_requests(
    request_ids: List[str],
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user)
) -> Any:
    """
    Transfer multiple manual requests to the Standard Queue in Odoo.
    Returns results per ID.
    """
    results = []
    success_count = 0
    fail_count = 0

    for rid in request_ids:
        try:
            res = await transfer_manual_request(rid, session, current_user)
            results.append({"id": rid, "status": "success", "data": res})
            success_count += 1
        except HTTPException as e:
            results.append({"id": rid, "status": "error", "detail": e.detail})
            fail_count += 1
        except Exception as e:
            results.append({"id": rid, "status": "error", "detail": str(e)})
            fail_count += 1

    return {
        "success_count": success_count,
        "fail_count": fail_count,
        "results": results
    }

@router.post("/bulk-complete", response_model=Dict[str, Any])
async def bulk_complete_requests(
    request_ids: List[str],
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Marca múltiplos IDRequests como 'concluida' e fecha as atividades no Odoo.

    Caso de uso: operadores que fazem a ID Visual de forma manual (sem usar o
    fluxo de lote/matriz) e precisam registrar a conclusão para notificar o
    Andon TV e fechar a atividade 'Imprimir ID Visual' no Odoo.

    Aceita dois formatos de identificador:
    - UUID (request_id): busca diretamente pelo IDRequest.id
    - Inteiro como string (odoo_mo_id): busca o IDRequest mais recente pelo odoo_mo_id

    Regras:
    - Ignora silenciosamente IDs não encontrados ou já concluídos/cancelados.
    - Seta status = 'concluida', finished_at e concluido_em com o timestamp atual.
    - Fecha atividades 'Imprimir ID Visual' no Odoo para cada IDRequest concluído.
    - Dispara update_sync_version("andon_version") para notificar o Andon TV.
    """
    from app.services.odoo_client import OdooClient
    from app.core.config import settings

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    success_ids: List[str] = []
    skipped_ids: List[str] = []
    error_ids: List[str] = []

    # Statuses que podem ser concluídos
    completable_statuses = [
        IDRequestStatus.NOVA.value,
        IDRequestStatus.TRIAGEM.value,
        IDRequestStatus.EM_LOTE.value,
        IDRequestStatus.EM_PROGRESSO.value,
        IDRequestStatus.BLOQUEADA.value,
    ]

    # Coleta os IDRequests resolvidos para fechar no Odoo depois
    completed_requests: List[IDRequest] = []

    for rid in request_ids:
        req: Optional[IDRequest] = None

        # Tenta interpretar como UUID primeiro
        try:
            req_uuid = uuid.UUID(rid)
            stmt = select(IDRequest).where(IDRequest.id == req_uuid)
            result = await session.exec(stmt)
            req = result.first()
        except ValueError:
            # Não é UUID — tenta como odoo_mo_id (inteiro)
            try:
                odoo_id = int(rid)
                stmt = (
                    select(IDRequest)
                    .where(IDRequest.odoo_mo_id == odoo_id)
                    .order_by(IDRequest.created_at.desc())
                )
                result = await session.exec(stmt)
                req = result.first()

                # Fallback: busca via ManufacturingOrder
                if not req:
                    stmt_mo = (
                        select(IDRequest)
                        .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id)
                        .where(ManufacturingOrder.odoo_id == odoo_id)
                        .order_by(IDRequest.created_at.desc())
                    )
                    result_mo = await session.exec(stmt_mo)
                    req = result_mo.first()
            except (ValueError, TypeError):
                error_ids.append(rid)
                continue

        if not req:
            skipped_ids.append(rid)
            continue

        current_status = req.status.value if hasattr(req.status, "value") else req.status

        if current_status not in completable_statuses:
            skipped_ids.append(rid)
            continue

        req.status = IDRequestStatus.CONCLUIDA.value
        req.finished_at = now
        req.concluido_em = now
        if not req.started_at:
            req.started_at = now
            req.iniciado_em = now

        session.add(req)
        completed_requests.append(req)

        log = HistoryLog(
            entity_type="id_request",
            entity_id=req.id,
            action="BULK_COMPLETED",
            after_json={
                "status": IDRequestStatus.CONCLUIDA.value,
                "completed_by": str(current_user.id) if hasattr(current_user, "id") else str(current_user),
                "finished_at": now.isoformat(),
            },
        )
        session.add(log)
        success_ids.append(rid)

    if not completed_requests:
        return {
            "success_count": 0,
            "skipped_count": len(skipped_ids),
            "error_count": len(error_ids),
            "odoo_activities_closed": 0,
            "odoo_errors": [],
            "success_ids": success_ids,
            "skipped_ids": skipped_ids,
            "error_ids": error_ids,
        }

    await session.commit()
    update_sync_version("andon_version")
    update_sync_version("odoo_version")

    # Fechar atividades 'Imprimir ID Visual' no Odoo para cada IDRequest concluído
    odoo_closed_count = 0
    odoo_errors: List[dict] = []

    async with OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_SERVICE_LOGIN,
        secret=settings.ODOO_SERVICE_PASSWORD,
    ) as client:
        activity_type_id = await client.get_activity_type_id("Imprimir ID Visual")

        for req in completed_requests:
            mo = await session.get(ManufacturingOrder, req.mo_id)
            if not mo or not mo.odoo_id:
                continue
            try:
                activities = await client.find_activities_for_mo(
                    odoo_mo_id=mo.odoo_id,
                    activity_type_id=activity_type_id or 0,
                )
                if activities:
                    activity_ids = [a["id"] for a in activities]
                    await client.close_activities(activity_ids)
                    odoo_closed_count += len(activity_ids)
            except Exception as e:
                odoo_errors.append({
                    "odoo_mo_id": mo.odoo_id,
                    "mo_name": mo.name,
                    "reason": str(e),
                })

    return {
        "success_count": len(success_ids),
        "skipped_count": len(skipped_ids),
        "error_count": len(error_ids),
        "odoo_activities_closed": odoo_closed_count,
        "odoo_errors": odoo_errors,
        "success_ids": success_ids,
        "skipped_ids": skipped_ids,
        "error_ids": error_ids,
    }


@router.get("/stats")
async def get_id_requests_stats(
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user)
) -> Any:
    """Retorna estatísticas de volume de IDs por status para o Dashboard BI."""
    stmt = select(IDRequest.status, func.count(IDRequest.id)).group_by(IDRequest.status)
    results = await session.execute(stmt)
    rows = results.all()
    # Converte status enum para string para o JSON
    return [{"label": str(r[0].value if hasattr(r[0], 'value') else r[0]), "value": r[1]} for r in rows]

