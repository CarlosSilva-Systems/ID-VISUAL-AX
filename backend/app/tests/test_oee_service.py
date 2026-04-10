"""Testes unitários para oee_service.py"""
import pytest
from datetime import date, datetime
from unittest.mock import MagicMock

from app.services.oee_service import (
    calc_working_minutes_per_day,
    count_working_days,
    calc_availability,
    calc_mttr,
    calc_mtbf,
    get_top_cause,
    parse_working_days,
)
from app.models.andon import AndonCall


def make_call(**kwargs) -> AndonCall:
    """Helper para criar AndonCall de teste sem persistência."""
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
    call = AndonCall.model_validate(defaults)
    return call


class TestCalcWorkingMinutesPerDay:
    def test_standard_shift(self):
        assert calc_working_minutes_per_day("08:00", "17:00") == 540

    def test_half_day(self):
        assert calc_working_minutes_per_day("08:00", "12:00") == 240

    def test_zero_minutes(self):
        assert calc_working_minutes_per_day("08:00", "08:00") == 0

    def test_end_before_start_returns_zero(self):
        assert calc_working_minutes_per_day("17:00", "08:00") == 0

    def test_one_hour(self):
        assert calc_working_minutes_per_day("09:00", "10:00") == 60


class TestCountWorkingDays:
    def test_full_week_mon_fri(self):
        # 2025-04-07 (segunda) a 2025-04-13 (domingo) = 5 dias úteis
        result = count_working_days(
            date(2025, 4, 7), date(2025, 4, 13),
            ["monday", "tuesday", "wednesday", "thursday", "friday"]
        )
        assert result == 5

    def test_single_working_day(self):
        # 2025-04-07 é segunda-feira
        result = count_working_days(
            date(2025, 4, 7), date(2025, 4, 7),
            ["monday", "tuesday", "wednesday", "thursday", "friday"]
        )
        assert result == 1

    def test_single_weekend_day(self):
        # 2025-04-06 é domingo
        result = count_working_days(
            date(2025, 4, 6), date(2025, 4, 6),
            ["monday", "tuesday", "wednesday", "thursday", "friday"]
        )
        assert result == 0

    def test_no_working_days_configured(self):
        result = count_working_days(date(2025, 4, 7), date(2025, 4, 13), [])
        assert result == 0

    def test_two_weeks(self):
        # 2025-04-07 a 2025-04-20 = 10 dias úteis (seg-sex)
        result = count_working_days(
            date(2025, 4, 7), date(2025, 4, 20),
            ["monday", "tuesday", "wednesday", "thursday", "friday"]
        )
        assert result == 10


class TestCalcAvailability:
    def test_normal_case(self):
        # 540 min disponível, 54 min parado = 90%
        assert calc_availability(54, 540) == 90.0

    def test_no_downtime(self):
        assert calc_availability(0, 540) == 100.0

    def test_downtime_exceeds_available(self):
        # downtime > disponível → 0.0 (nunca negativo)
        assert calc_availability(600, 540) == 0.0

    def test_zero_working_minutes(self):
        assert calc_availability(0, 0) == 0.0

    def test_rounding(self):
        # 100/540 parado = 81.48...% disponível → 81.5%
        result = calc_availability(100, 540)
        assert result == round((540 - 100) / 540 * 100, 1)


class TestCalcMttr:
    def test_normal_case(self):
        calls = [
            make_call(downtime_minutes=30),
            make_call(downtime_minutes=60),
        ]
        assert calc_mttr(calls) == 45.0

    def test_ignores_null_downtime(self):
        calls = [
            make_call(downtime_minutes=30),
            make_call(downtime_minutes=None),
            make_call(downtime_minutes=60),
        ]
        assert calc_mttr(calls) == 45.0

    def test_all_null_returns_none(self):
        calls = [make_call(downtime_minutes=None), make_call(downtime_minutes=None)]
        assert calc_mttr(calls) is None

    def test_empty_list_returns_none(self):
        assert calc_mttr([]) is None

    def test_single_call(self):
        calls = [make_call(downtime_minutes=45)]
        assert calc_mttr(calls) == 45.0


class TestCalcMtbf:
    def test_single_call_returns_none(self):
        calls = [make_call(created_at=datetime(2025, 4, 1, 9, 0, 0))]
        assert calc_mtbf(calls) is None

    def test_empty_list_returns_none(self):
        assert calc_mtbf([]) is None

    def test_two_calls_one_hour_apart(self):
        calls = [
            make_call(created_at=datetime(2025, 4, 1, 9, 0, 0)),
            make_call(created_at=datetime(2025, 4, 1, 10, 0, 0)),
        ]
        assert calc_mtbf(calls) == 60.0

    def test_three_calls(self):
        calls = [
            make_call(created_at=datetime(2025, 4, 1, 9, 0, 0)),
            make_call(created_at=datetime(2025, 4, 1, 10, 0, 0)),  # +60 min
            make_call(created_at=datetime(2025, 4, 1, 10, 30, 0)),  # +30 min
        ]
        # média de [60, 30] = 45 min
        assert calc_mtbf(calls) == 45.0

    def test_unordered_calls_are_sorted(self):
        calls = [
            make_call(created_at=datetime(2025, 4, 1, 10, 0, 0)),
            make_call(created_at=datetime(2025, 4, 1, 9, 0, 0)),
        ]
        assert calc_mtbf(calls) == 60.0


class TestGetTopCause:
    def test_empty_list_returns_none(self):
        assert get_top_cause([]) is None

    def test_all_null_categories_returns_none(self):
        calls = [make_call(root_cause_category=None), make_call(root_cause_category=None)]
        assert get_top_cause(calls) is None

    def test_single_category(self):
        calls = [make_call(root_cause_category="Máquina")]
        assert get_top_cause(calls) == "Máquina"

    def test_most_frequent_wins(self):
        calls = [
            make_call(root_cause_category="Máquina"),
            make_call(root_cause_category="Material"),
            make_call(root_cause_category="Máquina"),
        ]
        assert get_top_cause(calls) == "Máquina"

    def test_ignores_null_in_mixed_list(self):
        calls = [
            make_call(root_cause_category=None),
            make_call(root_cause_category="Material"),
            make_call(root_cause_category="Material"),
        ]
        assert get_top_cause(calls) == "Material"


class TestParseWorkingDays:
    def test_valid_json(self):
        result = parse_working_days('["monday","tuesday","friday"]')
        assert result == ["monday", "tuesday", "friday"]

    def test_invalid_json_returns_default(self):
        result = parse_working_days("invalid")
        assert result == ["monday", "tuesday", "wednesday", "thursday", "friday"]

    def test_empty_array(self):
        result = parse_working_days("[]")
        assert result == []
