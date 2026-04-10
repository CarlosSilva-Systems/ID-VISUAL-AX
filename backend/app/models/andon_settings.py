from typing import Optional
from sqlmodel import SQLModel, Field


class AndonSettings(SQLModel, table=True):
    """Configurações globais do sistema Andon.
    
    Singleton por design — sempre id=1.
    working_minutes_per_day é calculado dinamicamente pelo oee_service.
    """
    __tablename__ = "andon_settings"

    id: int = Field(default=1, primary_key=True)
    working_day_start: str = Field(default="08:00")  # "HH:MM"
    working_day_end: str = Field(default="17:00")    # "HH:MM"
    # JSON array de dias úteis: ["monday","tuesday","wednesday","thursday","friday"]
    working_days: str = Field(
        default='["monday","tuesday","wednesday","thursday","friday"]'
    )
