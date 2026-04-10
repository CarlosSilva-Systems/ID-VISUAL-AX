"""
Serviço de cálculo de métricas OEE para o Dashboard Andon.

Todas as funções de cálculo são puras (sem efeitos colaterais), exceto
get_andon_settings que acessa o banco de dados.
"""
import json
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Optional

from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.models.andon import AndonCall
from app.models.andon_settings import AndonSettings

# Mapeamento de nome de dia (inglês) para weekday() do Python (0=segunda, 6=domingo)
WEEKDAY_MAP: dict[str, int] = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def calc_working_minutes_per_day(start: str, end: str) -> int:
    """Calcula a duração do turno de trabalho em minutos.

    Args:
        start: Horário de início no formato "HH:MM"
        end: Horário de fim no formato "HH:MM"

    Returns:
        Diferença em minutos entre end e start. Retorna 0 se end <= start.
    """
    sh, sm = map(int, start.split(":"))
    eh, em = map(int, end.split(":"))
    return max(0, (eh * 60 + em) - (sh * 60 + sm))


def count_working_days(from_date: date, to_date: date, working_days_list: list[str]) -> int:
    """Conta os dias úteis em um intervalo de datas.

    Args:
        from_date: Data de início (inclusive)
        to_date: Data de fim (inclusive)
        working_days_list: Lista de nomes de dias úteis em inglês (ex: ["monday", "friday"])

    Returns:
        Número de dias úteis no intervalo.
    """
    working_weekdays = {WEEKDAY_MAP[d.lower()] for d in working_days_list if d.lower() in WEEKDAY_MAP}
    count = 0
    current = from_date
    while current <= to_date:
        if current.weekday() in working_weekdays:
            count += 1
        current += timedelta(days=1)
    return count


def calc_availability(total_downtime: int, working_minutes_total: int) -> float:
    """Calcula a disponibilidade operacional em percentual.

    Args:
        total_downtime: Total de minutos de parada no período
        working_minutes_total: Total de minutos disponíveis no período

    Returns:
        Disponibilidade em percentual [0.0, 100.0], arredondada para 1 decimal.
        Retorna 0.0 se working_minutes_total == 0.
    """
    if working_minutes_total <= 0:
        return 0.0
    availability = (working_minutes_total - total_downtime) / working_minutes_total * 100
    return round(max(0.0, availability), 1)


def calc_mttr(calls: list[AndonCall]) -> Optional[float]:
    """Calcula o MTTR (Mean Time To Resolve) em minutos.

    Considera apenas chamados com downtime_minutes não nulo.

    Args:
        calls: Lista de AndonCall (devem ser RESOLVED)

    Returns:
        Média de downtime_minutes, arredondada para 1 decimal.
        None se nenhum chamado tiver downtime_minutes preenchido.
    """
    valid = [c.downtime_minutes for c in calls if c.downtime_minutes is not None]
    if not valid:
        return None
    return round(sum(valid) / len(valid), 1)


def calc_mtbf(calls: list[AndonCall]) -> Optional[float]:
    """Calcula o MTBF (Mean Time Between Failures) em minutos.

    Considera apenas chamados RESOLVED, ordenados por created_at.

    Args:
        calls: Lista de AndonCall

    Returns:
        Média dos intervalos entre acionamentos consecutivos em minutos,
        arredondada para 1 decimal. None se menos de 2 chamados.
    """
    if len(calls) < 2:
        return None
    sorted_calls = sorted(calls, key=lambda c: c.created_at)
    intervals = []
    for i in range(1, len(sorted_calls)):
        delta = (sorted_calls[i].created_at - sorted_calls[i - 1].created_at).total_seconds() / 60
        intervals.append(delta)
    return round(sum(intervals) / len(intervals), 1)


def get_top_cause(calls: list[AndonCall]) -> Optional[str]:
    """Retorna a categoria de causa raiz mais frequente.

    Args:
        calls: Lista de AndonCall

    Returns:
        Nome da categoria mais frequente, ou None se nenhum chamado
        tiver root_cause_category preenchida.
    """
    categories = [c.root_cause_category for c in calls if c.root_cause_category]
    if not categories:
        return None
    return Counter(categories).most_common(1)[0][0]


async def get_andon_settings(session: AsyncSession) -> AndonSettings:
    """Busca as configurações globais do Andon.

    Retorna instância com valores padrão se o registro não existir no banco.

    Args:
        session: Sessão assíncrona do banco de dados

    Returns:
        Instância de AndonSettings (pode ser não persistida se não existir).
    """
    result = await session.execute(select(AndonSettings).where(AndonSettings.id == 1))
    settings = result.scalars().first()
    if settings is None:
        settings = AndonSettings()  # usa os defaults definidos no modelo
    return settings


def parse_working_days(working_days_json: str) -> list[str]:
    """Parseia o campo working_days de JSON string para lista de strings.

    Args:
        working_days_json: JSON string como '["monday","tuesday",...]'

    Returns:
        Lista de nomes de dias em inglês.
    """
    try:
        return json.loads(working_days_json)
    except (json.JSONDecodeError, TypeError):
        return ["monday", "tuesday", "wednesday", "thursday", "friday"]
