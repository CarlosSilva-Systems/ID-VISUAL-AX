import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  RefreshCw, AlertTriangle, TrendingUp, Clock, Activity,
  ChevronRight, Zap, Shield, Timer, BarChart2,
} from 'lucide-react';
import {
  api,
  DashboardParams,
  OverviewResponse,
  TimelineEntry,
  TopCauseEntry,
  WorkcenterOverview,
} from '../../services/api';
import { cn } from '@/lib/utils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Formata minutos em "Xh Ymin" sem floating point */
function fmtMinutes(min: number | null | undefined): string {
  if (min == null || isNaN(min)) return '—';
  const rounded = Math.round(min);
  if (rounded === 0) return '0min';
  if (rounded < 60) return `${rounded}min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function availabilityColor(pct: number): { bg: string; text: string; bar: string } {
  if (pct >= 90) return { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' };
  if (pct >= 75) return { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400' };
  return { bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-500' };
}

const DONUT_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

// ── Skeletons ─────────────────────────────────────────────────────────────────

const KpiSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse space-y-3">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 bg-slate-100 rounded-xl" />
      <div className="h-3 bg-slate-100 rounded w-24" />
    </div>
    <div className="h-8 bg-slate-100 rounded w-3/4" />
    <div className="h-2 bg-slate-100 rounded w-full" />
  </div>
);

const ChartSkeleton: React.FC = () => (
  <div className="animate-pulse h-56 flex items-end gap-2 px-2">
    {[40, 70, 55, 90, 35, 80, 60, 45, 75, 50].map((h, i) => (
      <div key={i} className="flex-1 bg-slate-100 rounded-t-md" style={{ height: `${h}%` }} />
    ))}
  </div>
);

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  iconBg: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  onClick?: () => void;
  highlight?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({
  label, value, subValue, icon, iconBg, trend, trendLabel, onClick, highlight,
}) => (
  <div
    onClick={onClick}
    className={cn(
      'rounded-2xl border p-5 flex flex-col gap-3 transition-all',
      onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5',
      highlight
        ? 'bg-amber-50 border-amber-200'
        : 'bg-white border-slate-100 shadow-sm'
    )}
  >
    <div className="flex items-center justify-between">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', iconBg)}>
        {icon}
      </div>
      {trend && trendLabel && (
        <span className={cn(
          'text-[10px] font-bold px-2 py-0.5 rounded-full',
          trend === 'up' ? 'bg-red-100 text-red-600' :
          trend === 'down' ? 'bg-emerald-100 text-emerald-600' :
          'bg-slate-100 text-slate-500'
        )}>
          {trendLabel}
        </span>
      )}
    </div>
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      {/* truncate + text-base para evitar overflow */}
      <p className="text-xl font-black text-slate-900 leading-tight truncate" title={value}>
        {value}
      </p>
      {subValue && (
        <p className="text-xs text-slate-400 mt-0.5 truncate">{subValue}</p>
      )}
    </div>
  </div>
);

// ── Availability Bar ──────────────────────────────────────────────────────────

const AvailabilityBar: React.FC<{ pct: number }> = ({ pct }) => {
  const colors = availabilityColor(pct);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colors.bar)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={cn('text-xs font-bold min-w-[42px] text-right', colors.text)}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
};

// ── Componente principal ──────────────────────────────────────────────────────

export const AndonOEEDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [period, setPeriod] = useState({ from: daysAgo(30), to: today() });
  const [wcFilter, setWcFilter] = useState<number | undefined>();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [topCauses, setTopCauses] = useState<TopCauseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: DashboardParams = {
      from_date: period.from,
      to_date: period.to,
      workcenter_id: wcFilter,
    };
    try {
      const [ov, tl, tc] = await Promise.all([
        api.getAndonDashboardOverview(params),
        api.getAndonDashboardTimeline(params),
        api.getAndonDashboardTopCauses(params),
      ]);
      setOverview(ov);
      setTimeline(tl);
      setTopCauses(tc);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dados';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [period, wcFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const workcenters: WorkcenterOverview[] = overview?.by_workcenter ?? [];

  // Dados do gráfico de timeline — filtrar dias sem dados para não poluir
  const timelineData = timeline.filter(t => t.red_calls > 0 || t.yellow_calls > 0);

  return (
    <div className="space-y-6 p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">

      {/* ── Cabeçalho ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            Indicadores · Andon
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Disponibilidade e eficiência dos centros de trabalho
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 min-h-[44px] bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors w-full sm:w-auto disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Data início
            </label>
            <input
              type="date"
              value={period.from}
              max={period.to}
              onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))}
              className="px-3 py-2 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Data fim
            </label>
            <input
              type="date"
              value={period.to}
              min={period.from}
              max={today()}
              onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))}
              className="px-3 py-2 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Workcenter
            </label>
            <select
              value={wcFilter ?? ''}
              onChange={e => setWcFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="px-3 py-2 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              <option value="">Todos os workcenters</option>
              {workcenters.map(wc => (
                <option key={wc.workcenter_id} value={wc.workcenter_id}>
                  {wc.workcenter_name}
                </option>
              ))}
            </select>
          </div>
          {/* Atalhos de período */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: '7d', days: 7 },
              { label: '30d', days: 30 },
              { label: '90d', days: 90 },
            ].map(({ label, days }) => (
              <button
                key={label}
                onClick={() => setPeriod({ from: daysAgo(days), to: today() })}
                className={cn(
                  'px-3 min-h-[44px] rounded-xl text-xs font-bold border transition-colors',
                  period.from === daysAgo(days) && period.to === today()
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-red-100 p-10 flex flex-col items-center gap-3">
          <AlertTriangle className="w-10 h-10 text-red-400" />
          <p className="text-sm font-semibold text-red-600">{error}</p>
          <button
            onClick={fetchAll}
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Tentar novamente
          </button>
        </div>
      ) : overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard
            label="Total Chamados"
            value={String(overview.summary.total_calls)}
            icon={<Zap className="w-4 h-4 text-blue-600" />}
            iconBg="bg-blue-100"
          />
          <KpiCard
            label="Paradas Críticas"
            value={String(overview.summary.total_red)}
            icon={<span className="text-sm">🔴</span>}
            iconBg="bg-red-100"
            trend={overview.summary.total_red > 5 ? 'up' : 'neutral'}
            trendLabel={overview.summary.total_red > 5 ? 'Alto' : 'Normal'}
          />
          <KpiCard
            label="Tempo Parado"
            value={fmtMinutes(overview.summary.total_downtime_minutes)}
            icon={<Timer className="w-4 h-4 text-orange-600" />}
            iconBg="bg-orange-100"
          />
          <KpiCard
            label="Disponib. Média"
            value={`${overview.summary.avg_availability_percent.toFixed(1)}%`}
            icon={<Shield className="w-4 h-4 text-emerald-600" />}
            iconBg="bg-emerald-100"
            trend={overview.summary.avg_availability_percent >= 90 ? 'down' : 'up'}
            trendLabel={overview.summary.avg_availability_percent >= 90 ? 'Ótimo' : 'Atenção'}
          />
          <KpiCard
            label="MTTR Médio"
            value={fmtMinutes(overview.summary.avg_mttr_minutes)}
            subValue="Tempo médio de reparo"
            icon={<Clock className="w-4 h-4 text-purple-600" />}
            iconBg="bg-purple-100"
          />
          <KpiCard
            label="Pendências"
            value={String(overview.summary.pending_justifications)}
            subValue="Aguardando justificativa"
            icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
            iconBg="bg-amber-100"
            highlight={overview.summary.pending_justifications > 0}
            onClick={() => navigate('/andon/pendencias')}
            trend={overview.summary.pending_justifications > 0 ? 'up' : 'neutral'}
            trendLabel={overview.summary.pending_justifications > 0 ? 'Ver →' : 'Em dia'}
          />
        </div>
      )}

      {/* ── Gráficos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BarChart: acionamentos por dia */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-700">Acionamentos por Dia</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Vermelho
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Amarelo
              </span>
            </div>
          </div>
          {loading ? <ChartSkeleton /> : timelineData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">
              Nenhum acionamento no período
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timelineData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickFormatter={d => d.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(value: number, name: string) => [
                      value,
                      name === 'red_calls' ? '🔴 Vermelho' : '🟡 Amarelo',
                    ]}
                    labelFormatter={l => `📅 ${l}`}
                  />
                  <Bar dataKey="red_calls" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="yellow_calls" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Donut: causas raiz */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Top Causas Raiz</h2>
          {loading ? <ChartSkeleton /> : topCauses.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-slate-400 gap-2">
              <TrendingUp className="w-8 h-8 opacity-30" />
              <p className="text-sm">Sem justificativas registradas no período</p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="h-48 w-full sm:w-48 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topCauses}
                      dataKey="total_downtime_minutes"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {topCauses.map((_, idx) => (
                        <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(v: number) => [`${fmtMinutes(v)}`, 'Tempo parado']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Lista de causas */}
              <div className="flex-1 space-y-2 w-full">
                {topCauses.slice(0, 5).map((cause, idx) => (
                  <div key={cause.category} className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                    />
                    <span className="text-xs text-slate-600 flex-1 truncate" title={cause.category}>
                      {cause.category}
                    </span>
                    <span className="text-xs font-bold text-slate-700 flex-shrink-0">
                      {fmtMinutes(cause.total_downtime_minutes)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabela por Workcenter ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">Desempenho por Workcenter</h2>
          {overview && (
            <span className="text-xs text-slate-400">
              {overview.by_workcenter.length} mesa{overview.by_workcenter.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !overview || overview.by_workcenter.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <Activity className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhum dado para o período selecionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <th className="text-left px-5 py-3">Mesa</th>
                  <th className="text-left px-4 py-3 min-w-[140px]">Disponibilidade</th>
                  <th className="text-center px-4 py-3">Chamados</th>
                  <th className="text-center px-4 py-3">🔴</th>
                  <th className="text-center px-4 py-3">🟡</th>
                  <th className="text-center px-4 py-3">T. Parado</th>
                  <th className="text-center px-4 py-3">MTTR</th>
                  <th className="text-center px-4 py-3">Pendências</th>
                  <th className="text-center px-4 py-3">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {overview.by_workcenter.map(wc => {
                  const avColors = availabilityColor(wc.availability_percent);
                  return (
                    <tr
                      key={wc.workcenter_id}
                      className="hover:bg-slate-50/60 transition-colors group"
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-slate-800 text-sm">{wc.workcenter_name}</span>
                      </td>
                      <td className="px-4 py-3.5 min-w-[140px]">
                        <AvailabilityBar pct={wc.availability_percent} />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-sm font-bold text-slate-700">{wc.total_calls}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-sm font-bold text-red-600">{wc.red_calls}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-sm font-bold text-amber-500">{wc.yellow_calls}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                          {fmtMinutes(wc.total_downtime_minutes)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                          {fmtMinutes(wc.mttr_minutes)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {wc.pending_justifications > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black bg-amber-100 text-amber-700">
                            {wc.pending_justifications}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => navigate(
                            `/andon/dashboard/${wc.workcenter_id}?from=${period.from}&to=${period.to}`
                          )}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors"
                          title={`Ver detalhe de ${wc.workcenter_name}`}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
