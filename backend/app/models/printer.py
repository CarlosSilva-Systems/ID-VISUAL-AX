"""
Modelos de impressora Zebra e fila de impressão.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class Printer(SQLModel, table=True):
    """Impressora Zebra cadastrada no sistema."""

    __tablename__ = "printer"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)                          # ex: "Zebra Bancada 1"
    ip_address: str                                        # ex: "192.168.1.200"
    port: int = Field(default=9100)
    location: Optional[str] = Field(default=None)         # ex: "Bancada montagem"
    label_type: Optional[str] = Field(default=None)       # para mapeamento futuro de materiais
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_now)
