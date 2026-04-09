from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class AndonStatus(SQLModel, table=True):
    """Estado atual (cache) de cada centro de trabalho no Andon.
    Um registro por workcenter. Atualizado a cada acionamento."""

    __tablename__ = "andon_status"

    id: Optional[int] = Field(default=None, primary_key=True)
    workcenter_odoo_id: int = Field(index=True, unique=True)
    workcenter_name: str
    status: str = Field(default="cinza")  # verde | amarelo | vermelho | cinza
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = Field(default=None)  # login do usuário do app


class AndonEvent(SQLModel, table=True):
    """Histórico imutável de cada acionamento Andon.
    Todo acionamento gera exatamente um evento — incluindo mudanças de volta ao verde."""

    __tablename__ = "andon_event"

    id: Optional[int] = Field(default=None, primary_key=True)
    workcenter_odoo_id: int = Field(index=True)
    workcenter_name: str
    workorder_odoo_id: Optional[int] = Field(default=None)
    production_odoo_id: Optional[int] = Field(default=None)

    # Status acionado neste evento
    status: str  # verde | amarelo | vermelho | cinza

    # Motivo — obrigatório no vermelho, validado no endpoint
    reason: Optional[str] = Field(default=None)

    # Auditoria — sempre obrigatório
    triggered_by: str  # login do usuário do app (não credencial Odoo)
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # Referências aos registros Odoo criados por este evento (nullable)
    odoo_picking_id: Optional[int] = Field(default=None)   # stock.picking (amarelo)
    odoo_activity_id: Optional[int] = Field(default=None)  # mail.activity (vermelho)

    # Se o AndonMaterialRequest foi criado em vez de picking Odoo
    material_request_id: Optional[int] = Field(
        default=None, foreign_key="andon_material_request.id"
    )

    # Se a pausa de WO funcionou (vermelho)
    pause_ok: Optional[bool] = Field(default=None)
    pause_method: Optional[str] = Field(default=None)  # qual método funcionou


class AndonMaterialRequest(SQLModel, table=True):
    """Requisição de material local — criada quando não há move_raw_ids na MO
    ou quando o picking Odoo não pode ser criado. Permite rastreabilidade local."""

    __tablename__ = "andon_material_request"

    id: Optional[int] = Field(default=None, primary_key=True)
    workcenter_odoo_id: int
    workorder_odoo_id: Optional[int] = Field(default=None)
    production_odoo_id: Optional[int] = Field(default=None)

    # Descrição do material necessário (preenchida pelo operador ou automática)
    note: Optional[str] = Field(default=None)

    # Fluxo de vida da requisição
    status: str = Field(default="pending")  # pending | fulfilled | cancelled

    created_at: datetime = Field(default_factory=datetime.utcnow)
    fulfilled_at: Optional[datetime] = Field(default=None)
class AndonCall(SQLModel, table=True):
    """Novo modelo de chamados Andon estruturados."""
    
    __tablename__ = "andon_call"

    id: Optional[int] = Field(default=None, primary_key=True)
    color: str  # YELLOW | RED
    category: str
    reason: str
    description: Optional[str] = Field(default=None)
    
    # Identificador do posto/linha
    workcenter_id: int = Field(index=True)
    workcenter_name: str
    
    # Referência opcional à OP
    mo_id: Optional[int] = Field(default=None)
    
    # Fluxo de vida
    status: str = Field(default="OPEN", index=True) # OPEN | IN_PROGRESS | RESOLVED
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Auditoria e Responsabilidade
    triggered_by: str
    assigned_team: Optional[str] = Field(default=None)
    resolved_note: Optional[str] = Field(default=None)

    # Parada real
    is_stop: bool = Field(default=False)

    # Campos de integração (preenchidos se o fluxo Odoo for disparado)
    odoo_picking_id: Optional[int] = Field(default=None)
    odoo_activity_id: Optional[int] = Field(default=None)

    # Campos de parada
    downtime_minutes: Optional[int] = Field(default=None)

    # Campos de justificativa
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
    action: str  # ex: 'pause_workorder', 'resolve_activity'
    payload: str  # JSON com os argumentos da ação
    
    # Estados: PENDING | PROCESSING | COMPLETED | FAILED
    status: str = Field(default="PENDING", index=True)
    
    retry_count: int = Field(default=0)
    max_retries: int = Field(default=5)
    last_error: Optional[str] = Field(default=None)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: Optional[datetime] = Field(default=None)
