from __future__ import annotations
from enum import Enum
from typing import List, Optional, Dict
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field

class TaskStatusEnum(str, Enum):
    nao_iniciado = "nao_iniciado"
    montado = "montado"  # Visual: Amarelo (ou "Imprimindo" para DOCS)
    impresso = "impresso"  # Visual: Verde (ou "Concluído")
    bloqueado = "bloqueado"
    nao_aplicavel = "nao_aplicavel"

class MatrixColumn(BaseModel):
    task_code: str
    label: str
    order: int

class MatrixCell(BaseModel):
    status: TaskStatusEnum
    version: int
    updated_at: Optional[datetime] = None  # ISO 8601 UTC managed by Pydantic
    blocked_reason: Optional[str] = None
    update_note: Optional[str] = None

class MatrixRow(BaseModel):
    request_id: UUID
    odoo_mo_id: Optional[int] = None
    mo_number: str
    product_name: Optional[str] = None  # Nome do produto (sem código AX)
    obra_nome: Optional[str] = None
    package_code: Optional[str] = None
    sla_text: Optional[str] = None
    quantity: float
    date_start: Optional[datetime] = None
    cells: Dict[str, MatrixCell] = Field(default_factory=dict)

class BatchStats(BaseModel):
    docs_pending: int = 0
    docs_printing: int = 0
    docs_printed: int = 0
    docs_blocked: int = 0
    progress_pct: float = 0.0
    count_today: int = 0
    count_week: int = 0
    total_blocked: int = 0
    total_rows: int = 0

class BatchMatrixResponse(BaseModel):
    batch_id: UUID
    batch_name: str
    batch_status: str
    stats: BatchStats
    columns: List[MatrixColumn]
    rows: List[MatrixRow]

class TaskUpdatePayload(BaseModel):
    request_id: UUID
    task_code: str
    new_status: TaskStatusEnum
    version: int
    update_note: Optional[str] = None
    blocked_reason: Optional[str] = None

class TaskUpdateResponse(BaseModel):
    updated_cell: MatrixCell
    updated_stats: BatchStats

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
