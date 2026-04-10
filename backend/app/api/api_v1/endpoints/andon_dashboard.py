"""Endpoints do Dashboard OEE/Eficiência Andon."""
import uuid
import logging
from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_session
from app.models.andon import AndonCall
from app.schemas.andon_dashboard import (
    DashboardPeriod,
    DowntimeByDay,
    OverviewResponse,
    PeriodInfo,
    DashboardSummary,
    WorkcenterOverview,
    WorkcenterDetailMetrics,
    WorkcenterDetailResponse,
    CallByRootCause,
    RecentCall,
    TopCauseEntry,
    TimelineEntry,
)
from app.services import oee_service

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)
router = APIRouter()


def _get_period(
    from_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    to_date: date = Query(..., description="Data de fim (YYYY-MM-DD)"),
    workcenter_id: Optional[int] = Query(None, description="Filtrar por workcenter"),
) -> DashboardPeriod:
    """Dependency para validar e extrair parâmetros de período."""
    return DashboardPeriod(from_date=from_date, to_date=to_date, workcenter_id=workcenter_id)


@router.get("/overview", response_model=OverviewResponse)
@limiter.limit("30/minute")
async def get_dashboard_overview(
    request: Request,
    period: DashboardPeriod = Depends(_get_period),
    session: AsyncSession = Depends(get_session),
) -> OverviewResponse:
    """Visão geral de todos os workcenters para o período selecionado."""
    try:
        settings = await oee_service.get_andon_settings(session)
        working_days_list = oee_service.parse_working_days(settings.working_days)
        minutes_per_day = oee_service.calc_working_minutes_per_day(
            settings.working_day_start, settings.working_day_end
        )

        # Buscar chamados RESOLVED no período
        stmt = select(AndonCall).where(
            AndonCall.status == "RESOLVED",
            AndonCall.created_at >= period.from_date.isoformat(),
            AndonCall.created_at < (period.to_date + timedelta(days=1)).isoformat(),
        )
        if period.workcenter_id is not None:
            stmt = stmt.where(AndonCall.workcenter_id == period.workcenter_id)

        result = await session.execute(stmt)
        all_calls = result.scalars().all()

        # Agrupar por workcenter
        wc_calls: dict[int, list[AndonCall]] = defaultdict(list)
        wc_names: dict[int, str] = {}
        for call in all_calls:
            wc_calls[call.workcenter_id].append(call)
            wc_names[call.workcenter_id] = call.workcenter_name

        # Calcular dias úteis no período
        working_days_count = oee_service.count_working_days(
            period.from_date, period.to_date, working_days_list
        )
        working_minutes_total = minutes_per_day * working_days_count

        # Calcular métricas por workcenter
        by_workcenter: list[WorkcenterOverview] = []
        for wc_id, calls in wc_calls.items():
            total_downtime = sum(c.downtime_minutes or 0 for c in calls)
            availability = oee_service.calc_availability(total_downtime, working_minutes_total)
            mttr = oee_service.calc_mttr(calls)
            top_cause = oee_service.get_top_cause(calls)
            pending = sum(1 for c in calls if c.requires_justification and c.justified_at is None)

            by_workcenter.append(WorkcenterOverview(
                workcenter_id=wc_id,
                workcenter_name=wc_names[wc_id],
                availability_percent=availability,
                total_calls=len(calls),
                red_calls=sum(1 for c in calls if c.color == "RED"),
                yellow_calls=sum(1 for c in calls if c.color == "YELLOW"),
                total_downtime_minutes=total_downtime,
                mttr_minutes=mttr,
                pending_justifications=pending,
                top_cause=top_cause,
            ))

        # Calcular summary global
        total_downtime_global = sum(c.downtime_minutes or 0 for c in all_calls)
        avg_availability = (
            round(sum(wc.availability_percent for wc in by_workcenter) / len(by_workcenter), 1)
            if by_workcenter else 0.0
        )
        avg_mttr = oee_service.calc_mttr(list(all_calls))
        pending_global = sum(
            1 for c in all_calls if c.requires_justification and c.justified_at is None
        )

        summary = DashboardSummary(
            total_calls=len(all_calls),
            total_red=sum(1 for c in all_calls if c.color == "RED"),
            total_yellow=sum(1 for c in all_calls if c.color == "YELLOW"),
            total_downtime_minutes=total_downtime_global,
            avg_availability_percent=avg_availability,
            avg_mttr_minutes=avg_mttr,
            pending_justifications=pending_global,
        )

        return OverviewResponse(
            period=PeriodInfo(
                from_date=period.from_date.isoformat(),
                to_date=period.to_date.isoformat(),
                working_minutes_per_day=minutes_per_day,
            ),
            summary=summary,
            by_workcenter=sorted(by_workcenter, key=lambda x: x.workcenter_name),
        )

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        req_id = str(uuid.uuid4())[:8]
        logger.exception(f"Erro em get_dashboard_overview [ref:{req_id}]: {e}")
        raise HTTPException(status_code=500, detail=f"Erro interno no servidor [ref: {req_id}]")


