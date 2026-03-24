from typing import Optional, Any, Dict
import uuid
from datetime import datetime
from sqlmodel import Field, SQLModel, JSON, Column

class CustomReport(SQLModel, table=True):
    __tablename__ = "custom_report"
    
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    title: str = Field(index=True)
    description: Optional[str] = None
    
    # layout_config armazena o JSON gerado pela IA (Gráficos, Rotas de API, Titulos)
    layout_config: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow})

class CustomReportCreate(SQLModel):
    title: str
    description: Optional[str] = None
    layout_config: Dict[str, Any]

class CustomReportRead(SQLModel):
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    layout_config: Dict[str, Any]
    created_at: datetime
