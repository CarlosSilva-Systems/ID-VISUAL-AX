import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { RefreshCw, AlertTriangle, TrendingDown, Clock, Activity, ChevronRight } from 'lucide-react';
import {
  api,
  DashboardParams,
  OverviewResponse,
  TimelineEntry,
  TopCauseEntry,
  WorkcenterOverview,
} from '../../services/api';

// ── Helpers ──

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function availabilityClass(pct: number): string {
  if (pct >= 90) return 'text-green-700 bg-green-50';
  if (pct >= 75) return 'text-yellow-700 bg-yellow-50';
  return 'text-red-700 bg-red-50';
}

function fmtMinutes(min: number | null): string {
  if (min == null) return 'N/A';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? ` ${m}min` : ''}`;
}

const DONUT_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

// ── Skeleton ──

const CardSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
    <div className="h-3 bg-slate-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-slate-200 rounded w-2/3" />
  </div>
);

const ChartSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse h-64 flex items-center justify-center">
    <div className="h-4 bg-slate-200 rounded w-1/3" />
  </div>
);

// ── Componente principal ──

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
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dados do dashboard';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [period, wcFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Lista de workcenters disponíveis para o filtro
  const workcenters: WorkcenterOverview[] = overview?.by_workcenter ?? [];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" />
            Dashboard OEE
          </h1>
          <p className="text-sm text-slate-500 mt-1">Eficiência e disponibilidade dos centros de trabalho</p>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* ── Bloco 1: Filtros + Cards ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Data início</label>
            <input
              type="date"
              value={period.from}
              max={period.to}
              onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Data fim</label>
            <input
              type="date"
              value={period.to}
              min={period.from}
              max={today()}
              onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Workcenter</label>
            <select
              value={wcFilter ?? ''}
              onChange={e => setWcFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Todos</option>
              {workcenters.map(wc => (
                <option key={wc.workcenter_id} value={wc.workcenter_id}>{wc.workcenter_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Cards de resumo */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <AlertTriangle className="w-8 h-8 mb-2 text-red-400" />
            <p className="text-sm font-medium text-red-600">{error}</p>
            <button onClick={fetchAll} className="mt-3 text-sm text-blue-600 hover:underline">Tentar novamente</button>
          </div>
        ) : overview && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <SummaryCard label="Chamados Total" value={String(overview.summary.total_calls)} icon={<Activity className="w-4 h-4 text-blue-500" />} />
            <SummaryCard label="Paradas Críticas" value={String(overview.summary.total_red)} icon={<span className="text-base">🔴</span>} />
            <SummaryCard label="Tempo Parado" value={fmtMinutes(overview.summary.total_downtime_minutes)} icon={<Clock className="w-4 h-4 text-orange-500" />} />
            <SummaryCard label="Disponib. Média" value={`${overview.summary.avg_availability_percent.toFixed(1)}%`} icon={<TrendingDown className="w-4 h-4 text-green-500" />} />
            <SummaryCard label="MTTR Médio" value={fmtMinutes(overview.summary.avg_mttr_minutes)} icon={<Clock className="w-4 h-4 text-purple-500" />} />
            <button
              onClick={() => navigate('/andon/pendencias')}
              className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-left hover:bg-amber-100 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Pendências</span>
              </div>
              <p className="text-2xl font-bold text-amber-700">{overview.summary.pending_justifications}</p>
            </button>
          </div>
        )}
      </div>

      {/* ── Bloco 2: Gráficos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BarChart empilhado: acionamentos por dia */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Acionamentos por Dia</h2>
          {loading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={timeline} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [value, name === 'red_calls' ? '🔴 Vermelho' : '🟡 Amarelo']}
                  labelFormatter={l => `Data: ${l}`}
                />
                <Bar dataKey="red_calls" stackId="a" fill="#ef4444" name="red_calls" radius={[0, 0, 0, 0]} />
                <Bar dataKey="yellow_calls" stackId="a" fill="#f59e0b" name="yellow_calls" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* DonutChart: causas raiz */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Causas Raiz (Tempo Parado)</h2>
          {loading ? <ChartSkeleton /> : topCauses.length === 0 ? (
            <div className="flex items-center justify-center h-60 text-slate-400 text-sm">Sem dados de causas raiz no período</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={topCauses}
                  dataKey="total_downtime_minutes"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {topCauses.map((_, idx) => (
                    <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(v: number) => [`${v}min`, 'Tempo parado']} />
                <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Bloco 3: Tabela por Workcenter ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Por Workcenter</h2>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !overview || overview.by_workcenter.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
            Nenhum dado encontrado para o período selecionado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Workcenter</th>
                  <th className="text-center px-4 py-3">Disponib.</th>
                  <th className="text-center px-4 py-3">Chamados</th>
                  <th className="text-center px-4 py-3">🔴</th>
                  <th className="text-center px-4 py-3">🟡</th>
                  <th className="text-center px-4 py-3">Tempo Parado</th>
                  <th className="text-center px-4 py-3">MTTR</th>
                  <th className="text-center px-4 py-3">Pendências</th>
                  <th className="text-center px-4 py-3">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.by_workcenter.map(wc => (
                  <tr key={wc.workcenter_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 text-sm">{wc.workcenter_name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${availabilityClass(wc.availability_percent)}`}>
                        {wc.availability_percent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-slate-700">{wc.total_calls}</td>
                    <td className="px-4 py-3 text-center text-sm text-red-600 font-semibold">{wc.red_calls}</td>
                    <td className="px-4 py-3 text-center text-sm text-yellow-600 font-semibold">{wc.yellow_calls}</td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">{fmtMinutes(wc.total_downtime_minutes)}</td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">{fmtMinutes(wc.mttr_minutes)}</td>
                    <td className="px-4 py-3 text-center">
                      {wc.pending_justifications > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                          {wc.pending_justifications}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => navigate(`/andon/dashboard/${wc.workcenter_id}?from=${period.from}&to=${period.to}`)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                        title="Ver detalhe"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Card de resumo ──

interface SummaryCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, icon }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-2xl font-bold text-slate-800">{value}</p>
  </div>
);