@router.get("/workcenter/{wc_id}", response_model=WorkcenterDetailResponse)
@limiter.limit("30/minute")
async def get_workcenter_detail(
    request: Request,
    wc_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    session: AsyncSession = Depends(get_session),
) -> WorkcenterDetailResponse:
    """Detalhamento completo de um workcenter específico."""
    try:
        if from_date > to_date:
            raise HTTPException(status_code=422, detail="from_date não pode ser posterior a to_date")

        settings = await oee_service.get_andon_settings(session)
        working_days_list = oee_service.parse_working_days(settings.working_days)
        minutes_per_day = oee_service.calc_working_minutes_per_day(
            settings.working_day_start, settings.working_day_end
        )

        # Buscar chamados do workcenter no período
        stmt = select(AndonCall).where(
            AndonCall.workcenter_id == wc_id,
            AndonCall.status == "RESOLVED",
            AndonCall.created_at >= from_date.isoformat(),
            AndonCall.created_at < (to_date + timedelta(days=1)).isoformat(),
        )
        result = await session.execute(stmt)
        calls = result.scalars().all()

        # Verificar se o workcenter existe (buscar qualquer chamado, não só RESOLVED)
        if not calls:
            stmt_any = select(AndonCall).where(AndonCall.workcenter_id == wc_id).limit(1)
            result_any = await session.execute(stmt_any)
            any_call = result_any.scalars().first()
            if any_call is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Workcenter {wc_id} não encontrado"
                )

        wc_name = calls[0].workcenter_name if calls else f"Workcenter {wc_id}"

        # Calcular métricas
        working_days_count = oee_service.count_working_days(from_date, to_date, working_days_list)
        working_minutes_total = minutes_per_day * working_days_count
        total_downtime = sum(c.downtime_minutes or 0 for c in calls)
        availability = oee_service.calc_availability(total_downtime, working_minutes_total)
        mttr = oee_service.calc_mttr(list(calls))
        mtbf = oee_service.calc_mtbf(list(calls))
        justified_calls = sum(1 for c in calls if c.justified_at is not None)
        pending = sum(1 for c in calls if c.requires_justification and c.justified_at is None)

        metrics = WorkcenterDetailMetrics(
            workcenter_id=wc_id,
            workcenter_name=wc_name,
            availability_percent=availability,
            mttr_minutes=mttr,
            mtbf_minutes=mtbf,
            total_downtime_minutes=total_downtime,
            total_calls=len(calls),
            red_calls=sum(1 for c in calls if c.color == "RED"),
            yellow_calls=sum(1 for c in calls if c.color == "YELLOW"),
            justified_calls=justified_calls,
            pending_justification=pending,
        )

        # Downtime por dia (todos os dias do período, inclusive zeros)
        downtime_map: dict[str, dict] = {}
        current = from_date
        while current <= to_date:
            downtime_map[current.isoformat()] = {"total_downtime_minutes": 0, "calls": 0}
            current += timedelta(days=1)

        for call in calls:
            day_key = call.created_at.date().isoformat()
            if day_key in downtime_map:
                downtime_map[day_key]["total_downtime_minutes"] += call.downtime_minutes or 0
                downtime_map[day_key]["calls"] += 1

        downtime_by_day = [
            DowntimeByDay(date=d, total_downtime_minutes=v["total_downtime_minutes"], calls=v["calls"])
            for d, v in sorted(downtime_map.items())
        ]

        # Causas raiz
        cause_map: dict[str, dict] = {}
        for call in calls:
            if call.root_cause_category:
                cat = call.root_cause_category
                if cat not in cause_map:
                    cause_map[cat] = {"count": 0, "total_downtime_minutes": 0}
                cause_map[cat]["count"] += 1
                cause_map[cat]["total_downtime_minutes"] += call.downtime_minutes or 0

        calls_by_root_cause = sorted(
            [CallByRootCause(category=k, **v) for k, v in cause_map.items()],
            key=lambda x: x.total_downtime_minutes,
            reverse=True,
        )

        # Chamados recentes (últimos 20)
        recent_calls = [
            RecentCall(
                id=c.id,
                color=c.color,
                category=c.category,
                reason=c.reason,
                downtime_minutes=c.downtime_minutes,
                root_cause_category=c.root_cause_category,
                justified_at=c.justified_at,
                created_at=c.created_at,
                requires_justification=c.requires_justification,
            )
            for c in sorted(calls, key=lambda x: x.created_at, reverse=True)[:20]
        ]

        return WorkcenterDetailResponse(
            workcenter_id=wc_id,
            workcenter_name=wc_name,
            period={"from": from_date.isoformat(), "to": to_date.isoformat()},
            metrics=metrics,
            downtime_by_day=downtime_by_day,
            calls_by_root_cause=calls_by_root_cause,
            recent_calls=recent_calls,
        )

    except HTTPException:
        raise
    except Exception as e:
        req_id = str(uuid.uuid4())[:8]
        logger.exception(f"Erro em get_workcenter_detail [ref:{req_id}]: {e}")
        raise HTTPException(status_code=500, detail=f"Erro interno no servidor [ref: {req_id}]")


