from datetime import datetime, timezone
import logging
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Optional, Dict, Any, List

from app.models.id_request import IDRequest, IDRequestStatus
from app.models.analytics import FabricacaoBlock, RevisaoIDVisual, MPRConfig
from app.models.manufacturing import ManufacturingOrder
from app.models.user import User

logger = logging.getLogger(__name__)

class MPRAnalyticsService:
    @staticmethod
    async def get_or_create_default_config(session: AsyncSession) -> MPRConfig:
        stmt = select(MPRConfig).limit(1)
        res = await session.execute(stmt)
        config = res.scalars().first()
        if not config:
            config = MPRConfig(sla_atencao_horas=8, sla_critico_horas=24)
            session.add(config)
            await session.commit()
            await session.refresh(config)
        return config

    @staticmethod
    async def get_kpis_resumo(session: AsyncSession, start_date: datetime, end_date: datetime) -> Dict[str, Any]:
        """
        Calcula os KPIs de resumo do painel MPR.
        Desconsidera nulos automaticamente nas médias (comportamento padrão do AVG em SQL).
        """
        # Calcular tempos do IDRequest
        # Concepcao = iniciado_em - solicitado_em
        # Ciclo Completo = entregue_em (ou concluido_em) - solicitado_em
        # Vamos usar func.avg do PostgreSQL extraindo a epoch, ou apenas carregar e calcular em python para evitar dialeto específico SQL? 
        # O SQLite e Postgres tratam datas de forma diferente. Para compatibilidade, faremos via SQLAlchemy genérico ou iterando os registros (seguro).
        
        stmt = select(IDRequest).where(
            IDRequest.created_at >= start_date,
            IDRequest.created_at <= end_date
        )
        res = await session.execute(stmt)
        requests = res.scalars().all()

        total_ids = len(requests)
        ids_concluidas = [r for r in requests if r.status in [IDRequestStatus.CONCLUIDA, IDRequestStatus.ENTREGUE]]
        
        tempo_concepcao_lista = []
        tempo_ciclo_lista = []
        
        for r in ids_concluidas:
            if r.iniciado_em and r.solicitado_em:
                tempo_concepcao_lista.append((r.iniciado_em - r.solicitado_em).total_seconds() / 60)
            if r.concluido_em and r.solicitado_em:
                tempo_ciclo_lista.append((r.concluido_em - r.solicitado_em).total_seconds() / 60)
                
        # SLA e no_prazo (assume 24h para MVP, depois usar MPRConfig)
        sla_minutos = 24 * 60
        no_prazo_count = sum(1 for c in tempo_ciclo_lista if c <= sla_minutos)
        
        # Paradas
        stmt_paradas = select(FabricacaoBlock).where(
            FabricacaoBlock.of_bloqueada_em >= start_date,
            FabricacaoBlock.of_bloqueada_em <= end_date
        )
        res_paradas = await session.execute(stmt_paradas)
        paradas = res_paradas.scalars().all()
        
        tempos_parada = [p.tempo_parado_minutos for p in paradas if p.tempo_parado_minutos is not None]
        
        # Retrabalhos
        stmt_rev = select(RevisaoIDVisual).where(
            RevisaoIDVisual.revisao_solicitada_em >= start_date,
            RevisaoIDVisual.revisao_solicitada_em <= end_date
        )
        res_rev = await session.execute(stmt_rev)
        revisoes = res_rev.scalars().all()
        
        # Calcular e empacotar
        def calc_avg(lst): return round(sum(lst) / len(lst), 1) if lst else None
        def calc_pct(part, whole): return round((part / whole) * 100, 1) if whole else None
        
        return {
            "tempo_medio_concepcao_min": calc_avg(tempo_concepcao_lista),
            "tempo_medio_ciclo_completo_min": calc_avg(tempo_ciclo_lista),
            "tempo_medio_parada_of_min": calc_avg(tempos_parada),
            "taxa_entrega_no_prazo_pct": calc_pct(no_prazo_count, len(ids_concluidas)),
            "taxa_aprovacao_primeira_entrega_pct": calc_pct(total_ids - len(revisoes), total_ids) if total_ids > 0 else None,
            "taxa_retrabalho_pct": calc_pct(len(revisoes), total_ids),
            "total_ids_solicitadas": total_ids,
            "total_ids_entregues": len(ids_concluidas),
            "ofs_impactadas": len(paradas)
        }

    @staticmethod
    async def get_fila_ativa(session: AsyncSession) -> List[Dict[str, Any]]:
        """Busca todas as solicitações pendentes."""
        from sqlalchemy.orm import selectinload
        stmt = select(IDRequest).where(
            IDRequest.status.not_in([IDRequestStatus.CONCLUIDA, IDRequestStatus.ENTREGUE, IDRequestStatus.CANCELADA])
        ).options(selectinload(IDRequest.mo))
        res = await session.execute(stmt)
        requests = res.scalars().all()
        
        return [{
            "id": str(r.id),
            "mo_number": r.mo.name if r.mo else "Desconhecida",
            "status": r.status.value if hasattr(r.status, "value") else str(r.status),
            "prioridade": r.priority,
            "solicitado_em": r.solicitado_em.isoformat() if r.solicitado_em else None,
            "aging_horas": round((datetime.utcnow() - r.solicitado_em).total_seconds() / 3600, 1) if r.solicitado_em else 0,
            "responsavel_atual": r.requester_name
        } for r in requests]

    @staticmethod
    async def get_ranking_responsaveis(session: AsyncSession, start_date: datetime, end_date: datetime) -> List[Dict]:
        return []

    @staticmethod
    async def get_volume_por_periodo(session: AsyncSession, start_date: datetime, end_date: datetime) -> List[Dict]:
        return []

    @staticmethod
    async def get_evolucao_tempo_ciclo(session: AsyncSession, start_date: datetime, end_date: datetime) -> List[Dict]:
        return []

    @staticmethod
    async def get_impacto_fabricacao(session: AsyncSession, start_date: datetime, end_date: datetime) -> List[Dict]:
        return []

    @staticmethod
    async def get_motivos_revisao(session: AsyncSession, start_date: datetime, end_date: datetime) -> List[Dict]:
        return []

