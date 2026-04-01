"""
Modelos de dados para OTA (Over-The-Air) Management.

Este módulo define os modelos SQLModel para gerenciamento de firmware releases
e logs de atualização OTA de dispositivos ESP32.
"""
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from sqlmodel import Field, SQLModel


class FirmwareSource(str, Enum):
    """Origem do firmware release."""
    github = "github"
    manual_upload = "manual_upload"


class OTAStatus(str, Enum):
    """Status de uma atualização OTA."""
    downloading = "downloading"
    installing = "installing"
    success = "success"
    failed = "failed"


class FirmwareRelease(SQLModel, table=True):
    """
    Registro de uma versão de firmware disponível para OTA.
    
    Armazena metadados de cada versão de firmware, incluindo origem
    (GitHub ou upload manual), tamanho, e caminho local no storage.
    """
    __tablename__ = "firmware_releases"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    version: str = Field(unique=True, index=True, max_length=50, nullable=False)
    filename: str = Field(max_length=255, nullable=False)
    file_size: int = Field(gt=0, nullable=False)
    source: FirmwareSource = Field(nullable=False)
    github_release_id: Optional[int] = Field(default=None)
    download_url: Optional[str] = Field(default=None)
    local_path: str = Field(nullable=False)
    uploaded_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False
    )
    uploaded_by: str = Field(max_length=100, nullable=False)


class OTAUpdateLog(SQLModel, table=True):
    """
    Log de tentativa de atualização OTA de um dispositivo.
    
    Rastreia cada tentativa de atualização OTA por dispositivo, incluindo
    status, progresso, e mensagens de erro.
    """
    __tablename__ = "ota_update_logs"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    device_id: uuid.UUID = Field(foreign_key="esp_devices.id", index=True, nullable=False)
    firmware_release_id: uuid.UUID = Field(foreign_key="firmware_releases.id", index=True, nullable=False)
    started_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False
    )
    completed_at: Optional[datetime] = Field(default=None)
    status: OTAStatus = Field(default=OTAStatus.downloading, nullable=False)
    progress_percent: int = Field(default=0, ge=0, le=100, nullable=False)
    error_message: Optional[str] = Field(default=None)
    previous_version: Optional[str] = Field(default=None, max_length=50)
    target_version: str = Field(max_length=50, nullable=False)
