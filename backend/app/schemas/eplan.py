"""
Schemas Pydantic para importação EPLAN e listagem de etiquetas.
"""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_serializer


class EplanImportSummary(BaseModel):
    imported: int
    updated: int
    skipped: int
    errors: List[str]


class DeviceLabelOut(BaseModel):
    id: int
    mo_id: uuid.UUID
    device_tag: str
    description: str
    location: Optional[str] = None
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("mo_id")
    def serialize_mo_id(self, v: uuid.UUID) -> str:
        return str(v)


class DeviceLabelCreate(BaseModel):
    device_tag: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=200)
    location: Optional[str] = Field(None, max_length=50)


class DeviceLabelUpdate(BaseModel):
    device_tag: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = Field(None, min_length=1, max_length=200)
    location: Optional[str] = Field(None, max_length=50)


class DeviceReorderPayload(BaseModel):
    device_ids: List[int] = Field(..., description="Array de IDs na nova ordem")


class TerminalLabelOut(BaseModel):
    id: int
    mo_id: uuid.UUID
    terminal_number: str
    wire_number: Optional[str] = None
    group_name: Optional[str] = None
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("mo_id")
    def serialize_mo_id(self, v: uuid.UUID) -> str:
        return str(v)
