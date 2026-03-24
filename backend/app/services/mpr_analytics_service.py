from datetime import datetime, timezone
import logging
from sqlmodel import select as sm_select, func
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
        stmt = sm_select(MPRConfig).limit(1)
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
        # Normalize to naive UTC if they have tzinfo, as DB fields are likely naive UTC
        start_naive = start_date.replace(tzinfo=None) if start_date.tzinfo else start_date
        end_naive = end_date.replace(tzinfo=None) if end_date.tzinfo else end_date

        stmt = sm_select(IDRequest).where(
            IDRequest.created_at >= start_naive,
            IDRequest.created_at <= end_naive
        )
        res = await session.execute(stmt)
        requests = res.scalars().all()

        total_ids = len(requests)
        
        # Safe Enum-to-string comparison
        def get_status_str(r):
            if not r.status: return ""
            if hasattr(r.status, "value"): return r.status.value
            return str(r.status)

        ids_concluidas = [r for r in requests if get_status_str(r) in ["concluida", "entregue"]]
        
        tempo_concepcao_lista = []
        tempo_ciclo_lista = []
        
        # Helper to get naive utc
        def to_naive(dt): return dt.replace(tzinfo=None) if dt and dt.tzinfo else dt

        for r in ids_concluidas:
            try:
                ini = to_naive(r.iniciado_em)
                sol = to_naive(r.solicitado_em)
                con = to_naive(r.concluido_em)
                ent = to_naive(r.entregue_em)

                if ini and sol:
                    tempo_concepcao_lista.append((ini - sol).total_seconds() / 60)
                if con and sol:
                    tempo_ciclo_lista.append((con - sol).total_seconds() / 60)
                elif ent and sol:
                    tempo_ciclo_lista.append((ent - sol).total_seconds() / 60)
            except Exception as item_err:
                logger.warning(f"Erro item KPI {r.id}: {item_err}")
                continue
                
        # SLA e no_prazo
        sla_minutos = 24 * 60
        no_prazo_count = sum(1 for c in tempo_ciclo_lista if c <= sla_minutos)
        
        # Paradas
        stmt_p = sm_select(FabricacaoBlock).where(
            FabricacaoBlock.of_bloqueada_em >= start_naive,
            FabricacaoBlock.of_bloqueada_em <= end_naive
        )
        res_p = await session.execute(stmt_p)
        paradas = res_p.scalars().all()
        tempos_p = [p.tempo_parado_minutos for p in paradas if p.tempo_parado_minutos is not None]
        
        # Retrabalhos
        stmt_r = sm_select(RevisaoIDVisual).where(
            RevisaoIDVisual.revisao_solicitada_em >= start_naive,
            RevisaoIDVisual.revisao_solicitada_em <= end_naive
        )
        res_r = await session.execute(stmt_r)
        revisoes = res_r.scalars().all()
        
        def calc_avg(lst): return round(sum(lst) / len(lst), 1) if lst else None
        def calc_pct(part, whole): return round((part / whole) * 100, 1) if whole else None
        
        return {
            "tempo_medio_concepcao_min": calc_avg(tempo_concepcao_lista),
            "tempo_medio_ciclo_completo_min": calc_avg(tempo_ciclo_lista),
            "tempo_medio_parada_of_min": calc_avg(tempos_p),
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
        # Use string statuses to be 100% safe with DB drivers
        exclude_statuses = [
            IDRequestStatus.CONCLUIDA.value,
            IDRequestStatus.ENTREGUE.value,
            IDRequestStatus.CANCELADA.value
        ]
        
        try:
            stmt = sm_select(IDRequest, ManufacturingOrder.name).join(
                ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id, isouter=True
            ).where(
                IDRequest.status.not_in(exclude_statuses)
            )
            res = await session.execute(stmt)
            results = res.all()
        except Exception as qe:
            logger.error(f"Falha na query SQL de fila-ativa: {str(qe)}")
            return []

        result_list = []
        now = datetime.utcnow()
        for row in results:
            r, mo_name = row
            try:
                # Helper to get naive utc
                def to_naive(dt): return dt.replace(tzinfo=None) if dt and dt.tzinfo else dt
                
                sol = to_naive(r.solicitado_em)
                
                item = {
                    "id": str(r.id),
                    "mo_number": mo_name if mo_name else "Desconhecida",
                    "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                    "prioridade": r.priority,
                    "solicitado_em": r.solicitado_em.isoformat() if r.solicitado_em else None,
                    "aging_horas": round((now - sol).total_seconds() / 3600, 1) if sol else 0,
                    "responsavel_atual": r.requester_name
                }
                result_list.append(item)
            except Exception as ex:
                logger.error(f"Erro ao processar item ID {r.id if r else 'unknown'}: {str(ex)}")
                continue
        
        return result_list

    @staticmethod
    async def get_ranking_responsaveis(session: AsyncSession, start_date: datetime, end_date: datetime) -> List[Dict]:
        """Calcula produtividade por responsável (designer/solicitante)."""
        start_naive = start_date.replace(tzinfo=None) if start_date.tzinfo else start_date
        end_naive = end_date.replace(tzinfo=None) if end_date.tzinfo else end_date

        stmt = sm_select(
            IDRequest.requester_name,
            func.count(IDRequest.id).label("concluidas"),
            func.avg((func.julianday(IDRequest.concluido_em) - func.julianday(IDRequest.solicitado_em)) * 1440).label("avg_ciclo")
        ).where(
            IDRequest.concluido_em >= start_naive,
            IDRequest.concluido_em <= end_naive
        ).group_by(IDRequest.requester_name)
        
        res = await session.execute(stmt)
        rows = res.all()
        
        return [
            {
                "nome": r[0] if r[0] else "N/A",
                "ids_concluidas": r[1],
                "tempo_medio_ciclo_min": round(r[2], 1) if r[2] else 0,
                "responsavel_id": 0 # Simulado pois requester_name é apenas str no modelo atual
            } for r in rows
        ]

    @staticmethod
    async def get_volume_por_periodo(session: AsyncSession, start_date: datetime, end_date: datetime) -> List[Dict]:
        """Retorna volume de solicitações vs entregas por dia."""
        start_naive = start_date.replace(tzinfo=None) if start_date.tzinfo else start_date
        end_naive = end_date.replace(tzinfo=None) if end_date.tzinfo else end_date

        # Solicitações por dia
        stmt_sol = sm_select(
            func.date(IDRequest.created_at).label("dia"),
            func.count(IDRequest.id).label("qtd")
        ).where(
            IDRequest.created_at >= start_naive,
            IDRequest.created_at <= end_naive
        ).group_by(func.date(IDRequest.created_at))
        
        res_sol = await session.execute(stmt_sol)
        sol_data = {r[0]: r[1] for r in res_sol.all()}
        
        # Conclusões por dia
        stmt_con = sm_select(
            func.date(IDRequest.concluido_em).label("dia"),
            func.count(IDRequest.id).label("qtd")
        ).where(
            IDRequest.concluido_em >= start_naive,
            IDRequest.concluido_em <= end_naive
        ).group_by(func.date(IDRequest.concluido_em))
        
        res_con = await session.execute(stmt_con)
        con_data = {r[0]: r[1] for r in res_con.all()}
        
        all_days = sorted(list(set(list(sol_data.keys()) + list(con_data.keys()))))
        
        return [
            {
                "label": day,
                "solicitadas": sol_data.get(day, 0),
                "entregues": con_data.get(day, 0),
                "no_prazo": con_data.get(day, 0) # Simplificado
            } for day in all_days
        ]

    @staticmethod
    async def get_evolucao_tempo_ciclo(session: AsyncSession, start_date: datetime, end_date: datetime) -> List[Dict]:
        """Tendência do Lead Time médio diário."""
        start_naive = start_date.replace(tzinfo=None) if start_date.tzinfo else start_date
        end_naive = end_date.replace(tzinfo=None) if end_date.tzinfo else end_date

        stmt = sm_select(
            func.date(IDRequest.concluido_em).label("dia"),
            func.avg((func.julianday(IDRequest.concluido_em) - func.julianday(IDRequest.solicitado_em)) * 1440).label("avg_min")
        ).where(
            IDRequest.concluido_em >= start_naive,
            IDRequest.concluido_em <= end_naive
        ).group_by(func.date(IDRequest.concluido_em))
        
        res = await session.execute(stmt)
        return [{"label": r[0], "tempo_medio_ciclo_min": round(r[1], 1) if r[1] else 0} for r in res.all()]

    @staticmethod
    async def get_impacto_fabricacao(session: AsyncSession, start_date: datetime, end_date: datetime) -> List[Dict]:
        """Gargalos de fabricação por motivo."""
        start_naive = start_date.replace(tzinfo=None) if start_date.tzinfo else start_date
        end_naive = end_date.replace(tzinfo=None) if end_date.tzinfo else end_naive

        stmt = sm_select(
            FabricacaoBlock.motivo,
            func.sum(FabricacaoBlock.tempo_parado_minutos).label("total_min"),
            func.count(FabricacaoBlock.id).label("ocorrencias")
        ).where(
            FabricacaoBlock.of_bloqueada_em >= start_naive,
            FabricacaoBlock.of_bloqueada_em <= end_naive
        ).group_by(FabricacaoBlock.motivo)
        
        res = await session.execute(stmt)
        return [
            {
                "label": r[0] if r[0] else "Outros",
                "horas_paradas_total": round(r[1]/60, 1) if r[1] else 0,
                "ofs_afetadas": r[2]
            } for r in res.all()
        ]

    @staticmethod
    async def get_motivos_revisao(session: AsyncSession, start_date: datetime, end_date: datetime) -> List[Dict]:
        """Análise de Pareto de motivos de retrabalho."""
        start_naive = start_date.replace(tzinfo=None) if start_date.tzinfo else start_date
        end_naive = end_date.replace(tzinfo=None) if end_date.tzinfo else end_date

        stmt = sm_select(
            RevisaoIDVisual.motivo,
            func.count(RevisaoIDVisual.id).label("qtd")
        ).where(
            RevisaoIDVisual.revisao_solicitada_em >= start_naive,
            RevisaoIDVisual.revisao_solicitada_em <= end_naive
        ).group_by(RevisaoIDVisual.motivo)
        
        res = await session.execute(stmt)
        rows = res.all()
        total = sum(r[1] for r in rows)
        
        return [
            {
                "motivo": str(r[0].value if hasattr(r[0], 'value') else r[0]),
                "quantidade": r[1],
                "percentual": round((r[1]/total)*100, 1) if total > 0 else 0
            } for r in rows
        ]
