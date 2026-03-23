from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List
from sqlmodel import Field, SQLModel, JSON, Column
from enum import Enum

# --- Enums ---
class IDRequestStatus(str, Enum):
    NOVA = "nova"
    TRIAGEM = "triagem"
    EM_LOTE = "em_lote"
    EM_PROGRESSO = "em_progresso"
    BLOQUEADA = "bloqueada"
    CONCLUIDA = "concluida"
    ENTREGUE = "entregue"
    CANCELADA = "cancelada"

OPEN_STATUSES = [
    IDRequestStatus.NOVA,
    IDRequestStatus.TRIAGEM,
    IDRequestStatus.EM_LOTE,
    IDRequestStatus.EM_PROGRESSO,
    IDRequestStatus.BLOQUEADA
]

class PackageType(str, Enum):
    COMANDO = "comando"
    POTENCIA = "potencia"
    BARRAGEM = "barragem"
    OUTRO = "outro"

# --- Models ---

class IDRequest(SQLModel, table=True):
    __tablename__ = "id_request"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    mo_id: uuid.UUID = Field(foreign_key="manufacturing_order.id", index=True)
    batch_id: Optional[uuid.UUID] = Field(default=None, foreign_key="batch.id", index=True)
    package_code: PackageType = Field(default=PackageType.COMANDO)
    status: IDRequestStatus = Field(default=IDRequestStatus.NOVA, index=True)
    priority: str = Field(default="normal") # normal, urgente
    source: str = Field(default="odoo")  # "odoo" | "manual"
    requester_name: Optional[str] = None
    notes: Optional[str] = None
    
    # Transfer to Standard Queue fields
    transferred_to_queue: bool = Field(default=False)
    transferred_at: Optional[datetime] = None
    odoo_activity_id: Optional[int] = None
    transfer_note: Optional[str] = None
    
    # Production Tracking
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    
    # Analytics & Lifecycle Timestamps (MPR Dashboard)
    solicitado_em: Optional[datetime] = Field(default=None, index=True)
    iniciado_em: Optional[datetime] = Field(default=None, index=True)
    concluido_em: Optional[datetime] = Field(default=None, index=True)
    entregue_em: Optional[datetime] = Field(default=None, index=True)
    aprovado_em: Optional[datetime] = Field(default=None, index=True)
    
    version: int = Field(default=1) # Optimistic locking
    
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})

class IDRequestTask(SQLModel, table=True):
    __tablename__ = "id_request_task"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    request_id: uuid.UUID = Field(foreign_key="id_request.id", index=True)
    task_code: str = Field(index=True) # References TaskBlueprint.code logically
    
    # TODO: Revert to TaskStatusV2 Enum once SQLAlchemy LookupError is resolved.
    # Currently using str to bypass "enum not found" error during fetch.
    status: str = Field(default="nao_iniciado") 
    # status: TaskStatusV2 = Field(default=TaskStatusV2.NAO_INICIADO) # Updated to V2
    blocked_reason: Optional[str] = None
    blocked_note: Optional[str] = None
    
    checklist_state_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    
    version: int = Field(default=1) # Optimistic locking
    
    updated_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})

class TaskBlueprint(SQLModel, table=True):
    __tablename__ = "task_blueprint"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(unique=True, index=True) # e.g. "concepcao", "diagramacao"
    name: str
    description: Optional[str] = None
    package_type: PackageType = Field(default=PackageType.COMANDO) # Which package does this apply to
    order_index: int = Field(default=0) # Order in the list

class PackageBlueprint(SQLModel, table=True):
    __tablename__ = "package_blueprint"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    code: PackageType = Field(unique=True, index=True)
    name: str # e.g. "Comando", "Potencia"
    task_codes: str # Comma-separated or JSON list of task codes
