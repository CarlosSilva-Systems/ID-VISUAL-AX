from typing import List, Dict, Any, Optional as Opt
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select, col, SQLModel
from pydantic import BaseModel
from sqlalchemy import func, case, text

from app.api import deps
from app.models.batch import Batch, BatchStatus
from app.models.id_request import IDRequest, IDRequestTask
from app.models.manufacturing import ManufacturingOrder
from app.schemas.matrix_view import (
    BatchMatrixResponse, BatchStats, MatrixColumn, MatrixRow, MatrixCell,
    TaskStatusEnum, TaskUpdatePayload, TaskUpdateResponse
)

router = APIRouter()
print("DEBUG: LOADING BATCHES MODULE V999 -------------------------------------")

# 5S Fixed Columns Source of Truth
FIXED_COLUMNS = [
    MatrixColumn(task_code="DOCS_Epson", label="Documentos Epson", order=10),
    MatrixColumn(task_code="WAGO_210_804", label="Componente 210-804", order=20),
    MatrixColumn(task_code="WAGO_210_805", label="Adesivo 210-805", order=30),
    MatrixColumn(task_code="ELESYS_EFZ", label="Tag EFZ", order=40),
    MatrixColumn(task_code="WAGO_2009_110", label="Régua 2009-110", order=50),
    MatrixColumn(task_code="WAGO_210_855", label="Adesivo 210-855", order=60),
    MatrixColumn(task_code="QA_FINAL", label="QA Final", order=99),
]

# --- Active Batches ---

class ActiveBatchSummary(BaseModel):
    batch_id: str
    batch_name: str
    items_count: int
    progress_pct: float
    is_complete: bool
    created_at: datetime
    last_activity_at: datetime

@router.get("/active", response_model=List[ActiveBatchSummary])
async def get_active_batches(
    session: AsyncSession = Depends(deps.get_session)
) -> Any:
    """
    Lista lotes com status ACTIVE, com progresso calculado e data da última atividade.
    Ordenados por last_activity_at DESC (mais recente primeiro).
    Usa 2 queries fixas (sem N+1).
    """
    # Query 1: Fetch all active batches
    batch_stmt = select(Batch).where(Batch.status == BatchStatus.ACTIVE).order_by(Batch.created_at.desc())
    batch_result = await session.exec(batch_stmt)
    batches = batch_result.all()

    if not batches:
        return []

    batch_ids = [b.id for b in batches]
    batch_map = {b.id: b for b in batches}

    # Query 2: Aggregated stats per batch (items_count, progress, last_activity)
    # JOIN: IDRequest -> IDRequestTask, GROUP BY batch_id
    agg_stmt = (
        select(
            IDRequest.batch_id,
            func.count(func.distinct(IDRequest.id)).label("items_count"),
            func.count(
                case(
                    (IDRequestTask.status != "nao_aplicavel", 1),
                    else_=None
                )
            ).label("total_applicable"),
            func.count(
                case(
                    (IDRequestTask.status == "impresso", 1),
                    else_=None
                )
            ).label("total_completed"),
            func.max(IDRequestTask.updated_at).label("last_task_update"),
        )
        .join(IDRequestTask, IDRequestTask.request_id == IDRequest.id, isouter=True)
        .where(col(IDRequest.batch_id).in_(batch_ids))
        .group_by(IDRequest.batch_id)
    )
    agg_result = await session.exec(agg_stmt)
    agg_rows = agg_result.all()

    # Build lookup map
    stats_map: Dict[UUID, dict] = {}
    for row in agg_rows:
        bid = row[0]  # batch_id
        items = row[1] or 0
        applicable = row[2] or 0
        completed = row[3] or 0
        last_update = row[4]
        
        pct = round((completed / applicable * 100), 1) if applicable > 0 else 0.0
        stats_map[bid] = {
            "items_count": items,
            "progress_pct": pct,
            "is_complete": pct == 100.0,
            "last_activity_at": last_update,
        }

    # Build response, ordered by last_activity_at DESC
    results = []
    for batch in batches:
        stats = stats_map.get(batch.id, {
            "items_count": 0,
            "progress_pct": 0.0,
            "is_complete": False,
            "last_activity_at": None,
        })
        
        last_activity = stats["last_activity_at"] or batch.created_at

        results.append(ActiveBatchSummary(
            batch_id=str(batch.id),
            batch_name=batch.name,
            items_count=stats["items_count"],
            progress_pct=stats["progress_pct"],
            is_complete=stats["is_complete"],
            created_at=batch.created_at,
            last_activity_at=last_activity,
        ))

    # Sort by last_activity_at DESC
    results.sort(key=lambda x: x.last_activity_at, reverse=True)

    return results