@router.get("/top-causes", response_model=list[TopCauseEntry])
@limiter.limit("30/minute")
async def get_top_causes(
    request: Request,
    period: DashboardPeriod = Depends(_get_period),
    limit: int = Query(10, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> list[TopCauseEntry]:
    """Ranking global de causas raiz de paradas."""
    try:
        stmt = select(AndonCall).where(
            AndonCall.status == "RESOLVED",
            AndonCall.root_cause_category.isnot(None),
            AndonCall.created_at >= period.from_date.isoformat(),
            AndonCall.created_at < (period.to_date + timedelta(days=1)).isoformat(),
        )
        if period.workcenter_id is not None:
            stmt = stmt.where(AndonCall.workcenter_id == period.workcenter_id)

        result = await session.execute(stmt)
        calls = result.scalars().all()

        if not calls:
            return []

        # Agrupar por categoria
        cause_map: dict[str, dict] = {}
        for call in calls:
            cat = call.root_cause_category
            if cat not in cause_map:
                cause_map[cat] = {"count": 0, "total_downtime_minutes": 0, "workcenters": set()}
            cause_map[cat]["count"] += 1
            cause_map[cat]["total_downtime_minutes"] += call.downtime_minutes or 0
            cause_map[cat]["workcenters"].add(call.workcenter_name)

        entries = [
            TopCauseEntry(
                category=cat,
                count=v["count"],
                total_downtime_minutes=v["total_downtime_minutes"],
                avg_downtime_minutes=round(v["total_downtime_minutes"] / v["count"], 1),
                affected_workcenters=sorted(v["workcenters"]),
            )
            for cat, v in cause_map.items()
        ]

        return sorted(entries, key=lambda x: x.total_downtime_minutes, reverse=True)[:limit]

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        req_id = str(uuid.uuid4())[:8]
        logger.exception(f"Erro em get_top_causes [ref:{req_id}]: {e}")
        raise HTTPException(status_code=500, detail=f"Erro interno no servidor [ref: {req_id}]")


@router.get("/timeline", response_model=list[TimelineEntry])
@limiter.limit("30/minute")
async def get_timeline(
    request: Request,
    period: DashboardPeriod = Depends(_get_period),
    session: AsyncSession = Depends(get_session),
) -> list[TimelineEntry]:
    """Série temporal de acionamentos por dia."""
    try:
        stmt = select(AndonCall).where(
            AndonCall.status == "RESOLVED",
            AndonCall.created_at >= period.from_date.isoformat(),
            AndonCall.created_at < (period.to_date + timedelta(days=1)).isoformat(),
        )
        if period.workcenter_id is not None:
            stmt = stmt.where(AndonCall.workcenter_id == period.workcenter_id)

        result = await session.execute(stmt)
        calls = result.scalars().all()

        # Inicializar todos os dias do período com zeros
        timeline_map: dict[str, dict] = {}
        current = period.from_date
        while current <= period.to_date:
            timeline_map[current.isoformat()] = {
                "red_calls": 0,
                "yellow_calls": 0,
                "total_downtime_minutes": 0,
            }
            current += timedelta(days=1)

        # Preencher com dados reais
        for call in calls:
            day_key = call.created_at.date().isoformat()
            if day_key in timeline_map:
                if call.color == "RED":
                    timeline_map[day_key]["red_calls"] += 1
                elif call.color == "YELLOW":
                    timeline_map[day_key]["yellow_calls"] += 1
                timeline_map[day_key]["total_downtime_minutes"] += call.downtime_minutes or 0

        return [
            TimelineEntry(date=d, **v)
            for d, v in sorted(timeline_map.items())
        ]

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        req_id = str(uuid.uuid4())[:8]
        logger.exception(f"Erro em get_timeline [ref:{req_id}]: {e}")
        raise HTTPException(status_code=500, detail=f"Erro interno no servidor [ref: {req_id}]")
