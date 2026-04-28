"""
Etiqueta de porta — WAGO 210-855 (painel de porta do quadro).

Representa UM painel de etiqueta de porta com nome do equipamento
e lista de colunas (posições dos botões/seletores).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import JSON
from sqlmodel import Column, Field, SQLModel

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class DoorLabel(SQLModel, table=True):
    """Etiqueta de porta WAGO 210-855."""

    __tablename__ = "door_label"

    id: Optional[int] = Field(default=None, primary_key=True)

    mo_id: uuid.UUID = Field(foreign_key="manufacturing_order.id", index=True)

    equipment_name: str                        # ex: "Bomba 1"

    # Lista ordenada de strings — ex: ["Automático", "Manual", "Desligado"]
    columns: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )

    rows: int = Field(default=1)               # número de linhas de botões no painel

    order_index: int = Field(default=0)

    created_at: datetime = Field(default_factory=_now)