@router.get("/{batch_id}/matrix", response_model=BatchMatrixResponse)
async def get_batch_matrix(
    batch_id: UUID,
    session: AsyncSession = Depends(deps.get_session)
) -> Any:
    """
    Get the complete matrix view for a specific batch.
    Includes fixed 5S columns, calculated stats, and all rows/cells.
    """
    batch = await session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Fetch all requests and tasks for this batch
    statement = select(IDRequest, ManufacturingOrder).join(ManufacturingOrder).where(IDRequest.batch_id == batch_id)
    result = await session.exec(statement)
    requests_with_mos = result.all()
    
    # Pre-fetch tasks (optimization: could be joined, but simple loop for now)
    # Ideally should use a join, but let's stick to safe logic first
    rows: List[MatrixRow] = []
    
    # Stats counters
    stats = BatchStats(total_rows=len(requests_with_mos))
    
    # Helper to calculate stats
    docs_statuses: List[str] = []
    total_tasks_count = 0
    completed_tasks_count = 0

    for req, mo in requests_with_mos:
        # Fetch tasks for this request
        task_stmt = select(IDRequestTask).where(IDRequestTask.request_id == req.id)
        task_res = await session.exec(task_stmt)
        tasks = task_res.all()
        
        cells: Dict[str, MatrixCell] = {}
        row_blocked = False
        
        # Determine strict list of current tasks map
        tasks_map = {t.task_code: t for t in tasks}

        for col in FIXED_COLUMNS:
            task = tasks_map.get(col.task_code)
            
            if task:
                # Map DB task to MatrixCell
                # Map DB string status to Enum
                try:
                    cell_status = TaskStatusEnum(task.status)
                except ValueError:
                    cell_status = TaskStatusEnum.nao_iniciado # Fallback

                cells[col.task_code] = MatrixCell(
                    status=cell_status,
                    version=task.version or 1,
                    updated_at=task.updated_at,
                    blocked_reason=task.blocked_reason,
                    update_note=None # Log logic separate, or add field to Task model
                )
                
                # Stats aggregation
                if col.task_code == "DOCS_Epson":
                    if cell_status == TaskStatusEnum.nao_iniciado: stats.docs_pending += 1
                    elif cell_status == TaskStatusEnum.montado: stats.docs_printing += 1
                    elif cell_status == TaskStatusEnum.impresso: stats.docs_printed += 1
                    elif cell_status == TaskStatusEnum.bloqueado: stats.docs_blocked += 1
                
                if cell_status == TaskStatusEnum.bloqueado:
                    row_blocked = True
                
                # General progress
                if cell_status != TaskStatusEnum.nao_aplicavel:
                    total_tasks_count += 1
                    if cell_status == TaskStatusEnum.impresso:
                        completed_tasks_count += 1

            else:
                # Task not found -> N/A
                cells[col.task_code] = MatrixCell(
                    status=TaskStatusEnum.nao_aplicavel,
                    version=0
                )

        if row_blocked:
            stats.total_blocked += 1

        # Date stats (Today/Week)
        # Using mo.date_start (from ManufacturingOrder)
        if mo.date_start:
             # simple logic, can be refined with timezone awareness
             now = datetime.now(timezone.utc).date()
             # handle if mo.date_start is datetime or date
             req_date = mo.date_start.date() if isinstance(mo.date_start, datetime) else mo.date_start
             
             if req_date == now:
                 stats.count_today += 1
             # Week logic omitted for brevity, can be added
             
        rows.append(MatrixRow(
            request_id=req.id,
            odoo_mo_id=mo.odoo_id,
            mo_number=mo.name,
            obra_nome=mo.x_studio_nome_da_obra,
            package_code=req.package_code,
            sla_text="24h", # Placeholder or calculated
            quantity=mo.product_qty or 1.0,
            date_start=mo.date_start,
            cells=cells
        ))

    if total_tasks_count > 0:
        stats.progress_pct = round((completed_tasks_count / total_tasks_count) * 100, 1)

    return BatchMatrixResponse(
        batch_id=batch.id,
        batch_name=batch.name,
        batch_status=batch.status,
        stats=stats,
        columns=FIXED_COLUMNS,
        rows=rows
    )


