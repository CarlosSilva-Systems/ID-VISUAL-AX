"""Schemas Pydantic para o Dashboard OEE/Eficiência Andon."""
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, model_validator


class DashboardPeriod(BaseModel):
    """Parâmetros de período para os endpoints de dashboard."""
    model_config = ConfigDict(extra="forbid")

    from_date: date
    to_date: date
    workcenter_id: Optional[int] = None

    @model_validator(mode="after")
    def validate_period(self) -> "DashboardPeriod":
        if self.from_date > self.to_date:
            raise ValueError("from_date não pode ser posterior a to_date")
        return self


class DashboardSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_calls: int
    total_red: int
    total_yellow: int
    total_downtime_minutes: int
    avg_availability_percent: float
    avg_mttr_minutes: Optional[float]
    pending_justifications: int


class WorkcenterOverview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workcenter_id: int
    workcenter_name: str
    availability_percent: float
    total_calls: int
    red_calls: int
    yellow_calls: int
    total_downtime_minutes: int
    mttr_minutes: Optional[float]
    pending_justifications: int
    top_cause: Optional[str]


class PeriodInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_date: str
    to_date: str
    working_minutes_per_day: int


class OverviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period: PeriodInfo
    summary: DashboardSummary
    by_workcenter: list[WorkcenterOverview]


class WorkcenterDetailMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workcenter_id: int
    workcenter_name: str
    availability_percent: float
    mttr_minutes: Optional[float]
    mtbf_minutes: Optional[float]
    total_downtime_minutes: int
    total_calls: int
    red_calls: int
    yellow_calls: int
    justified_calls: int
    pending_justification: int


class DowntimeByDay(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: str  # "YYYY-MM-DD"
    total_downtime_minutes: int
    calls: int


class CallByRootCause(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str
    count: int
    total_downtime_minutes: int


class RecentCall(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    color: str
    category: str
    reason: str
    downtime_minutes: Optional[int]
    root_cause_category: Optional[str]
    justified_at: Optional[datetime]
    created_at: datetime
    requires_justification: bool


class WorkcenterDetailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workcenter_id: int
    workcenter_name: str
    period: dict
    metrics: WorkcenterDetailMetrics
    downtime_by_day: list[DowntimeByDay]
    calls_by_root_cause: list[CallByRootCause]
    recent_calls: list[RecentCall]


class TopCauseEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str
    count: int
    total_downtime_minutes: int
    avg_downtime_minutes: float
    affected_workcenters: list[str]


class TimelineEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: str  # "YYYY-MM-DD"
    red_calls: int
    yellow_calls: int
    total_downtime_minutes: int
