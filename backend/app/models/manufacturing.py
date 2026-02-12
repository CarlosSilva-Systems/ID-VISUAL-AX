from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel

class ManufacturingOrderBase(SQLModel):
    odoo_id: int = Field(unique=True, index=True)
    name: str = Field(index=True)
    x_studio_nome_da_obra: Optional[str] = None
    product_qty: float
    date_start: Optional[datetime] = Field(default=None, index=True)
    state: str = Field(index=True)
    company_id: Optional[int] = None

class ManufacturingOrder(ManufacturingOrderBase, table=True):
    __tablename__ = "manufacturing_order"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    last_sync_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})
