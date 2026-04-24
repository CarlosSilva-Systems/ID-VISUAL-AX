"""
Endpoints de fila de impressão ZPL.

Dois grupos de rotas:
  - Agente (X-Agent-Key): polling de jobs, marcar done/failed
  - Frontend (Bearer token): criar job, listar impressoras, consultar status
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import deps
from app.models.audit import HistoryLog
from app.models.id_request import IDRequest
from app.models.manufacturing import ManufacturingOrder
from app.models.print_job import PrintJob, PrintJobStatus
from app.models.printer import Printer
from app.models.system_setting import SystemSetting
from app.services.zpl_templates import render_external_label, render_technical_label

logger = logging.getLogger(__name__)
router = APIRouter()

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)

# ---------------------------------------------------------------------------
# Dependência de autenticação do agente
# ---------------------------------------------------------------------------

async def verify_agent_key(
    x_agent_key: str = Header(..., alias="X-Agent-Key"),
    session: AsyncSession = Depends(deps.get_session),
) -> str:
    """
    Valida o header X-Agent-Key contra SystemSetting 'print_agent_key'.
    Retorna 401 se ausente ou incorreto.
    """
    stmt = select(SystemSetting).where(SystemSetting.key == "print_agent_key")
    result = await session.exec(stmt)
    setting = result.first()

    if not setting or not setting.value:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="print_agent_key não configurado em SystemSetting.",
        )

    if x_agent_key != setting.value.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-Agent-Key inválido.",
        )

    return x_agent_key


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PendingJobOut(BaseModel):
    id: int
    label_type: str
    zpl_payload: str


class JobStatusOut(BaseModel):
    id: int
    status: str
    completed_at: Optional[datetime] = None
    failed_reason: Optional[str] = None


class CreatePrintJobRequest(BaseModel):
    printer_id: int
    id_request_id: str          # UUID da IDRequest
    label_type: str             # "technical" | "external" | "both"
    # Dados técnicos opcionais
    corrente_nominal: Optional[str] = None
    frequencia: Optional[str] = "60Hz"
    cap_corte: Optional[str] = None
    tensao: Optional[str] = None
    curva_disparo: Optional[str] = None
    tensao_impulso: Optional[str] = None
    tensao_isolamento: Optional[str] = None
    qr_url: Optional[str] = None


class CreatePrintJobResponse(BaseModel):
    job_id: int
    status: str
    printer_name: str
    created_at: datetime


class FailedJobRequest(BaseModel):
    reason: str


class PrinterOut(BaseModel):
    id: int
    name: str
    location: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints do Agente
# ---------------------------------------------------------------------------

@router.get(
    "/printers/{printer_id}/jobs/pending",
    response_model=List[PendingJobOut],
    tags=["print_agent"],
)
async def get_pending_jobs(
    printer_id: int,
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-Id"),
    session: AsyncSession = Depends(deps.get_session),
    _key: str = Depends(verify_agent_key),
) -> Any:
    """
    Retorna até 5 jobs pendentes para a impressora e os marca como 'processing'.
    Usa SELECT FOR UPDATE SKIP LOCKED para evitar que dois agentes peguem o mesmo job.
    """
    now = _now()

    # SELECT FOR UPDATE SKIP LOCKED — evita race condition entre múltiplos agentes
    raw = await session.execute(
        text(
            """
            SELECT id FROM print_job
            WHERE status = 'pending' AND printer_id = :printer_id
            ORDER BY created_at ASC
            LIMIT 5
            FOR UPDATE SKIP LOCKED
            """
        ),
        {"printer_id": printer_id},
    )
    job_ids = [row[0] for row in raw.fetchall()]

    if not job_ids:
        return []

    # Busca os objetos e atualiza atomicamente
    stmt = select(PrintJob).where(PrintJob.id.in_(job_ids))
    result = await session.exec(stmt)
    jobs = result.all()

    claimed: List[PendingJobOut] = []
    for job in jobs:
        job.status = PrintJobStatus.processing
        job.claimed_at = now
        job.agent_id = x_agent_id
        session.add(job)
        claimed.append(PendingJobOut(
            id=job.id,
            label_type=job.label_type,
            zpl_payload=job.zpl_payload,
        ))

    await session.commit()
    return claimed


@router.patch(
    "/jobs/{job_id}/done",
    response_model=JobStatusOut,
    tags=["print_agent"],
)
async def mark_job_done(
    job_id: int,
    session: AsyncSession = Depends(deps.get_session),
    _key: str = Depends(verify_agent_key),
) -> Any:
    """Marca o job como concluído e registra HistoryLog se vinculado a uma IDRequest."""
    job = await session.get(PrintJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"PrintJob {job_id} não encontrado.")

    if job.status in (PrintJobStatus.done, PrintJobStatus.failed):
        raise HTTPException(
            status_code=400,
            detail=f"Job já finalizado com status '{job.status}'.",
        )

    now = _now()
    job.status = PrintJobStatus.done
    job.completed_at = now
    session.add(job)

    # HistoryLog se vinculado a uma IDRequest
    if job.id_request_id:
        log = HistoryLog(
            entity_type="id_request",
            entity_id=job.id_request_id,
            action="Etiqueta impressa pelo agente",
            after_json={"print_job_id": job_id, "label_type": job.label_type},
        )
        session.add(log)

    await session.commit()
    await session.refresh(job)

    return JobStatusOut(
        id=job.id,
        status=job.status,
        completed_at=job.completed_at,
    )


@router.patch(
    "/jobs/{job_id}/failed",
    response_model=JobStatusOut,
    tags=["print_agent"],
)
async def mark_job_failed(
    job_id: int,
    payload: FailedJobRequest,
    session: AsyncSession = Depends(deps.get_session),
    _key: str = Depends(verify_agent_key),
) -> Any:
    """
    Marca o job como falho.
    Se retry_count < 3, volta para 'pending' para nova tentativa.
    """
    job = await session.get(PrintJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"PrintJob {job_id} não encontrado.")

    if job.status in (PrintJobStatus.done, PrintJobStatus.failed):
        raise HTTPException(
            status_code=400,
            detail=f"Job já finalizado com status '{job.status}'.",
        )

    job.retry_count += 1
    job.failed_reason = payload.reason

    if job.retry_count < 3:
        # Volta para pending para nova tentativa
        job.status = PrintJobStatus.pending
        job.claimed_at = None
        job.agent_id = None
        logger.warning(
            f"[print_queue] Job {job_id} falhou (tentativa {job.retry_count}/3), "
            f"voltando para pending. Motivo: {payload.reason}"
        )
    else:
        job.status = PrintJobStatus.failed
        job.completed_at = _now()
        logger.error(
            f"[print_queue] Job {job_id} falhou definitivamente após {job.retry_count} tentativas. "
            f"Motivo: {payload.reason}"
        )

    session.add(job)
    await session.commit()
    await session.refresh(job)

    return JobStatusOut(
        id=job.id,
        status=job.status,
        failed_reason=job.failed_reason,
    )


# ---------------------------------------------------------------------------
# Endpoints do Frontend
# ---------------------------------------------------------------------------

@router.post(
    "/jobs",
    response_model=CreatePrintJobResponse,
    tags=["print_queue"],
)
async def create_print_job(
    payload: CreatePrintJobRequest,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """
    Cria um PrintJob na fila para a impressora especificada.

    Renderiza o ZPL a partir dos dados da IDRequest + dados técnicos do body
    e persiste o payload completo para entrega assíncrona pelo agente.
    """
    # 1. Validar printer_id
    printer = await session.get(Printer, payload.printer_id)
    if not printer or not printer.is_active:
        raise HTTPException(
            status_code=404,
            detail=f"Impressora {payload.printer_id} não encontrada ou inativa.",
        )

    # 2. Validar id_request_id
    try:
        req_uuid = uuid.UUID(payload.id_request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="id_request_id inválido — deve ser um UUID.")

    id_req = await session.get(IDRequest, req_uuid)
    if not id_req:
        raise HTTPException(status_code=404, detail=f"IDRequest {payload.id_request_id} não encontrada.")

    mo = await session.get(ManufacturingOrder, id_req.mo_id)
    if not mo:
        raise HTTPException(status_code=404, detail="ManufacturingOrder associada não encontrada.")

    # 3. Validar label_type
    if payload.label_type not in ("technical", "external", "both"):
        raise HTTPException(status_code=400, detail="label_type deve ser 'technical', 'external' ou 'both'.")

    # 4. Renderizar ZPL
    parts: List[str] = []

    if payload.label_type in ("technical", "both"):
        parts.append(render_technical_label(
            nome_obra=mo.x_studio_nome_da_obra or "",
            nome_quadro=mo.product_name or "",
            corrente_nominal=payload.corrente_nominal or "",
            frequencia=payload.frequencia or "60Hz",
            cap_corte=payload.cap_corte or "",
            tensao=payload.tensao or "",
            curva_disparo=payload.curva_disparo or "",
            tensao_impulso=payload.tensao_impulso or "",
            tensao_isolamento=payload.tensao_isolamento or "",
        ))

    if payload.label_type in ("external", "both"):
        parts.append(render_external_label(
            ax_code=mo.ax_code or "",
            fab_code=mo.fab_code or "",
            nome_quadro=mo.product_name or "",
            nome_obra=mo.x_studio_nome_da_obra or "",
            qr_url=payload.qr_url or "",
        ))

    zpl_payload = "\n".join(parts)

    # 5. Criar PrintJob
    job = PrintJob(
        printer_id=payload.printer_id,
        id_request_id=req_uuid,
        label_type=payload.label_type,
        zpl_payload=zpl_payload,
        status=PrintJobStatus.pending,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    logger.info(
        f"[print_queue] Job {job.id} criado — printer={printer.name} "
        f"label_type={payload.label_type} MO={mo.name}"
    )

    return CreatePrintJobResponse(
        job_id=job.id,
        status=job.status,
        printer_name=printer.name,
        created_at=job.created_at,
    )


@router.get(
    "/jobs/{job_id}/status",
    response_model=JobStatusOut,
    tags=["print_queue"],
)
async def get_job_status(
    job_id: int,
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """Retorna o status atual do job para polling do frontend."""
    job = await session.get(PrintJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"PrintJob {job_id} não encontrado.")

    return JobStatusOut(
        id=job.id,
        status=job.status,
        completed_at=job.completed_at,
        failed_reason=job.failed_reason,
    )


@router.get(
    "/printers",
    response_model=List[PrinterOut],
    tags=["print_queue"],
)
async def list_printers(
    session: AsyncSession = Depends(deps.get_session),
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """Lista impressoras ativas."""
    stmt = select(Printer).where(Printer.is_active == True).order_by(Printer.name)
    result = await session.exec(stmt)
    printers = result.all()
    return [PrinterOut(id=p.id, name=p.name, location=p.location) for p in printers]
