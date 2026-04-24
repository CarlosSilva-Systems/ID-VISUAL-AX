"""
Etiqueta de dispositivo — WAGO 210-805 (identificação de componente).

Representa UMA etiqueta para um dispositivo elétrico no quadro,
com a tag do EPLAN e descrição funcional.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class DeviceLabel(SQLModel, table=True):
    """Etiqueta de componente WAGO 210-805."""

    __tablename__ = "device_label"

    id: Optional[int] = Field(default=None, primary_key=True)

    mo_id: int = Field(foreign_key="manufacturing_order.id", index=True)

    device_tag: str = Field(index=True)        # ex: "K1", "DJ1", "KA1" — tag do EPLAN
    description: str                           # ex: "Contator principal bomba 1"
    location: Optional[str] = Field(default=None)  # ex: "QCC-01" — localização no quadro

    order_index: int = Field(default=0)        # ordem de impressão na régua

    created_at: datetime = Field(default_factory=_now)
