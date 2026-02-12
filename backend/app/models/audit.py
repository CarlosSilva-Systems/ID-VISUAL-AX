from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, JSON, Column

class HistoryLog(SQLModel, table=True):
    __tablename__ = "history_log"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    entity_type: str = Field(index=True) # manufacturing, id_request, batch
    entity_id: uuid.UUID = Field(index=True)
    action: str
    
    before_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    after_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
