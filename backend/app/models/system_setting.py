from __future__ import annotations
import uuid
from typing import Optional
from sqlmodel import Field, SQLModel
from datetime import datetime

class SystemSetting(SQLModel, table=True):
    __tablename__ = "system_setting"
    
    key: str = Field(primary_key=True, index=True)
    value: str
    description: Optional[str] = None
    
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})
