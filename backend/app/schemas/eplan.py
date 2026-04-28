"""
Schemas Pydantic para importação EPLAN e listagem de etiquetas.
"""
import uuid
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class EplanImportSummary(BaseModel):
    """Resultado de uma importação de arquivo EPLAN."""
    imported: int
    updated: int
    skipped: int
    errors: List[str]


class DeviceLabelOut(BaseModel):
    id: int
    mo_id: str  # UUID serializado como string
    device_tag: str
    description: str
    location: Optional[str] = None
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}
    
    @classmethod
    def model_validate(cls, obj: Any) -> "DeviceLabelOut":
        """Converte mo_id UUID para string na serialização."""
        if hasattr(obj, 'mo_id') and isinstance(obj.mo_id, uuid.UUID):
            obj_dict = {
                'id': obj.id,
                'mo_id': str(obj.mo_id),
                'device_tag': obj.device_tag,
                'description': obj.description,
                'location': obj.location,
                'order_index': obj.order_index,
                'created_at': obj.created_at,
            }
            return cls(**obj_dict)
        return super().model_validate(obj)


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
    mo_id: str  # UUID serializado como string
    terminal_number: str
    wire_number: Optional[str] = None
    group_name: Optional[str] = None
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}
    
    @classmethod
    def model_validate(cls, obj: Any) -> "TerminalLabelOut":
        """Converte mo_id UUID para string na serialização."""
        if hasattr(obj, 'mo_id') and isinstance(obj.mo_id, uuid.UUID):
            obj_dict = {
                'id': obj.id,
                'mo_id': str(obj.mo_id),
                'terminal_number': obj.terminal_number,
                'wire_number': obj.wire_number,
                'group_name': obj.group_name,
                'order_index': obj.order_index,
                'created_at': obj.created_at,
            }
            return cls(**obj_dict)
        return super().model_validate(obj)
