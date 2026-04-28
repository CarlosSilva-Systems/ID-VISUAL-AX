"""
Schemas Pydantic para presets de etiquetas de porta (210-855).
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class DoorLabelPresetOut(BaseModel):
    """Preset de etiqueta de porta para resposta."""
    id: int
    name: str
    category: str
    equipment_name: str
    columns: List[str]
    rows: int
    is_system: bool
    is_shared: bool
    created_by: Optional[str]
    usage_count: int
    created_at: datetime
    updated_at: datetime
    is_favorite: bool = False  # Será preenchido dinamicamente

    model_config = {"from_attributes": True}


class DoorLabelPresetCreate(BaseModel):
    """Payload para criação de preset."""
    name: str = Field(..., min_length=1, max_length=100, description="Nome do preset")
    category: str = Field(..., description="Categoria: sinaleira, botoeira-3pos, botoeira-2pos, custom")
    equipment_name: str = Field(default="", max_length=100, description="Nome do equipamento (pode ser vazio se customizável)")
    columns: List[str] = Field(default_factory=list, description="Lista de colunas/posições")
    rows: int = Field(default=1, ge=1, le=10, description="Número de linhas")
    is_shared: bool = Field(default=False, description="Compartilhar com equipe")


class DoorLabelPresetUpdate(BaseModel):
    """Payload para atualização de preset."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    category: Optional[str] = None
    equipment_name: Optional[str] = Field(None, max_length=100)
    columns: Optional[List[str]] = None
    rows: Optional[int] = Field(None, ge=1, le=10)
    is_shared: Optional[bool] = None


class DoorLabelPresetListFilters(BaseModel):
    """Filtros para listagem de presets."""
    category: Optional[str] = None
    filter_type: str = Field(default="all", description="all, system, mine, team, favorites")
    search: Optional[str] = None
