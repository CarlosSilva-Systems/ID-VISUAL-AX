from __future__ import annotations
import uuid
import re
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class ManufacturingOrderBase(SQLModel):
    odoo_id: int = Field(unique=True, index=True)
    name: str = Field(index=True)
    x_studio_nome_da_obra: Optional[str] = None
    product_name: Optional[str] = Field(default=None, index=True)  # Nome do produto (sem código AX)
    ax_code: Optional[str] = Field(default=None, index=True)  # Código AX do produto (product_id.default_code)
    product_qty: float
    date_start: Optional[datetime] = Field(default=None, index=True)
    state: str = Field(index=True)
    company_id: Optional[int] = None


class ManufacturingOrder(ManufacturingOrderBase, table=True):
    __tablename__ = "manufacturing_order"

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    last_sync_at: datetime = Field(default_factory=_now)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now, sa_column_kwargs={"onupdate": _now})

    @property
    def fab_code(self) -> Optional[str]:
        """
        Propriedade computada que extrai o código de fabricação do campo name.
        Lógica: extrai a parte numérica após a última "/" e prefixa com "FAB".
        
        Exemplos:
            "WH/MO/01015" → "FAB01015"
            "WH/MO/00001" → "FAB00001"
            None ou string malformada → None
        
        Returns:
            Optional[str]: Código de fabricação ou None se não puder ser extraído
        """
        if not self.name:
            return None
        
        try:
            # Extrai a parte após a última "/"
            parts = self.name.split("/")
            if len(parts) < 2:
                return None
            
            # Pega o último segmento
            last_part = parts[-1].strip()
            
            # Verifica se é numérico
            if not last_part.isdigit():
                return None
            
            return f"FAB{last_part}"
        except Exception:
            return None
