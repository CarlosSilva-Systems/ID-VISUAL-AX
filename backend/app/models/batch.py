from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel
from enum import Enum
import uuid

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class BatchStatus(str, Enum):
    ACTIVE = "ativo"
    CONCLUDED = "concluido"
    FINALIZED = "finalizado"
    CANCELED = "cancelado"


class Batch(SQLModel, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True)
    status: BatchStatus = Field(default=BatchStatus.ACTIVE)

    finalized_at: Optional[datetime] = Field(default=None)

    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now, sa_column_kwargs={"onupdate": _now})


class BatchItem(SQLModel, table=True):
    __tablename__ = "batch_item"

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    batch_id: uuid.UUID = Field(foreign_key="batch.id", index=True)
    request_id: uuid.UUID = Field(foreign_key="id_request.id", index=True)
    order_in_batch: int = Field(default=0)