@router.patch("/{batch_id}/tasks", response_model=TaskUpdateResponse)
async def update_batch_task(
    batch_id: UUID,
    payload: TaskUpdatePayload,
    session: AsyncSession = Depends(deps.get_session)
) -> Any:
    """
    Update a specific task status.
    Implements: Optimistic Locking, Business Validations, Poka-yoke.
    """
    try:
        # 1. Fetch Task
        statement = select(IDRequestTask).where(
            IDRequestTask.request_id == payload.request_id,
            IDRequestTask.task_code == payload.task_code
        )
        result = await session.exec(statement)
        task = result.first()
        
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        # 2. Validation: N/A Immutable
        if task.status == TaskStatusEnum.nao_aplicavel.value:
             raise HTTPException(status_code=400, detail="Cannot update N/A task")

        # 3. Validation: Blocking requires reason
        if payload.new_status == TaskStatusEnum.bloqueado and not payload.blocked_reason:
            raise HTTPException(status_code=400, detail="Blocking requires a reason")
        
        # 4. Desbloqueio Logic: Clear reason
        if task.status == TaskStatusEnum.bloqueado.value and payload.new_status != TaskStatusEnum.bloqueado:
            task.blocked_reason = None
            
        # 5. Poka-yoke QA
        if payload.task_code == "QA_FINAL" and payload.new_status == TaskStatusEnum.impresso:
            # Check DOCS status
            docs_stmt = select(IDRequestTask).where(
                IDRequestTask.request_id == payload.request_id,
                IDRequestTask.task_code == "DOCS_Epson"
            )
            docs_res = await session.exec(docs_stmt)
            docs_task = docs_res.first()
            
            docs_ok = docs_task and docs_task.status == TaskStatusEnum.impresso.value
            
            if not docs_ok:
                # Require justification
                if not payload.update_note:
                    raise HTTPException(
                        status_code=400, 
                        detail="QA Approval requires Docs to be Printed OR a Justification Note."
                    )
        
        # 6. Optimistic Locking
        current_version = task.version or 1
        if payload.version != current_version:
            raise HTTPException(
                status_code=409, 
                detail="Conflict: Task updated by another user. Reload required."
            )
            
        # 7. Apply Update
        task.status = payload.new_status.value
        task.version = current_version + 1
        task.updated_at = datetime.now(timezone.utc)
        if payload.blocked_reason:
            task.blocked_reason = payload.blocked_reason
            
        # Note: update_note logic would go to history log here (simplified for now)
        
        session.add(task)
        await session.commit()
        await session.refresh(task)
        
        # 8. Recalculate Stats (Simplified: Fetches Matrix logic again or incremental)
        # For correctness, let's call get_batch_matrix logic reuse or simplified
        # Calling the full matrix logic is expensive but safe. For V1 let's assume client refreshes or we implement efficient recalc.
        # To strictly follow plan: return updated stats. We will do a quick recalc query.
        
        # Re-using logic from get_batch_matrix (refactor recommended in future)
        stats_matrix = await get_batch_matrix(batch_id, session)
        
        return TaskUpdateResponse(
            updated_cell=MatrixCell(
                status=TaskStatusEnum(task.status),
                version=task.version,
                updated_at=task.updated_at,
                blocked_reason=task.blocked_reason,
                update_note=payload.update_note
            ),
            updated_stats=stats_matrix.stats
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        import traceback
        err = traceback.format_exc()
        with open("debug_trace.log", "a") as f:
            f.write(f"ERROR IN UPDATE TASK: {err}\n")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

class CreateBatchRequest(SQLModel):
    mo_ids: List[int] # Odoo IDs

from app.services.odoo_client import OdooClient
from app.core.config import settings
from app.models.manufacturing import ManufacturingOrder

@router.post("/", response_model=Dict[str, Any])
async def create_batch(
    payload: CreateBatchRequest,
    session: AsyncSession = Depends(deps.get_session)
) -> Any:
    """
    Create a new Batch from Odoo Manufacturing Orders.
    """
    if not payload.mo_ids:
        raise HTTPException(status_code=400, detail="No MO IDs provided")

    # 1. Fetch MOs from Odoo
    try:
        client = OdooClient(
           url=settings.ODOO_URL,
           db=settings.ODOO_DB,
           auth_type="jsonrpc_password",
           login=settings.ODOO_LOGIN,
           secret=settings.ODOO_PASSWORD
        )
        
        # Read details for selected MOs
        mos_data = await client.search_read(
            'mrp.production', 
            domain=[['id', 'in', payload.mo_ids]],
            fields=['id', 'name', 'product_qty', 'date_start', 'state', 'origin', 'x_studio_nome_da_obra']
        )
        await client.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Odoo Fetch Error: {str(e)}")

    if not mos_data:
        raise HTTPException(status_code=404, detail="No MOs found in Odoo for provided IDs")

    # 2. Create Batch
    try:
        # Generate batch name with timestamp
        new_batch = Batch(name=f"Lote {datetime.now().strftime('%d/%m %H:%M')}")
        session.add(new_batch)
        await session.commit()
        await session.refresh(new_batch)
    except Exception as e:
        # Log error for debugging if needed, but raise to be caught by middleware
        # print(f"Batch Create Error: {e}") 
        raise e

    # 3. Process MOs
    created_requests_count = 0
    
    for mo_data in mos_data:
        # Check/Create Local ManufacturingOrder
        stmt_mo = select(ManufacturingOrder).where(ManufacturingOrder.odoo_id == mo_data['id'])
        res_mo = await session.exec(stmt_mo)
        local_mo = res_mo.first()
        
        if not local_mo:
            # Parse date
            date_start = None
            if mo_data.get('date_start'):
                # Parse Odoo date string 'YYYY-MM-DD HH:MM:SS'
                try:
                    date_start = datetime.strptime(mo_data['date_start'], '%Y-%m-%d %H:%M:%S')
                except ValueError:
                    # Fallback if format differs (e.g. ISO)
                    try:
                        date_start = datetime.fromisoformat(mo_data['date_start'])
                    except:
                        date_start = datetime.now()
            
            # Handle x_studio_nome_da_obra which can be a list [id, name]
            raw_obra = mo_data.get('x_studio_nome_da_obra')
            # print(f"DEBUG: raw_obra={raw_obra} type={type(raw_obra)}.") 
            obra_name = raw_obra
            if isinstance(raw_obra, list) and len(raw_obra) > 1:
                obra_name = raw_obra[1] # [id, "Name"]
            elif isinstance(raw_obra, list) and len(raw_obra) > 0:
                 obra_name = str(raw_obra[0]) 

            local_mo = ManufacturingOrder(
                odoo_id=mo_data['id'],
                name=mo_data['name'],
                x_studio_nome_da_obra=obra_name,
                product_qty=mo_data['product_qty'],
                date_start=date_start if date_start else datetime.now(),
                state=mo_data['state']
            )
            
            # Removed debug logging for clean run
            session.add(local_mo)
            await session.commit()
            await session.refresh(local_mo)
        
        # Create IDRequest linked to this Batch
        
        # KEY CHANGE: Idempotency Check
        # Check if there is already an active IDRequest for this MO
        stmt_existing = select(IDRequest).where(
            IDRequest.mo_id == local_mo.id,
            col(IDRequest.status).not_in(['concluida', 'cancelada'])
        )
        existing_req = await session.exec(stmt_existing)
        active_req = existing_req.first()

        if active_req:
            # Already exists and is active.
            # Decision: Reuse it? Link to new batch?
            # User requirement: "reutilizar". 
            # If it belongs to another batch, we might steal it or error. 
            # For simplicity & Lean: Move it to the new batch (re-prioritization).
            
            if active_req.batch_id != new_batch.id:
                 active_req.batch_id = new_batch.id
                 active_req.updated_at = datetime.now()
                 session.add(active_req)
                 await session.commit()
                 created_requests_count += 1 # Counted as "processed into this batch"
            
            continue # Skip creating new one

        # If not exists, create new
        new_req = IDRequest(
            mo_id=local_mo.id,
            batch_id=new_batch.id,
            status="nova"
        )
        session.add(new_req)
        await session.commit()
        await session.refresh(new_req)
        
        created_requests_count += 1
        
        # 4. Initialize Tasks (5S)
        for col_def in FIXED_COLUMNS:
            task = IDRequestTask(
                request_id=new_req.id,
                task_code=col_def.task_code,
                status=TaskStatusEnum.nao_iniciado.value 
            )
            session.add(task)
            
    await session.commit()
    
    return {
        "batch_id": new_batch.id, 
        "message": f"Batch created with {created_requests_count} items",
        "requests_count": created_requests_count
    }

@router.get("/finished", response_model=List[Dict[str, Any]])
async def get_finished_batches(
    session: AsyncSession = Depends(deps.get_session)
) -> Any:
    """
    List all finished (concluded) batches with their associated MO details.
    Returns fabrication name, board name, quantity, and completion date.
    """
    from app.models.batch import BatchStatus
    
    # 1. Fetch all concluded batches
    from sqlalchemy import or_
    stmt = select(Batch).where(
        or_(Batch.status == BatchStatus.CONCLUDED, Batch.status == BatchStatus.FINALIZED)
    ).order_by(Batch.updated_at.desc())
    result = await session.exec(stmt)
    batches = result.all()
    
    finished_list = []
    
    for batch in batches:
        # 2. Fetch IDRequests linked to this batch
        req_stmt = select(IDRequest).where(IDRequest.batch_id == batch.id)
        req_result = await session.exec(req_stmt)
        requests = req_result.all()
        
        items = []
        for req in requests:
            # 3. Fetch the ManufacturingOrder for each request
            mo = await session.get(ManufacturingOrder, req.mo_id)
            if mo:
                items.append({
                    "request_id": str(req.id),
                    "mo_name": mo.name,
                    "obra_nome": mo.x_studio_nome_da_obra or "",
                    "id_name": f"{mo.name} — {mo.x_studio_nome_da_obra or 'S/N'}",
                    "quantity": mo.product_qty,
                    "date_start": mo.date_start.isoformat() if mo.date_start else None,
                })
        
        finished_list.append({
            "batch_id": str(batch.id),
            "batch_name": batch.name,
            "batch_status": batch.status.value,
            "finished_at": (batch.finalized_at or batch.updated_at).isoformat() if (batch.finalized_at or batch.updated_at) else None,
            "items_count": len(items),
            "items": items,
        })
    
    return finished_list

@router.patch("/{batch_id}/finalize", response_model=Dict[str, Any])
async def finalize_batch(
    batch_id: UUID,
    session: AsyncSession = Depends(deps.get_session)
) -> Any:
    """
    Finalize a batch with Lean validation and Odoo activity closure.
    
    A) Validates all tasks are complete (Poka-yoke)
    B) Marks batch as FINALIZED with timestamp
    C) Closes 'Imprimir ID Visual' activities in Odoo
    D) Returns success/errors for Odoo operations
    """
    from app.models.batch import BatchStatus
    from app.models.id_request import IDRequestStatus
    from app.services.odoo_client import OdooClient
    from app.core.config import settings
    
    # 0. Fetch batch
    batch = await session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Idempotency: if already finalized, return current state
    if batch.status == BatchStatus.FINALIZED:
        return {
            "batch_id": str(batch.id),
            "batch_status": batch.status.value,
            "finalized_at": batch.finalized_at.isoformat() if batch.finalized_at else None,
            "odoo_activities_closed": 0,
            "errors": []
        }
    
    # 1. Fetch IDRequests for this batch
    req_stmt = select(IDRequest).where(IDRequest.batch_id == batch_id)
    req_result = await session.exec(req_stmt)
    requests = req_result.all()
    
    if not requests:
        raise HTTPException(status_code=400, detail="Batch has no IDRequests")
    
    # A) LEAN VALIDATION — Poka-yoke
    pendencies = []
    BLOCKED_STATUSES = {"nao_iniciado", "montado", "bloqueado"}
    
    for req in requests:
        mo = await session.get(ManufacturingOrder, req.mo_id)
        mo_name = mo.name if mo else "Unknown"
        
        # Fetch tasks for this request
        task_stmt = select(IDRequestTask).where(IDRequestTask.request_id == req.id)
        task_result = await session.exec(task_stmt)
        tasks = task_result.all()
        
        for task in tasks:
            task_status = task.status
            
            # Skip non-applicable tasks
            if task_status == "nao_aplicavel":
                continue
            
            # Check QA_FINAL specifically
            if task.task_code == "QA_FINAL":
                if task_status != "impresso":
                    pendencies.append({
                        "mo_name": mo_name,
                        "request_id": str(req.id),
                        "task_code": task.task_code,
                        "status": task_status,
                        "reason": "QA_FINAL deve estar 'impresso'"
                    })
                continue
            
            # Any applicable task in blocked statuses
            if task_status in BLOCKED_STATUSES:
                pendencies.append({
                    "mo_name": mo_name,
                    "request_id": str(req.id),
                    "task_code": task.task_code,
                    "status": task_status,
                    "reason": f"Task em status '{task_status}'"
                })
    
    if pendencies:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Existem pendências que impedem a finalização",
                "pendencies": pendencies
            }
        )
    
    # B) FINALIZE LOCALLY
    now = datetime.now(timezone.utc)
    batch.status = BatchStatus.FINALIZED
    batch.finalized_at = now
    session.add(batch)
    
    # Update IDRequest statuses
    for req in requests:
        req.status = IDRequestStatus.CONCLUIDA
        session.add(req)
    
    await session.commit()
    await session.refresh(batch)
    
    # C) CLOSE ODOO ACTIVITIES
    odoo_errors = []
    odoo_closed_count = 0
    
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        # Get activity type ID once
        activity_type_id = await client.get_activity_type_id("Imprimir ID Visual")
        
        for req in requests:
            mo = await session.get(ManufacturingOrder, req.mo_id)
            if not mo:
                continue
            
            try:
                # Find activities for this MO
                activities = await client.find_activities_for_mo(
                    odoo_mo_id=mo.odoo_id,
                    activity_type_id=activity_type_id or 0
                )
                
                if activities:
                    activity_ids = [a['id'] for a in activities]
                    await client.close_activities(activity_ids)
                    odoo_closed_count += len(activity_ids)
                # No activities found = idempotent success
                
            except Exception as e:
                odoo_errors.append({
                    "odoo_mo_id": mo.odoo_id,
                    "mo_name": mo.name,
                    "reason": str(e)
                })
    finally:
        await client.close()
    
    # D) RETURN RESPONSE
    return {
        "batch_id": str(batch.id),
        "batch_status": batch.status.value,
        "finalized_at": batch.finalized_at.isoformat() if batch.finalized_at else None,
        "odoo_activities_closed": odoo_closed_count,
        "errors": odoo_errors
    }

