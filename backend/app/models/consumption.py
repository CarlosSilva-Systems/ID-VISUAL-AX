from __future__ import annotations
import uuid
from datetime import datetime
from datetime import date as dt_date
from typing import Optional
from enum import Enum
from sqlmodel import Field, SQLModel

class ElesysCode(str, Enum):
    T58 = "T58"
    T96 = "T96"

class ElesysConsumption(SQLModel, table=True):
    __tablename__ = "elesys_consumption"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    date: dt_date = Field(index=True)
    code: ElesysCode
    quantity: int
    note: Optional[str] = None
    
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
