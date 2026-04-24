"""
Schemas Pydantic para importação EPLAN e listagem de etiquetas.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class EplanImportSummary(BaseModel):
    """Resultado de uma importação de arquivo EPLAN."""
    imported: int
    updated: int
    skipped: int
    errors: List[str]


class DeviceLabelOut(BaseModel):
    id: int
    mo_id: int
    device_tag: str
    description: str
    location: Optional[str] = None
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TerminalLabelOut(BaseModel):
    id: int
    mo_id: int
    terminal_number: str
    wire_number: Optional[str] = None
    group_name: Optional[str] = None
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}
