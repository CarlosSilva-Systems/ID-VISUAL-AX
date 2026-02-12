from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship, JSON, Column
from enum import Enum

# --- Enums ---
print("DEBUG: IMPORTING ID_REQUEST WITH MONTADO --------------------------------")
class IDRequestStatus(str, Enum):
    NOVA = "nova"
    TRIAGEM = "triagem"
    EM_LOTE = "em_lote"
    EM_PROGRESSO = "em_progresso"
    BLOQUEADA = "bloqueada"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"

OPEN_STATUSES = [
    IDRequestStatus.NOVA,
    IDRequestStatus.TRIAGEM,
    IDRequestStatus.EM_LOTE,
    IDRequestStatus.EM_PROGRESSO
]

class TaskStatusV2(str, Enum):
    NAO_INICIADO = "nao_iniciado"
    MONTADO = "montado"
    IMPRIMINDO = "imprimindo" # Doc specific
    IMPRESSO = "impresso"     # Doc specific
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDO = "concluido"
    BLOQUEADO = "bloqueado"
    NAO_APLICAVEL = "nao_aplicavel"

class PackageType(str, Enum):
    COMANDO = "comando"
    DISTRIBUICAO = "distribuicao"
    APARTAMENTO = "apartamento"
    PERSONALIZADO = "personalizado"

# --- Blueprints (Catalog) ---
class TaskBlueprint(SQLModel):
    code: str = Field(primary_key=True)
    label: str
    order: int
    is_mandatory: bool = False
    allow_parallel: bool = True
    # JSON schemas for checklists or block reasons could be stored here or hardcoded/config
    
class PackageBlueprint(SQLModel):
    code: PackageType = Field(primary_key=True)
    name: str

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
    odoo_activity_id: Optional[int] = None
    transfer_note: Optional[str] = None

    # Production Tracking
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    
    version: int = Field(default=1) # Optimistic locking
    
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})

    # tasks: List["IDRequestTask"] = Relationship(back_populates="request")

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
    
    # request: IDRequest = Relationship(back_populates="tasks")
