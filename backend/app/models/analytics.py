from typing import Optional
import uuid
from datetime import datetime
from sqlmodel import Field, SQLModel, Relationship
from enum import Enum

class FabricacaoBlock(SQLModel, table=True):
    __tablename__ = "fabricacao_block"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    mo_id: uuid.UUID = Field(foreign_key="manufacturing_order.id", index=True)
    id_visual_id: Optional[uuid.UUID] = Field(default=None, foreign_key="id_request.id", index=True)
    
    of_bloqueada_em: datetime = Field(default_factory=datetime.utcnow)
    of_desbloqueada_em: Optional[datetime] = None
    tempo_parado_minutos: Optional[float] = None

class MotivoRevisao(str, Enum):
    INFORMACAO_INCORRETA = "INFORMACAO_INCORRETA"
    FALTA_COMPONENTE = "FALTA_COMPONENTE"
    MUDANCA_ESPECIFICACAO = "MUDANCA_ESPECIFICACAO"
    ERRO_DIAGRAMACAO = "ERRO_DIAGRAMACAO"
    OUTRO = "OUTRO"

class RevisaoIDVisual(SQLModel, table=True):
    __tablename__ = "revisao_id_visual"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    id_visual_id: uuid.UUID = Field(foreign_key="id_request.id", index=True)
    revisao_solicitada_em: datetime = Field(default_factory=datetime.utcnow)
    motivo: MotivoRevisao
    solicitado_por: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")

class MPRConfig(SQLModel, table=True):
    __tablename__ = "mpr_config"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    sla_atencao_horas: int = Field(default=8)
    sla_critico_horas: int = Field(default=24)
