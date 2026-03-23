from typing import Optional
import uuid
from datetime import datetime
from sqlmodel import Field, SQLModel, Relationship

class FabricacaoBlock(SQLModel, table=True):
    __tablename__ = "fabricacao_block"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    mo_id: uuid.UUID = Field(foreign_key="manufacturing_order.id", index=True)
    id_visual_id: Optional[uuid.UUID] = Field(default=None, foreign_key="id_request.id", index=True)
    
    of_bloqueada_em: datetime = Field(default_factory=datetime.utcnow)
    of_desbloqueada_em: Optional[datetime] = None
    tempo_parado_minutos: Optional[float] = None
