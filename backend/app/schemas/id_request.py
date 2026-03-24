from pydantic import BaseModel, ConfigDict
from typing import Optional, List
import uuid
from datetime import datetime

class ManualRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    request_id: uuid.UUID
    odoo_mo_id: int
    mo_number: str
    obra_nome: Optional[str] = None
    product_qty: float
    date_start: Optional[datetime] = None
    requester_name: Optional[str] = None
    notes: Optional[str] = None
    priority: str
    status: str
    created_at: datetime
    mo_state: str
    mo_state_label: str
    mo_state_variant: str
