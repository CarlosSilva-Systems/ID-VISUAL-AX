import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ArrowLeft, RefreshCw, AlertTriangle, Clock, Activity, TrendingDown } from 'lucide-react';
import { api, WorkcenterDetailResponse, RecentCall } from '../../services/api';
import { JustificationModal } from './JustificationModal';
import { AndonCall } from '../types';

// ── Helpers ──

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtMinutes(min: number | null | undefined): string {
  if (min == null) return 'N/A';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? ` ${m}min` : ''}`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function availabilityClass(pct: number): string {
  if (pct >= 90) return 'text-green-700 bg-green-50 border-green-200';
  if (pct >= 75) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

/** Converte RecentCall para AndonCall (mínimo necessário para JustificationModal) */
function toAndonCall(rc: RecentCall, wcId: number, wcName: string): AndonCall {
  return {
    id: rc.id,
    color: rc.color as 'RED' | 'YELLOW',
    category: '',
    reason: rc.reason,
    workcenter_id: wcId,
    workcenter_name: wcName,
    status: 'RESOLVED',
    created_at: rc.created_at,
    updated_at: rc.justified_at ?? rc.created_at,
    triggered_by: '',
    is_stop: false,
    downtime_minutes: rc.downtime_minutes ?? undefined,
    requires_justification: rc.requires_justification,
    justified_at: rc.justified_at ?? undefined,
    root_cause_category: rc.root_cause_category as AndonCall['root_cause_category'],
  };
}

// ── Skeleton ──

const MetricCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
    <div className="h-3 bg-slate-200 rounded w-1/2 mb-3" />
    <div className="h-8 bg-slate-200 rounded w-2/3" />
  </div>
);

// ── Componente principal ──

interface AndonWorkcenterDetailProps {
  currentUser?: string;
}

export const AndonWorkcenterDetail: React.FC<AndonWorkcenterDetailProps> = ({ currentUser = '' }) => {
  const { wcId } = useParams<{ wcId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Inicializa período a partir de query params (passados pela tela principal)
  const [period, setPeriod] = useState({
    from: searchParams.get('from') ?? daysAgo(30),
    to: searchParams.get('to') ?? today(),
  });

  const [data, setData] = useState<WorkcenterDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justifyCall, setJustifyCall] = useState<RecentCall | null>(null);

  const wcIdNum = wcId ? Number(wcId) : 0;

  const fetchData = useCallback(async () => {
    if (!wcIdNum) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getAndonDashboardWorkcenter(wcIdNum, {
        from_date: period.from,
        to_date: period.to,
      });
      setData(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dados do workcenter';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [wcIdNum, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBack = () => {
    navigate(`/andon/dashboard?from=${period.from}&to=${period.to}`);
  };

  const handleJustifySuccess = () => {
    setJustifyCall(null);
    fetchData();
  };

  const wcName = data?.metrics.workcenter_name ?? `Workcenter ${wcId}`;

  // Média de downtime por dia para linha de referência
  const avgDowntime = data
    ? data.downtime_by_day.reduce((s, d) => s + d.total_downtime_minutes, 0) /
      Math.max(data.downtime_by_day.length, 1)
    : 0;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-6 h-6 text-blue-600" />
              {wcName}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Detalhe de disponibilidade e paradas</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
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
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Erro */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-10 bg-white rounded-2xl border border-red-200 text-red-600">
          <AlertTriangle className="w-8 h-8 mb-2" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={fetchData} className="mt-3 text-sm text-blue-600 hover:underline">Tentar novamente</button>
        </div>
      )}

      {/* ── Cards de métricas ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        ) : data && (
          <>
            <div className={`rounded-2xl border p-5 ${availabilityClass(data.metrics.availability_percent)}`}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Disponibilidade</span>
              </div>
              <p className="text-3xl font-bold">{data.metrics.availability_percent.toFixed(1)}%</p>
            </div>

            <MetricCard
              label="MTTR"
              value={fmtMinutes(data.metrics.mttr_minutes)}
              icon={<Clock className="w-4 h-4 text-purple-500" />}
            />
            <MetricCard
              label="MTBF"
              value={fmtMinutes(data.metrics.mtbf_minutes)}
              icon={<Clock className="w-4 h-4 text-blue-500" />}
            />
            <button
              onClick={() => navigate('/andon/pendencias')}
              className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-left hover:bg-amber-100 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Pendências</span>
              </div>
              <p className="text-3xl font-bold text-amber-700">{data.metrics.pending_justification}</p>
            </button>
          </>
        )}
      </div>

      {/* ── Gráficos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BarChart: tempo parado por dia */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Tempo Parado por Dia (min)</h2>
          {loading ? (
            <div className="h-56 bg-slate-100 rounded-lg animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.downtime_by_day ?? []} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <RechartsTooltip formatter={(v: number) => [`${v}min`, 'Tempo parado']} labelFormatter={l => `Data: ${l}`} />
                <Bar dataKey="total_downtime_minutes" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Tempo parado" />
                {avgDowntime > 0 && (
                  <ReferenceLine
                    y={avgDowntime}
                    stroke="#f59e0b"
                    strokeDasharray="6 3"
                    label={{ value: `Média: ${avgDowntime.toFixed(0)}min`, position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* BarChart horizontal: top causas raiz */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Top Causas Raiz</h2>
          {loading ? (
            <div className="h-56 bg-slate-100 rounded-lg animate-pulse" />
          ) : !data || data.calls_by_root_cause.length === 0 ? (
            <div className="flex items-center justify-center h-56 text-slate-400 text-sm">Sem dados de causas raiz</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                layout="vertical"
                data={[...data.calls_by_root_cause].sort((a, b) => b.total_downtime_minutes - a.total_downtime_minutes)}
                margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={90} />
                <RechartsTooltip formatter={(v: number) => [`${v}min`, 'Tempo parado']} />
                <Bar dataKey="total_downtime_minutes" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Tempo parado" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Tabela de chamados recentes ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Chamados Recentes</h2>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !data || data.recent_calls.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
            Nenhum chamado encontrado no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Data/Hora</th>
                  <th className="text-center px-4 py-3">Cor</th>
                  <th className="text-left px-4 py-3">Motivo</th>
                  <th className="text-center px-4 py-3">Tempo Parado</th>
                  <th className="text-left px-4 py-3">Causa Raiz</th>
                  <th className="text-center px-4 py-3">Justificado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent_calls.map(call => {
                  const isPending = call.requires_justification && !call.justified_at;
                  return (
                    <tr key={call.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-600 font-mono whitespace-nowrap">
                        {fmtDateTime(call.created_at)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                          call.color === 'RED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {call.color === 'RED' ? '🔴' : '🟡'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate">{call.reason}</td>
                      <td className="px-4 py-3 text-center text-sm text-slate-600">
                        {fmtMinutes(call.downtime_minutes)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {call.root_cause_category ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isPending ? (
                          <button
                            onClick={() => setJustifyCall(call)}
                            className="text-amber-500 hover:text-amber-700 transition-colors"
                            title="Justificar pendência"
                          >
                            ⚠️
                          </button>
                        ) : call.justified_at ? (
                          <span className="text-green-600 text-xs font-semibold">✓</span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de justificativa */}
      {justifyCall && (
        <JustificationModal
          call={toAndonCall(justifyCall, wcIdNum, wcName)}
          currentUser={currentUser}
          onClose={() => setJustifyCall(null)}
          onSuccess={handleJustifySuccess}
        />
      )}
    </div>
  );
};

// ── Card de métrica simples ──

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, icon }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-5">
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-3xl font-bold text-slate-800">{value}</p>
  </div>
);
