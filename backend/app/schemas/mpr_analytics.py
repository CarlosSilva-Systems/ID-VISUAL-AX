from pydantic import BaseModel, ConfigDict
from typing import Optional, List

class KPIResumoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    tempo_medio_concepcao_min: Optional[float] = None
    tempo_medio_ciclo_completo_min: Optional[float] = None
    tempo_medio_parada_of_min: Optional[float] = None
    taxa_entrega_no_prazo_pct: Optional[float] = None
    taxa_aprovacao_primeira_entrega_pct: Optional[float] = None
    taxa_retrabalho_pct: Optional[float] = None
    total_ids_solicitadas: int
    total_ids_entregues: int
    ofs_impactadas: int

class FilaAtivaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    mo_number: str
    status: str
    prioridade: str
    solicitado_em: Optional[str] = None
    aging_horas: float
    responsavel_atual: Optional[str] = None

class VolumePorPeriodoItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    label: str
    solicitadas: int
    entregues: int
    no_prazo: int

class EvolucaoTempoCicloItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    label: str
    tempo_medio_ciclo_min: Optional[float] = None
    tempo_medio_concepcao_min: Optional[float] = None

class RankingResponsaveisItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    responsavel_id: int
    nome: str
    ids_concluidas: int
    tempo_medio_concepcao_min: Optional[float] = None
    taxa_aprovacao_primeira_pct: Optional[float] = None
    ids_em_andamento: int

class MotivoRevisaoItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    motivo: str
    quantidade: int
    percentual: float

class ImpactoFabricacaoItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    label: str
    horas_paradas_total: float
    ofs_afetadas: int
    tempo_medio_parada_min: Optional[float] = None

class MetadadosResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    motivos_revisao: List[str]
    status_options: List[str]
    responsaveis: List[str] # Or objects with id/name

class MPRConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    sla_atencao_horas: int
    sla_critico_horas: int

class MPRConfigUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    sla_atencao_horas: Optional[int] = None
    sla_critico_horas: Optional[int] = None
