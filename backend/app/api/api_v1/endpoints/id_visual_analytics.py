"""
Endpoint de Analytics do ID Visual.
Métricas operacionais do fluxo de produção de identificações.
"""
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_session, get_current_user
from app.models.id_request import IDRequest, IDRequestTask, IDRequestStatus
from app.models.batch import Batch, BatchItem, BatchStatus
from app.models.manufacturing import ManufacturingOrder
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


def _naive(dt: Optional[datetime]) -> Optional[datetime]:
    """Remove tzinfo para comparação com campos naive do banco."""
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _fmt_minutes(minutes: Optional[float]) -> Optional[float]:
    """Arredonda para 1 casa decimal, evitando floating point longo."""
    if minutes is None:
        return None
    return round(minutes, 1)


@router.get("/kpis")
async def get_kpis(
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    KPIs principais do fluxo ID Visual:
    - Total de IDs solicitadas, concluídas, em aberto, bloqueadas
    - Tempo médio na fila (solicitado → iniciado)
    - Tempo médio de produção (iniciado → concluído)
    - Lead time total (solicitado → entregue)
    - Taxa de conclusão no período
    - Taxa de bloqueio
    """
    start = _naive(datetime.fromisoformat(from_date))
    end = _naive(datetime.fromisoformat(to_date) + timedelta(days=1))

    stmt = select(IDRequest).where(
        IDRequest.created_at >= start,
        IDRequest.created_at < end,
    )
    result = await session.execute(stmt)
    requests = result.scalars().all()

    total = len(requests)

    def status_str(r: IDRequest) -> str:
        s = r.status
        return s.value if hasattr(s, "value") else str(s)

    concluidas = [r for r in requests if status_str(r) in ("concluida", "entregue")]
    bloqueadas = [r for r in requests if status_str(r) == "bloqueada"]
    em_aberto = [r for r in requests if status_str(r) not in ("concluida", "entregue", "cancelada")]

    # Tempos
    tempo_fila = []       # solicitado_em → iniciado_em
    tempo_producao = []   # iniciado_em → concluido_em
    lead_time = []        # solicitado_em → entregue_em (ou concluido_em)

    for r in requests:
        sol = _naive(r.solicitado_em) or _naive(r.created_at)
        ini = _naive(r.iniciado_em) or _naive(r.started_at)
        con = _naive(r.concluido_em) or _naive(r.finished_at)
        ent = _naive(r.entregue_em)

        if sol and ini and ini > sol:
            tempo_fila.append((ini - sol).total_seconds() / 60)
        if ini and con and con > ini:
            tempo_producao.append((con - ini).total_seconds() / 60)
        fim = ent or con
        if sol and fim and fim > sol:
            lead_time.append((fim - sol).total_seconds() / 60)

    def avg(lst):
        return _fmt_minutes(sum(lst) / len(lst)) if lst else None

    nao_consta = [r for r in requests if r.nao_consta_em is not None]

    return {
        "total_solicitadas": total,
        "total_concluidas": len(concluidas),
        "total_em_aberto": len(em_aberto),
        "total_bloqueadas": len(bloqueadas),
        "total_nao_consta": len(nao_consta),
        "taxa_conclusao_pct": round(len(concluidas) / total * 100, 1) if total else 0,
        "taxa_bloqueio_pct": round(len(bloqueadas) / total * 100, 1) if total else 0,
        "taxa_nao_consta_pct": round(len(nao_consta) / total * 100, 1) if total else 0,
        "tempo_medio_fila_min": avg(tempo_fila),
        "tempo_medio_producao_min": avg(tempo_producao),
        "lead_time_medio_min": avg(lead_time),
    }

@router.get("/volume-diario")
async def get_volume_diario(
    from_date: str = Query(...),
    to_date: str = Query(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Volume de IDs solicitadas e concluídas por dia."""
    start = _naive(datetime.fromisoformat(from_date))
    end = _naive(datetime.fromisoformat(to_date) + timedelta(days=1))

    stmt_sol = (
        select(func.date(IDRequest.created_at).label("dia"), func.count(IDRequest.id).label("qtd"))
        .where(IDRequest.created_at >= start, IDRequest.created_at < end)
        .group_by(func.date(IDRequest.created_at))
    )
    stmt_con = (
        select(func.date(IDRequest.concluido_em).label("dia"), func.count(IDRequest.id).label("qtd"))
        .where(IDRequest.concluido_em >= start, IDRequest.concluido_em < end)
        .group_by(func.date(IDRequest.concluido_em))
    )

    sol_data = {r[0]: r[1] for r in (await session.execute(stmt_sol)).all()}
    con_data = {r[0]: r[1] for r in (await session.execute(stmt_con)).all()}

    all_days = sorted(set(list(sol_data) + list(con_data)))
    return [
        {"date": d, "solicitadas": sol_data.get(d, 0), "concluidas": con_data.get(d, 0)}
        for d in all_days
    ]


@router.get("/por-tipo-quadro")
async def get_por_tipo_quadro(
    from_date: str = Query(...),
    to_date: str = Query(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Distribuição de IDs por tipo de quadro (package_code)."""
    start = _naive(datetime.fromisoformat(from_date))
    end = _naive(datetime.fromisoformat(to_date) + timedelta(days=1))

    stmt = (
        select(IDRequest.package_code, func.count(IDRequest.id).label("total"))
        .where(IDRequest.created_at >= start, IDRequest.created_at < end)
        .group_by(IDRequest.package_code)
    )
    rows = (await session.execute(stmt)).all()
    total = sum(r[1] for r in rows)
    return [
        {
            "tipo": r[0] or "Não definido",
            "total": r[1],
            "pct": round(r[1] / total * 100, 1) if total else 0,
        }
        for r in sorted(rows, key=lambda x: x[1], reverse=True)
    ]


@router.get("/por-status")
async def get_por_status(
    from_date: str = Query(...),
    to_date: str = Query(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Distribuição atual de IDs por status no período."""
    start = _naive(datetime.fromisoformat(from_date))
    end = _naive(datetime.fromisoformat(to_date) + timedelta(days=1))

    stmt = (
        select(IDRequest.status, func.count(IDRequest.id).label("total"))
        .where(IDRequest.created_at >= start, IDRequest.created_at < end)
        .group_by(IDRequest.status)
    )
    rows = (await session.execute(stmt)).all()
    total = sum(r[1] for r in rows)

    STATUS_LABELS = {
        "nova": "Nova",
        "triagem": "Triagem",
        "em_lote": "Em Lote",
        "em_progresso": "Em Progresso",
        "bloqueada": "Bloqueada",
        "concluida": "Concluída",
        "entregue": "Entregue",
        "cancelada": "Cancelada",
    }
    return [
        {
            "status": STATUS_LABELS.get(str(r[0]), str(r[0])),
            "total": r[1],
            "pct": round(r[1] / total * 100, 1) if total else 0,
        }
        for r in sorted(rows, key=lambda x: x[1], reverse=True)
    ]


@router.get("/lead-time-tendencia")
async def get_lead_time_tendencia(
    from_date: str = Query(...),
    to_date: str = Query(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Lead time médio diário (tendência de melhoria/piora)."""
    start = _naive(datetime.fromisoformat(from_date))
    end = _naive(datetime.fromisoformat(to_date) + timedelta(days=1))

    stmt = select(IDRequest).where(
        IDRequest.concluido_em >= start,
        IDRequest.concluido_em < end,
        IDRequest.solicitado_em.isnot(None),
    )
    requests = (await session.execute(stmt)).scalars().all()

    daily: dict[str, list[float]] = {}
    for r in requests:
        sol = _naive(r.solicitado_em) or _naive(r.created_at)
        con = _naive(r.concluido_em)
        if sol and con and con > sol:
            day = con.date().isoformat()
            daily.setdefault(day, []).append((con - sol).total_seconds() / 60)

    return [
        {"date": d, "lead_time_medio_min": _fmt_minutes(sum(v) / len(v))}
        for d, v in sorted(daily.items())
    ]


@router.get("/fila-atual")
async def get_fila_atual(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """IDs em aberto agora com aging (tempo esperando)."""
    abertos = [s.value for s in IDRequestStatus if s not in (
        IDRequestStatus.CONCLUIDA, IDRequestStatus.ENTREGUE, IDRequestStatus.CANCELADA
    )]

    stmt = (
        select(IDRequest, ManufacturingOrder.name)
        .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id, isouter=True)
        .where(IDRequest.status.in_(abertos))
        .order_by(IDRequest.created_at.asc())
    )
    rows = (await session.execute(stmt)).all()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    result = []
    for r, mo_name in rows:
        sol = _naive(r.solicitado_em) or _naive(r.created_at)
        aging_h = round((now - sol).total_seconds() / 3600, 1) if sol else 0
        result.append({
            "id": str(r.id),
            "mo_number": mo_name or "—",
            "status": r.status.value if hasattr(r.status, "value") else str(r.status),
            "package_code": r.package_code or "—",
            "priority": r.priority or "normal",
            "aging_horas": aging_h,
            "solicitado_em": r.solicitado_em.isoformat() if r.solicitado_em else None,
        })
    return result


@router.get("/lotes")
async def get_lotes_stats(
    from_date: str = Query(...),
    to_date: str = Query(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Estatísticas de lotes: throughput, tempo médio de execução."""
    start = _naive(datetime.fromisoformat(from_date))
    end = _naive(datetime.fromisoformat(to_date) + timedelta(days=1))

    stmt = select(Batch).where(
        Batch.created_at >= start,
        Batch.created_at < end,
    )
    batches = (await session.execute(stmt)).scalars().all()

    finalizados = [b for b in batches if b.finalized_at is not None]
    tempos = []
    for b in finalizados:
        ini = _naive(b.created_at)
        fim = _naive(b.finalized_at)
        if ini and fim and fim > ini:
            tempos.append((fim - ini).total_seconds() / 60)

    return {
        "total_lotes": len(batches),
        "lotes_finalizados": len(finalizados),
        "lotes_em_andamento": len([b for b in batches if b.status == BatchStatus.ACTIVE]),
        "tempo_medio_lote_min": _fmt_minutes(sum(tempos) / len(tempos)) if tempos else None,
    }


@router.get("/nao-consta")
async def get_nao_consta(
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Métricas de ocorrências 'Não Consta' no período.

    Retorna:
    - total_ocorrencias: quantas requests tiveram nao_consta registrado
    - taxa_nao_consta_pct: % das requests solicitadas no período que tiveram nao_consta
    - por_item: ranking dos task_codes mais frequentes nas ocorrências
    - ocorrencias: lista detalhada com mo_number, items, registrado_por, data
    """
    start = _naive(datetime.fromisoformat(from_date))
    end = _naive(datetime.fromisoformat(to_date) + timedelta(days=1))

    # Total de requests solicitadas no período (denominador da taxa)
    stmt_total = select(func.count(IDRequest.id)).where(
        IDRequest.created_at >= start,
        IDRequest.created_at < end,
    )
    total_solicitadas = (await session.execute(stmt_total)).scalar() or 0

    # Requests com nao_consta registrado no período
    stmt_nc = (
        select(IDRequest, ManufacturingOrder.name)
        .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id, isouter=True)
        .where(
            IDRequest.nao_consta_em >= start,
            IDRequest.nao_consta_em < end,
        )
        .order_by(IDRequest.nao_consta_em.desc())
    )
    rows = (await session.execute(stmt_nc)).all()

    total_ocorrencias = len(rows)
    taxa = round(total_ocorrencias / total_solicitadas * 100, 1) if total_solicitadas else 0

    # Ranking por item (task_code)
    item_counts: dict[str, int] = {}
    ocorrencias = []
    for r, mo_name in rows:
        items = r.nao_consta_items or []
        for item in items:
            item_counts[item] = item_counts.get(item, 0) + 1
        ocorrencias.append({
            "request_id": str(r.id),
            "mo_number": mo_name or "—",
            "items": items,
            "registrado_por": r.nao_consta_registrado_por or "—",
            "nao_consta_em": r.nao_consta_em.isoformat() if r.nao_consta_em else None,
            "package_code": r.package_code or "—",
        })

    por_item = sorted(
        [{"task_code": k, "total": v} for k, v in item_counts.items()],
        key=lambda x: x["total"],
        reverse=True,
    )

    return {
        "total_ocorrencias": total_ocorrencias,
        "total_solicitadas": total_solicitadas,
        "taxa_nao_consta_pct": taxa,
        "por_item": por_item,
        "ocorrencias": ocorrencias,
    }
