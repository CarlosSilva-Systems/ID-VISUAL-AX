from typing import Any, List, Dict
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select, func, col
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.core.config import settings
from app.models.id_request import IDRequest, IDRequestStatus, OPEN_STATUSES
from app.models.manufacturing import ManufacturingOrder
from app.models.audit import HistoryLog
from app.services.odoo_client import OdooClient
from app.services.odoo_utils import normalize_many2one_display
from app.services.status_mappers import map_mrp_state
from app.api.api_v1.endpoints.sync import update_sync_version
from app.services.task_service import initialize_request_tasks

router = APIRouter()

@router.get("/manual", response_model=List[Dict[str, Any]])
async def get_manual_requests(
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user)
) -> Any:
    """
    List open manual requests that are NOT yet transferred to standard queue.
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
            client = OdooClient(
                url=settings.ODOO_URL,
                db=settings.ODOO_DB,
                auth_type="jsonrpc_password",
                login=settings.ODOO_LOGIN,
                secret=settings.ODOO_PASSWORD
            )
            # Read 'state' for these IDs
            fresh_data = await client.search_read(
                'mrp.production',
                domain=[['id', 'in', odoo_ids]],
                fields=['id', 'state']
            )
            await client.close()
            
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
                         mo.last_sync_at = datetime.now(timezone.utc)
                         session.add(mo)
            
            # Commit updates to local DB so next read is fast/correct
            await session.commit()
            
        except Exception as e:
            import traceback
            print(f"Warning: Failed to fetch fresh Odoo states: {e}")
            traceback.print_exc()
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
            "mo_number": mo.name,
            "obra_nome": normalize_many2one_display(mo.x_studio_nome_da_obra),
            "product_qty": mo.product_qty,
            "date_start": mo.date_start,
            "requester_name": req.requester_name,
            "notes": req.notes,
            "priority": req.priority,
            "status": req.status,
            "created_at": req.created_at,
            # New Fields
            "mo_state": current_state,
            "mo_state_label": status_info["label"],
            "mo_state_variant": status_info["variant"]
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
            col(IDRequest.status).in_(OPEN_STATUSES)
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
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
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

        # 2c. Resolve Assignee (Strict)
        user_id = settings.ODOO_ACTIVITY_USER_ID
        
        # Always verify or search for Dorival by name for safety
        dorival_name = "DORIVAL BONIFACIO DE SOUZA JUNIOR"
        dorival_domain = [['name', '=', dorival_name]]
        dorival_users = await client.search_read('res.users', domain=dorival_domain, fields=['id', 'name'], limit=1)
        
        if dorival_users and dorival_users[0]['name'] == dorival_name:
            user_id = dorival_users[0]['id']
        else:
            # STRICT FAILURE: User must be exactly Dorival
            print(f"CRITICAL: User '{dorival_name}' not found or name mismatch in Odoo.")
            raise HTTPException(
                status_code=422,
                detail=f"Responsável '{dorival_name}' não encontrado no Odoo. Verifique o cadastro."
            )

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
        domain = [
            ['res_model', '=', 'mrp.production'],
            ['res_id', '=', mo.odoo_id],
            ['activity_type_id', '=', act_type_id],
            ['user_id', '=', user_id],
            ['summary', '=', summary],
            ['active', '=', True]
        ]
        
        existing = await client.search_read('mail.activity', domain=domain, fields=['id'], limit=1)
        
        if existing:
            activity_id = existing[0]['id']
            created = False
            print(f"DIAGNOSTIC: Reusing existing Odoo activity {activity_id} for MO {mo.name}")
        else:
            # 2f. Create Activity (Full Payload)
            payload = {
                'res_model_id': res_model_id,
                'res_id': mo.odoo_id,
                'activity_type_id': act_type_id,
                'summary': summary,
                'note': note_content,
                'date_deadline': deadline,
                'user_id': user_id 
            }
            
            print(f"DIAGNOSTIC: Sending Payload to Odoo -> {payload}")
            
            new_act = await client.call_kw('mail.activity', 'create', args=[payload])
            activity_id = new_act
            created = True
            
    except HTTPException:
        raise # Re-raise known HTTP exceptions (422, 500)
    except Exception as e:
        import traceback
        error_msg = f"Odoo Transfer Execution Failed: {str(e)}"
        print(error_msg)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=error_msg)
    finally:
        await client.close()
        
    # 3. Update Local State
    req.transferred_to_queue = True
    req.transferred_at = datetime.now(timezone.utc)
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
