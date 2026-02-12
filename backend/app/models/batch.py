from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship
from enum import Enum
import uuid

class BatchStatus(str, Enum):
    ACTIVE = "ativo" # pt-br consistent
    CONCLUDED = "concluido"
    FINALIZED = "finalizado"
    CANCELED = "cancelado"

class Batch(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True)
    status: BatchStatus = Field(default=BatchStatus.ACTIVE)
    # status: str = Field(default="ativo") # Temporary fix for debugging
    
    finalized_at: Optional[datetime] = Field(default=None)
    
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})

    # items: List["BatchItem"] = Relationship(back_populates="batch")

class BatchItem(SQLModel, table=True):
    __tablename__ = "batch_item"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    batch_id: uuid.UUID = Field(foreign_key="batch.id", index=True)
    request_id: uuid.UUID = Field(foreign_key="id_request.id", index=True)
    order_in_batch: int = Field(default=0)
    
    # batch: Batch = Relationship(back_populates="items")
