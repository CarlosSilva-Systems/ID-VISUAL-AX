from fastapi import APIRouter, Depends, Query, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import List, Tuple
from datetime import datetime, timezone
import logging

from app.api.deps import get_session, get_current_active_user
from app.schemas.mpr_analytics import KPIResumoResponse, FilaAtivaResponse
from app.services.mpr_analytics_service import MPRAnalyticsService
from app.models.user import User

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
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna os KPIs resumidos (Tempo de Concepção, Ciclo, Retrabalho, Entregas)
    com base no período filtrado.
    """
    start_date, end_date = dates
    try:
        data = await MPRAnalyticsService.get_kpis_resumo(session, start_date, end_date)
        return KPIResumoResponse(**data)
    except Exception as e:
        logger.error(f"Erro em get_kpis_resumo: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno ao calcular KPIs")

@router.get("/fila-ativa", response_model=List[FilaAtivaResponse])
async def get_fila_ativa(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna a fila ativa (WIP) de IDs em andamento, incluindo aging_horas.
    """
    try:
        data = await MPRAnalyticsService.get_fila_ativa(session)
        return [FilaAtivaResponse(**item) for item in data]
    except Exception as e:
        logger.error(f"Erro em get_fila_ativa: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno ao buscar fila ativa")
