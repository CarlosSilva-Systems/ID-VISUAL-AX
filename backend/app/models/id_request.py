from __future__ import annotations
import uuid
from datetime import datetime, timezone
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
    # Usando str para evitar LookupError intermitente no SQLAlchemy/SQLite
    package_code: str = Field(default=PackageType.COMANDO.value, index=True)
    status: str = Field(default=IDRequestStatus.NOVA.value, index=True)
    priority: str = Field(default="normal", index=True) # normal, urgente
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

    # Rastreamento de "Não Consta" — ID solicitada que não chegou ao operador.
    # nao_consta_em: timestamp do registro da ocorrência.
    # nao_consta_items: lista JSON dos task_codes que não chegaram (ex: ["WAGO_210_804"]).
    # nao_consta_registrado_por: nome do operador que registrou.
    nao_consta_em: Optional[datetime] = Field(default=None, index=True)
    nao_consta_items: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    nao_consta_registrado_por: Optional[str] = Field(default=None)
    
    version: int = Field(default=1) # Optimistic locking
    
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        sa_column_kwargs={"onupdate": lambda: datetime.now(timezone.utc).replace(tzinfo=None)},
    )

class IDRequestTask(SQLModel, table=True):
    __tablename__ = "id_request_task"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    request_id: uuid.UUID = Field(foreign_key="id_request.id", index=True)
    task_code: str = Field(index=True)  # Referencia TaskBlueprint.code logicamente

    # Usando str em vez de Enum para evitar LookupError intermitente do SQLAlchemy
    # com SQLite em modo async. Valores válidos: nao_iniciado, montado, impresso,
    # bloqueado, nao_aplicavel. Validação feita na camada de serviço/endpoint.
    status: str = Field(default="nao_iniciado")
    blocked_reason: Optional[str] = None
    blocked_note: Optional[str] = None
    
    checklist_state_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    
    version: int = Field(default=1)  # Optimistic locking

    updated_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        sa_column_kwargs={"onupdate": lambda: datetime.now(timezone.utc).replace(tzinfo=None)},
    )

class TaskBlueprint(SQLModel, table=True):
    __tablename__ = "task_blueprint"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(unique=True, index=True) # e.g. "concepcao", "diagramacao"
    name: str
    description: Optional[str] = None
    package_type: str = Field(default=PackageType.COMANDO.value) # str fallback
    order_index: int = Field(default=0) # Order in the list

class PackageBlueprint(SQLModel, table=True):
    __tablename__ = "package_blueprint"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(unique=True, index=True) # str fallback
    name: str # e.g. "Comando", "Potencia"
    task_codes: str # Comma-separated or JSON list of task codes
