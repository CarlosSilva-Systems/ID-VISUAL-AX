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

router = APIRouter()

@router.get("/manual", response_model=List[Dict[str, Any]])
async def get_manual_requests(
    session: AsyncSession = Depends(deps.get_session)
) -> Any:
    """
    List open manual requests that are NOT yet transferred to standard queue.
    """
    stmt = (
        select(IDRequest, ManufacturingOrder)
        .join(ManufacturingOrder)
        .where(
            IDRequest.source == "manual",
            IDRequest.transferred_to_queue == False,
            col(IDRequest.status).in_(OPEN_STATUSES)
        )
        .order_by(IDRequest.created_at.desc())
    )
    results = await session.exec(stmt)
    
    response = []
    for req, mo in results:
        response.append({
            "request_id": req.id,
            "odoo_mo_id": mo.odoo_id,
            "mo_number": mo.name,
            "obra_nome": mo.x_studio_nome_da_obra,
            "product_qty": mo.product_qty,
            "date_start": mo.date_start,
            "requester_name": req.requester_name,
            "notes": req.notes,
            "priority": req.priority,
            "status": req.status,
            "created_at": req.created_at
        })
    return response

@router.get("/manual/count", response_model=Dict[str, int])
async def count_manual_requests(
    session: AsyncSession = Depends(deps.get_session)
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
    session: AsyncSession = Depends(deps.get_session)
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

        # 2c. Check existing activity (Idempotency)
        domain = [
            ['res_model', '=', 'mrp.production'],
            ['res_id', '=', mo.odoo_id],
            ['activity_type_id', '=', act_type_id],
            ['active', '=', True]
        ]
        
        existing = await client.search_read('mail.activity', domain=domain, fields=['id'], limit=1)
        
        if existing:
            activity_id = existing[0]['id']
            created = False
        else:
            # 2d. Create Activity (Full Payload)
            deadline = datetime.now().strftime("%Y-%m-%d")
            note_content = f"Solicitante: {req.requester_name or 'N/A'}<br/>Nota: {req.notes or ''}"
            
            # Use configured user or default to ensure assignment
            user_id = settings.ODOO_ACTIVITY_USER_ID
            
            new_act = await client.create('mail.activity', {
                'res_model_id': res_model_id,
                'res_id': mo.odoo_id,
                'activity_type_id': act_type_id,
                'summary': 'Imprimir ID Visual', # Enforced for standard queue compatibility
                'note': note_content,
                'date_deadline': deadline,
                'user_id': user_id 
            })
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
    
    # 4. History Log
    log = HistoryLog(
        entity_type="id_request",
        entity_id=req.id,
        action="MANUAL_REQUEST_TRANSFERRED",
        after_json={"odoo_activity_id": activity_id, "created": created}
    )
    session.add(log)
    
    await session.commit()
    await session.refresh(req)
    
    return {
        "created_activity": created,
        "activity_id": activity_id,
        "manual_request_status": req.status
    }
