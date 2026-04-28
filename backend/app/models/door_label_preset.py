"""
Preset para etiquetas de porta — WAGO 210-855.

Permite salvar templates reutilizáveis de adesivos de porta,
com suporte a presets do sistema, pessoais e compartilhados.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import JSON
from sqlmodel import Column, Field, SQLModel

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class DoorLabelPreset(SQLModel, table=True):
    """Preset para etiquetas de porta WAGO 210-855."""

    __tablename__ = "door_label_preset"

    id: Optional[int] = Field(default=None, primary_key=True)

    name: str = Field(index=True, max_length=100)  # "Bomba Recalque 3P"
    category: str = Field(max_length=50)  # "sinaleira", "botoeira-3pos", "botoeira-2pos", "custom"

    equipment_name: str = Field(max_length=100)  # "RECALQUE" ou vazio se customizável
    columns: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )  # ["MAN", "O", "AUT"]
    rows: int = Field(default=1)  # número de linhas de botões

    is_system: bool = Field(default=False, index=True)  # Preset padrão do sistema
    is_shared: bool = Field(default=False, index=True)  # Compartilhado com equipe

    created_by: Optional[str] = Field(default=None, index=True, max_length=100)  # Username do criador
    usage_count: int = Field(default=0)  # Contador de uso (popularidade)

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class DoorLabelPresetFavorite(SQLModel, table=True):
    """Relação many-to-many entre usuários e presets favoritos."""

    __tablename__ = "door_label_preset_favorite"

    id: Optional[int] = Field(default=None, primary_key=True)

    preset_id: int = Field(foreign_key="door_label_preset.id", index=True)
    username: str = Field(index=True, max_length=100)  # Username do usuário

    created_at: datetime = Field(default_factory=_now)
