from fastapi import APIRouter, Depends, Query, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import List, Tuple
from datetime import datetime, timezone
import logging

from app.api.deps import get_session, get_current_user
from app.schemas.mpr_analytics import (
    KPIResumoResponse, FilaAtivaResponse, VolumePorPeriodoItem,
    EvolucaoTempoCicloItem, RankingResponsaveisItem,
    MPRConfigResponse, MPRConfigUpdate,
    MotivoRevisaoItem, ImpactoFabricacaoItem, MetadadosResponse
)
from app.services.mpr_analytics_service import MPRAnalyticsService
from app.models.user import User, UserRole
from app.models.analytics import MotivoRevisao
from app.models.id_request import IDRequestStatus

logger = logging.getLogger(__name__)

router = APIRouter()

def parse_dates_utc(periodo_inicio: str = Query(..., description="ISO 8601 format"), 
                    periodo_fim: str = Query(..., description="ISO 8601 format")) -> Tuple[datetime, datetime]:
    """Validador Pydantic/FastAPI para o Timezone Contract (Correção D)"""
    def _parse(date_str: str) -> datetime:
        # Substitui 'Z' por '+00:00' para que o fromisoformat entenda.
        # Caso não haja offset (timezone naive), definimos como UTC.
        clean_str = date_str.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(clean_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid date format: {date_str}. Expected ISO 8601.")
            
    start = _parse(periodo_inicio)
    end = _parse(periodo_fim)
    
    if end < start:
        raise HTTPException(status_code=400, detail="periodo_fim não pode ser anterior a periodo_inicio")
        
    return start, end

@router.get("/kpis/resumo", response_model=KPIResumoResponse)
async def get_kpis_resumo(
    dates: Tuple[datetime, datetime] = Depends(parse_dates_utc),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna os KPIs resumidos (Tempo de Concepção, Ciclo, Retrabalho, Entregas)
    com base no período filtrado.
    """
    start_date, end_date = dates
    data = await MPRAnalyticsService.get_kpis_resumo(session, start_date, end_date)
    return KPIResumoResponse(**data)

@router.get("/fila-ativa", response_model=List[FilaAtivaResponse])
async def get_fila_ativa(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna a fila ativa (WIP) de IDs em andamento, incluindo aging_horas.
    """
    data = await MPRAnalyticsService.get_fila_ativa(session)
    return [FilaAtivaResponse(**item) for item in data]

@router.get("/volume-por-periodo", response_model=List[VolumePorPeriodoItem])
async def get_volume_por_periodo(
    dates: Tuple[datetime, datetime] = Depends(parse_dates_utc),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    start_date, end_date = dates
    data = await MPRAnalyticsService.get_volume_por_periodo(session, start_date, end_date)
    return [VolumePorPeriodoItem(**item) for item in data]

@router.get("/evolucao-tempo-ciclo", response_model=List[EvolucaoTempoCicloItem])
async def get_evolucao_tempo_ciclo(
    dates: Tuple[datetime, datetime] = Depends(parse_dates_utc),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    start_date, end_date = dates
    data = await MPRAnalyticsService.get_evolucao_tempo_ciclo(session, start_date, end_date)
    return [EvolucaoTempoCicloItem(**item) for item in data]

@router.get("/ranking-responsaveis", response_model=List[RankingResponsaveisItem])
async def get_ranking_responsaveis(
    dates: Tuple[datetime, datetime] = Depends(parse_dates_utc),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    start_date, end_date = dates
    data = await MPRAnalyticsService.get_ranking_responsaveis(session, start_date, end_date)
    return [RankingResponsaveisItem(**item) for item in data]

@router.get("/config", response_model=MPRConfigResponse)
async def get_mpr_config(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    config = await MPRAnalyticsService.get_or_create_default_config(session)
    return MPRConfigResponse.model_validate(config)

@router.patch("/config", response_model=MPRConfigResponse)
async def update_mpr_config(
    payload: MPRConfigUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.GESTOR, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Apenas GESTOR ou ADMIN podem alterar o SLA.")
        
    config = await MPRAnalyticsService.get_or_create_default_config(session)
    
    if payload.sla_atencao_horas is not None:
        config.sla_atencao_horas = payload.sla_atencao_horas
    if payload.sla_critico_horas is not None:
        config.sla_critico_horas = payload.sla_critico_horas
        
    session.add(config)
    await session.commit()
    await session.refresh(config)
    
    return MPRConfigResponse.model_validate(config)

@router.get("/impacto-fabricacao", response_model=List[ImpactoFabricacaoItem])
async def get_impacto_fabricacao(
    dates: Tuple[datetime, datetime] = Depends(parse_dates_utc),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    start_date, end_date = dates
    data = await MPRAnalyticsService.get_impacto_fabricacao(session, start_date, end_date)
    return [ImpactoFabricacaoItem(**item) for item in data]

@router.get("/motivos-revisao", response_model=List[MotivoRevisaoItem])
async def get_motivos_revisao(
    dates: Tuple[datetime, datetime] = Depends(parse_dates_utc),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    start_date, end_date = dates
    data = await MPRAnalyticsService.get_motivos_revisao(session, start_date, end_date)
    return [MotivoRevisaoItem(**item) for item in data]

@router.get("/metadados", response_model=MetadadosResponse)
async def get_metadados(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    from sqlmodel import select
    # Busca responsaveis do banco (ex: full_name não nulos)
    stmt = select(User.full_name).where(User.is_active == True)
    res = await session.execute(stmt)
    nomes_responsaveis = [n for n in res.scalars().all() if n]
    
    return MetadadosResponse(
        motivos_revisao=[m.value for m in MotivoRevisao],
        status_options=[s.value for s in IDRequestStatus if isinstance(s, IDRequestStatus) or isinstance(s, str)],
        responsaveis=sorted(list(set(nomes_responsaveis)))
    )
