"""
Endpoints de enfileiramento de impressão para etiquetas WAGO.

Rotas (prefixo /id-visual/print):
  POST /print/devices          — enfileira DeviceLabel(s) de uma MO
  POST /print/door             — enfileira DoorLabel salvo
  POST /print/door/inline      — enfileira etiqueta de porta sem salvar
  POST /print/terminals        — enfileira TerminalLabel(s) de uma MO
"""
import logging
import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.models.audit import HistoryLog
from app.models.label_device import DeviceLabel
from app.models.label_door import DoorLabel
from app.models.label_terminal import TerminalLabel
from app.models.print_job import PrintJob, PrintJobStatus
from app.models.printer import Printer
from app.services.zpl_templates import (
    render_device_labels,
    render_door_label,
    render_terminal_labels,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PrintDevicesRequest(BaseModel):
    mo_id: int
    printer_id: int
    device_ids: Optional[List[int]] = None   # None = imprimir todos da MO


class PrintDevicesResponse(BaseModel):
    jobs_created: int
    job_ids: List[int]


class PrintDoorRequest(BaseModel):
    door_label_id: int
    printer_id: int


class PrintDoorInlineRequest(BaseModel):
    mo_id: int
    printer_id: int
    equipment_name: str
    columns: List[str]


class PrintDoorResponse(BaseModel):
    job_id: int


class PrintTerminalsRequest(BaseModel):
    mo_id: int
    printer_id: int
    terminal_ids: Optional[List[int]] = None  # None = imprimir todos da MO


class PrintTerminalsResponse(BaseModel):
    jobs_created: int
    job_ids: List[int]


# ---------------------------------------------------------------------------
# Helper: valida impressora ativa
# ---------------------------------------------------------------------------

async def _get_active_printer(printer_id: int, session: AsyncSession) -> Printer:
    printer = await session.get(Printer, printer_id)
    if not printer or not printer.is_active:
        raise HTTPException(
            status_code=404,
            detail=f"Impressora {printer_id} não encontrada ou inativa.",
        )
    return printer


# ---------------------------------------------------------------------------
# Helper: cria PrintJobs a partir de lista de ZPL e retorna IDs
# ---------------------------------------------------------------------------

async def _enqueue_jobs(
    zpl_list: List[str],
    printer_id: int,
    label_type: str,
    session: AsyncSession,
) -> List[int]:
    job_ids: List[int] = []
    for zpl in zpl_list:
        job = PrintJob(
            printer_id=printer_id,
            label_type=label_type,
            zpl_payload=zpl,
            status=PrintJobStatus.pending,
        )
        session.add(job)
        await session.flush()   # obtém o id gerado sem commit
        job_ids.append(job.id)
    return job_ids


# ---------------------------------------------------------------------------
# POST /print/devices
# ---------------------------------------------------------------------------

@router.post("/devices", response_model=PrintDevicesResponse)
async def enqueue_device_labels(
    payload: PrintDevicesRequest,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Enfileira impressão de etiquetas de dispositivo (WAGO 210-805) para uma MO.

    Se device_ids for fornecido, imprime apenas os dispositivos listados.
    Caso contrário, imprime todos os DeviceLabel da MO ordenados por order_index.
    Pode gerar múltiplos PrintJobs se houver mais de 20 dispositivos.
    """
    await _get_active_printer(payload.printer_id, session)

    stmt = (
        select(DeviceLabel)
        .where(DeviceLabel.mo_id == payload.mo_id)
        .order_by(DeviceLabel.order_index)
    )
    if payload.device_ids:
        stmt = stmt.where(DeviceLabel.id.in_(payload.device_ids))

    result = await session.exec(stmt)
    records = result.all()

    if not records:
        raise HTTPException(
            status_code=404,
            detail=f"Nenhum DeviceLabel encontrado para mo_id={payload.mo_id}.",
        )

    devices = [{"device_tag": r.device_tag, "description": r.description} for r in records]
    zpl_list = render_device_labels(devices)

    job_ids = await _enqueue_jobs(zpl_list, payload.printer_id, "device", session)

    # HistoryLog
    log = HistoryLog(
        entity_type="manufacturing_order",
        entity_id=uuid.UUID(int=0),   # placeholder — mo_id é int, não UUID
        action=f"Impressão enfileirada: {len(records)} dispositivos (MO {payload.mo_id})",
        after_json={
            "label_type": "device",
            "mo_id": payload.mo_id,
            "jobs_created": len(job_ids),
            "printer_id": payload.printer_id,
        },
        user_id=current_user.id if current_user else None,
    )
    session.add(log)
    await session.commit()

    logger.info(
        f"[print_wago] devices mo_id={payload.mo_id} "
        f"records={len(records)} jobs={len(job_ids)}"
    )
    return PrintDevicesResponse(jobs_created=len(job_ids), job_ids=job_ids)


# ---------------------------------------------------------------------------
# POST /print/door
# ---------------------------------------------------------------------------

@router.post("/door", response_model=PrintDoorResponse)
async def enqueue_door_label(
    payload: PrintDoorRequest,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """Enfileira impressão de etiqueta de porta (WAGO 210-855) a partir de DoorLabel salvo."""
    await _get_active_printer(payload.printer_id, session)

    door = await session.get(DoorLabel, payload.door_label_id)
    if not door:
        raise HTTPException(
            status_code=404,
            detail=f"DoorLabel {payload.door_label_id} não encontrado.",
        )

    zpl = render_door_label(door.equipment_name, door.columns or [])
    job_ids = await _enqueue_jobs([zpl], payload.printer_id, "door", session)

    log = HistoryLog(
        entity_type="manufacturing_order",
        entity_id=uuid.UUID(int=0),
        action=f"Impressão enfileirada: porta '{door.equipment_name}' (MO {door.mo_id})",
        after_json={
            "label_type": "door",
            "door_label_id": payload.door_label_id,
            "printer_id": payload.printer_id,
        },
        user_id=current_user.id if current_user else None,
    )
    session.add(log)
    await session.commit()

    logger.info(f"[print_wago] door door_label_id={payload.door_label_id} job={job_ids[0]}")
    return PrintDoorResponse(job_id=job_ids[0])


# ---------------------------------------------------------------------------
# POST /print/door/inline
# ---------------------------------------------------------------------------

@router.post("/door/inline", response_model=PrintDoorResponse)
async def enqueue_door_label_inline(
    payload: PrintDoorInlineRequest,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Enfileira impressão de etiqueta de porta sem salvar DoorLabel.
    Útil para uso rápido sem importação EPLAN.
    """
    await _get_active_printer(payload.printer_id, session)

    zpl = render_door_label(payload.equipment_name, payload.columns)
    job_ids = await _enqueue_jobs([zpl], payload.printer_id, "door", session)

    log = HistoryLog(
        entity_type="manufacturing_order",
        entity_id=uuid.UUID(int=0),
        action=f"Impressão inline enfileirada: porta '{payload.equipment_name}' (MO {payload.mo_id})",
        after_json={
            "label_type": "door",
            "inline": True,
            "mo_id": payload.mo_id,
            "equipment_name": payload.equipment_name,
            "printer_id": payload.printer_id,
        },
        user_id=current_user.id if current_user else None,
    )
    session.add(log)
    await session.commit()

    logger.info(
        f"[print_wago] door/inline mo_id={payload.mo_id} "
        f"equipment='{payload.equipment_name}' job={job_ids[0]}"
    )
    return PrintDoorResponse(job_id=job_ids[0])


# ---------------------------------------------------------------------------
# POST /print/terminals
# ---------------------------------------------------------------------------

@router.post("/terminals", response_model=PrintTerminalsResponse)
async def enqueue_terminal_labels(
    payload: PrintTerminalsRequest,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Enfileira impressão de marcadores de borne (WAGO 2009-110) para uma MO.

    Se terminal_ids for fornecido, imprime apenas os bornes listados.
    Caso contrário, imprime todos os TerminalLabel da MO ordenados por order_index.
    Pode gerar múltiplos PrintJobs se houver mais de 50 bornes.
    """
    await _get_active_printer(payload.printer_id, session)

    stmt = (
        select(TerminalLabel)
        .where(TerminalLabel.mo_id == payload.mo_id)
        .order_by(TerminalLabel.order_index)
    )
    if payload.terminal_ids:
        stmt = stmt.where(TerminalLabel.id.in_(payload.terminal_ids))

    result = await session.exec(stmt)
    records = result.all()

    if not records:
        raise HTTPException(
            status_code=404,
            detail=f"Nenhum TerminalLabel encontrado para mo_id={payload.mo_id}.",
        )

    terminals = [
        {
            "terminal_number": r.terminal_number,
            "wire_number": r.wire_number,
            "group_name": r.group_name,
        }
        for r in records
    ]
    zpl_list = render_terminal_labels(terminals)

    job_ids = await _enqueue_jobs(zpl_list, payload.printer_id, "terminal", session)

    log = HistoryLog(
        entity_type="manufacturing_order",
        entity_id=uuid.UUID(int=0),
        action=f"Impressão enfileirada: {len(records)} bornes (MO {payload.mo_id})",
        after_json={
            "label_type": "terminal",
            "mo_id": payload.mo_id,
            "jobs_created": len(job_ids),
            "printer_id": payload.printer_id,
        },
        user_id=current_user.id if current_user else None,
    )
    session.add(log)
    await session.commit()

    logger.info(
        f"[print_wago] terminals mo_id={payload.mo_id} "
        f"records={len(records)} jobs={len(job_ids)}"
    )
    return PrintTerminalsResponse(jobs_created=len(job_ids), job_ids=job_ids)
