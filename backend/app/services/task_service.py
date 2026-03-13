from typing import List
from uuid import UUID
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from app.models.id_request import IDRequestTask
from app.schemas.matrix_view import TaskStatusEnum, FIXED_COLUMNS

async def initialize_request_tasks(request_id: UUID, session: AsyncSession):
    """
    Ensures all 5S tasks (FIXED_COLUMNS) are initialized for a given IDRequest.
    Idempotent: Only creates tasks that don't exist.
    This is the Single Source of Truth for task creation.
    """
    # Fetch existing task codes for this request
    stmt = select(IDRequestTask.task_code).where(IDRequestTask.request_id == request_id)
    res = await session.exec(stmt)
    existing_codes = set(res.all())

    for col_def in FIXED_COLUMNS:
        code = col_def.task_code
        if code not in existing_codes:
            task = IDRequestTask(
                request_id=request_id,
                task_code=code,
                status=TaskStatusEnum.nao_iniciado.value
            )
            session.add(task)
    
    # We don't commit here, let the caller handle the transaction scope
    return True
