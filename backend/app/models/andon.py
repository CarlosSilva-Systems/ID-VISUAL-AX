from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class AndonStatus(SQLModel, table=True):
    """Estado atual (cache) de cada centro de trabalho no Andon.
    Um registro por workcenter. Atualizado a cada acionamento."""

    __tablename__ = "andon_status"

    id: Optional[int] = Field(default=None, primary_key=True)
    workcenter_odoo_id: int = Field(index=True, unique=True)
    workcenter_name: str
    status: str = Field(default="cinza")  # verde | amarelo | vermelho | cinza
    updated_at: datetime = Field(default_factory=_now)
    updated_by: Optional[str] = Field(default=None)


# AndonEvent e AndonMaterialRequest foram removidos na refatoração de arquitetura
# (2026-04-29). Eram tabelas órfãs — nunca instanciadas em nenhum endpoint.
# O histórico de acionamentos é registrado via chatter no Odoo (fonte única de verdade).


class AndonCall(SQLModel, table=True):
    """Chamados Andon estruturados."""

    __tablename__ = "andon_call"

    id: Optional[int] = Field(default=None, primary_key=True)
    color: str  # YELLOW | RED
    category: str
    reason: str
    description: Optional[str] = Field(default=None)

    workcenter_id: int = Field(index=True)
    workcenter_name: str
    mo_id: Optional[int] = Field(default=None)

    status: str = Field(default="OPEN", index=True)  # OPEN | IN_PROGRESS | RESOLVED

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    triggered_by: str
    assigned_team: Optional[str] = Field(default=None)
    resolved_note: Optional[str] = Field(default=None)

    is_stop: bool = Field(default=False)

    odoo_picking_id: Optional[int] = Field(default=None)
    odoo_activity_id: Optional[int] = Field(default=None)

    downtime_minutes: Optional[int] = Field(default=None)

    requires_justification: bool = Field(default=False)
    justified_at: Optional[datetime] = Field(default=None)
    justified_by: Optional[str] = Field(default=None)
    root_cause_category: Optional[str] = Field(default=None)
    root_cause_detail: Optional[str] = Field(default=None)
    action_taken: Optional[str] = Field(default=None)


class SyncQueue(SQLModel, table=True):
    """Fila de sincronização para comandos enviados ao Odoo."""

    __tablename__ = "sync_queue"

    id: Optional[int] = Field(default=None, primary_key=True)
    action: str
    payload: str

    status: str = Field(default="PENDING", index=True)

    retry_count: int = Field(default=0)
    max_retries: int = Field(default=5)
    last_error: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    processed_at: Optional[datetime] = Field(default=None)
