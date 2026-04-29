"""
Schemas Pydantic para OTA Management API.

Define os schemas de request/response para endpoints de OTA,
incluindo validação de payloads MQTT.
"""
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator
from typing import Optional
from datetime import datetime
import uuid
import re


# ─── Request Schemas ───────────────────────────────────────────────────────

class CheckGitHubRequest(BaseModel):
    """Request vazio para endpoint check-github."""
    model_config = ConfigDict(extra="forbid")


class DownloadGitHubRequest(BaseModel):
    """Request para download de firmware do GitHub."""
    model_config = ConfigDict(extra="forbid")
    version: Optional[str] = None
    
    @field_validator('version')
    @classmethod
    def validate_version_format(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r'^\d+\.\d+\.\d+$', v):
            raise ValueError('Versão deve seguir formato semântico (ex: 1.2.0)')
        return v


class TriggerOTARequest(BaseModel):
    """Request para disparar atualização OTA."""
    model_config = ConfigDict(extra="forbid")
    firmware_release_id: uuid.UUID


class OTATriggerPayload(BaseModel):
    """Payload MQTT para comando de trigger OTA."""
    model_config = ConfigDict(extra="forbid")
    version: str = Field(pattern=r'^\d+\.\d+\.\d+$')
    url: HttpUrl
    size: int = Field(gt=100000)  # Mínimo 100KB


class OTAProgressPayload(BaseModel):
    """Payload MQTT para atualizações de progresso OTA."""
    model_config = ConfigDict(extra="forbid")
    status: str = Field(pattern=r'^(downloading|installing|success|failed)$')
    progress: int = Field(ge=0, le=100)
    error: Optional[str] = None


# ─── Response Schemas ──────────────────────────────────────────────────────

class FirmwareReleaseOut(BaseModel):
    """Response de firmware release."""
    id: uuid.UUID
    version: str
    filename: str
    file_size: int
    source: str
    github_release_id: Optional[int]
    download_url: Optional[str]
    uploaded_at: datetime
    uploaded_by: str
    is_latest: bool
    device_count: int
    
    model_config = ConfigDict(from_attributes=True)


class CheckGitHubResponse(BaseModel):
    """Response do endpoint check-github."""
    update_available: bool
    version: Optional[str] = None
    download_url: Optional[str] = None


class TriggerOTAResponse(BaseModel):
    """Response do endpoint trigger."""
    message: str
    device_count: int
    root_device_count: int = 0
    mesh_device_count: int = 0
    target_version: str


class CancelOTAResponse(BaseModel):
    """Response do endpoint cancel."""
    message: str
    cancelled_count: int


class DeviceOTAStatus(BaseModel):
    """Status OTA de um dispositivo individual."""
    device_id: uuid.UUID
    mac_address: str
    device_name: str
    current_version: Optional[str]
    target_version: Optional[str]
    status: str
    progress_percent: int
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    is_root: bool = False
    connection_type: str = "mesh"


class OTAStatusResponse(BaseModel):
    """Response do endpoint status."""
    devices: list[DeviceOTAStatus]


class OTAHistoryItem(BaseModel):
    """Item de histórico de atualização OTA."""
    id: uuid.UUID
    firmware_release_id: uuid.UUID
    started_at: datetime
    completed_at: Optional[datetime]
    status: str
    progress_percent: int
    error_message: Optional[str]
    previous_version: Optional[str]
    target_version: str
    duration_seconds: Optional[int]
    
    model_config = ConfigDict(from_attributes=True)
