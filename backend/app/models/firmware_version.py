"""
Modelo FirmwareVersion — catálogo de versões de firmware disponíveis para OTA.

Separado de FirmwareRelease (que gerencia downloads do GitHub) para permitir
upload manual de binários e controle de versão estável para rollout.
"""
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel


class FirmwareVersion(SQLModel, table=True):
    __tablename__ = "firmware_versions"

    id: int = Field(default=None, primary_key=True)
    version: str = Field(unique=True, index=True, nullable=False, max_length=50)
    release_notes: Optional[str] = Field(default=None, nullable=True)
    file_path: str = Field(nullable=False)
    file_size_bytes: int = Field(nullable=False, gt=0)
    is_stable: bool = Field(default=False, nullable=False, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False,
    )
    created_by: str = Field(nullable=False, max_length=100)
