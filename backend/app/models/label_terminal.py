"""
Marcador de borne — WAGO 2009-110 (terminal block marker).

Representa UM marcador de borne com número, fio associado
e grupo/circuito ao qual pertence.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class TerminalLabel(SQLModel, table=True):
    """Marcador de borne WAGO 2009-110."""

    __tablename__ = "terminal_label"

    id: Optional[int] = Field(default=None, primary_key=True)

    mo_id: int = Field(foreign_key="manufacturing_order.id", index=True)

    terminal_number: str = Field(index=True)   # ex: "1", "2", "PE"
    wire_number: Optional[str] = Field(default=None)   # ex: "L1", "24VCC"
    group_name: Optional[str] = Field(default=None)    # ex: "Força", "Controle"

    order_index: int = Field(default=0)        # posição física na régua

    created_at: datetime = Field(default_factory=_now)
