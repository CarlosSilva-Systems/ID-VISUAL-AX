"""
Schemas Pydantic para importação EPLAN e listagem de etiquetas.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


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


class DeviceLabelCreate(BaseModel):
    """Payload para criação manual de dispositivo."""
    device_tag: str = Field(..., min_length=1, max_length=50, description="Tag do dispositivo (ex: K1, DJ1)")
    description: Optional[str] = Field(None, max_length=200, description="Descrição funcional (opcional)")
    location: Optional[str] = Field(None, max_length=50, description="Localização no quadro (opcional)")


class DeviceLabelUpdate(BaseModel):
    """Payload para atualização de dispositivo."""
    device_tag: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = Field(None, min_length=1, max_length=200)
    location: Optional[str] = Field(None, max_length=50)


class DeviceReorderPayload(BaseModel):
    """Payload para reordenação de dispositivos."""
    device_ids: List[int] = Field(..., description="Array de IDs na nova ordem")


class TerminalLabelOut(BaseModel):
    id: int
    mo_id: int
    terminal_number: str
    wire_number: Optional[str] = None
    group_name: Optional[str] = None
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}
