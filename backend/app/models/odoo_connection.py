from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel
from enum import Enum

class OdooAuthType(str, Enum):
    JSON2_APIKEY = "json2_apikey"
    JSONRPC_PASSWORD = "jsonrpc_password"

class OdooConnectionBase(SQLModel):
    url: str
    db: str
    auth_type: OdooAuthType = Field(default=OdooAuthType.JSON2_APIKEY)
    login: Optional[str] = None # Optional for API Key if not needed, required for RPC
    owner_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id", nullable=True)
    is_active: bool = Field(default=True)

class OdooConnection(OdooConnectionBase, table=True):
    __tablename__ = "odoo_connection"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    encrypted_secret: str # API Key or Password encrypted
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})
