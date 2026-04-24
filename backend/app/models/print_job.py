"""
Modelo de fila de impressão (PrintJob).

Cada PrintJob representa uma solicitação de impressão ZPL para uma impressora
Zebra específica. O ZPL já renderizado é armazenado para permitir reimpressão
futura sem recalcular o template.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import Index, Text
from sqlmodel import Field, SQLModel, Column

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class PrintJobStatus(str, Enum):
    pending    = "pending"
    processing = "processing"
    done       = "done"
    failed     = "failed"


class PrintJob(SQLModel, table=True):
    """
    Fila de impressão ZPL.

    Regras de negócio:
    - Jobs com status 'done' ou 'failed' não podem ser revertidos para 'pending'.
    - O campo zpl_payload armazena o ZPL completo para permitir reimpressão.
    - O índice composto (status, printer_id) acelera o polling do agente.
    """

    __tablename__ = "print_job"

    __table_args__ = (
        # Índice composto para polling eficiente: WHERE status='pending' AND printer_id=X
        Index("ix_print_job_status_printer_id", "status", "printer_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)

    printer_id: int = Field(foreign_key="printer.id", index=True)

    # Nullable: pode existir job sem IDRequest (ex: teste de impressão)
    id_request_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="id_request.id",
        nullable=True,
        index=True,
    )

    label_type: str                                        # "technical" | "external" | "both"
    zpl_payload: str = Field(sa_column=Column(Text, nullable=False))  # ZPL completo renderizado

    status: PrintJobStatus = Field(default=PrintJobStatus.pending, index=True)

    created_at: datetime = Field(default_factory=_now)
    claimed_at: Optional[datetime] = Field(default=None)    # quando o agente pegou o job
    completed_at: Optional[datetime] = Field(default=None)

    failed_reason: Optional[str] = Field(default=None)
    agent_id: Optional[str] = Field(default=None)           # identificador do agente
    retry_count: int = Field(default=0)
