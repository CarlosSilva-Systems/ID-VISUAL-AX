"""Testes de propriedade para oee_service.py usando hypothesis.

Feature: andon-oee-dashboard
"""
import pytest
from datetime import date, datetime, timedelta
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from app.services.oee_service import (
    calc_working_minutes_per_day,
    count_working_days,
    calc_availability,
    calc_mttr,
    calc_mtbf,
    get_top_cause,
)
from app.models.andon import AndonCall


def make_call(**kwargs) -> AndonCall:
    defaults = {
        "id": 1,
        "color": "RED",
        "category": "Parada",
        "reason": "Teste",
        "workcenter_id": 1,
        "workcenter_name": "Mesa Teste",
        "status": "RESOLVED",
        "triggered_by": "test",
        "is_stop": True,
        "requires_justification": True,
        "created_at": datetime(2025, 4, 1, 9, 0, 0),
        "updated_at": datetime(2025, 4, 1, 9, 30, 0),
    }
    defaults.update(kwargs)
    return AndonCall.model_validate(defaults)


# Feature: andon-oee-dashboard, Property 3: Disponibilidade nunca é negativa
@given(
    total_downtime=st.integers(min_value=0, max_value=100_000),
    working_minutes=st.integers(min_value=1, max_value=100_000),
)
@settings(max_examples=100)
def test_availability_never_negative(total_downtime: int, working_minutes: int):
    """Disponibilidade deve estar sempre no intervalo [0.0, 100.0]."""
    result = calc_availability(total_downtime, working_minutes)
    assert 0.0 <= result <= 100.0


# Feature: andon-oee-dashboard, Property 4: MTTR ignora chamados sem downtime
@given(
    downtimes=st.lists(st.one_of(st.none(), st.integers(min_value=0, max_value=1000)), min_size=1, max_size=20)
)
@settings(max_examples=100)
def test_mttr_ignores_null_downtime(downtimes: list):
    """MTTR deve ser calculado apenas com downtime_minutes não nulo."""
    calls = [make_call(downtime_minutes=d) for d in downtimes]
    result = calc_mttr(calls)
    valid = [d for d in downtimes if d is not None]
    if not valid:
        assert result is None
    else:
        expected = round(sum(valid) / len(valid), 1)
        assert result == expected


# Feature: andon-oee-dashboard, Property 5: MTBF com menos de 2 chamados é null
@given(n=st.integers(min_value=0, max_value=1))
@settings(max_examples=100)
def test_mtbf_less_than_two_calls_is_null(n: int):
    """MTBF deve ser None quando há 0 ou 1 chamado."""
    calls = [make_call(created_at=datetime(2025, 4, 1, 9, i, 0)) for i in range(n)]
    assert calc_mtbf(calls) is None


# Feature: andon-oee-dashboard, Property 9: Cálculo de minutos de trabalho por dia
@given(
    h1=st.integers(min_value=0, max_value=22),
    m1=st.integers(min_value=0, max_value=59),
    h2=st.integers(min_value=0, max_value=23),
    m2=st.integers(min_value=0, max_value=59),
)
@settings(max_examples=100)
def test_working_minutes_per_day_formula(h1: int, m1: int, h2: int, m2: int):
    """calc_working_minutes_per_day deve retornar (end - start) em minutos, mínimo 0."""
    start = f"{h1:02d}:{m1:02d}"
    end = f"{h2:02d}:{m2:02d}"
    result = calc_working_minutes_per_day(start, end)
    expected = max(0, (h2 * 60 + m2) - (h1 * 60 + m1))
    assert result == expected


# Feature: andon-oee-dashboard, Property 10: Contagem de dias úteis é consistente
VALID_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

@given(
    offset=st.integers(min_value=0, max_value=365),
    span=st.integers(min_value=0, max_value=90),
    working_days=st.lists(st.sampled_from(VALID_DAYS), min_size=0, max_size=7, unique=True),
)
@settings(max_examples=100)
def test_count_working_days_idempotent_and_bounded(offset: int, span: int, working_days: list):
    """count_working_days deve ser idempotente e retornar valor entre 0 e total de dias."""
    from_date = date(2025, 1, 1) + timedelta(days=offset)
    to_date = from_date + timedelta(days=span)

    result1 = count_working_days(from_date, to_date, working_days)
    result2 = count_working_days(from_date, to_date, working_days)

    # Idempotência
    assert result1 == result2

    # Resultado entre 0 e total de dias no período
    total_days = span + 1
    assert 0 <= result1 <= total_days
