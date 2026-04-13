import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import {
  RefreshCw, Clock, CheckCircle2, AlertTriangle, Package,
  TrendingUp, Layers, Timer, BarChart2, List,
} from 'lucide-react';
import { api } from '../../services/api';
import { cn } from '@/lib/utils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtMin(min: number | null | undefined): string {
  if (min == null || isNaN(min)) return '—';
  const r = Math.round(min);
  if (r === 0) return '0min';
  if (r < 60) return `${r}min`;
  const h = Math.floor(r / 60), m = r % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}min`;
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return mm > 0 ? `${hh}h ${mm}min` : `${hh}h`;
}

const STATUS_COLORS: Record<string, string> = {
  'Nova': '#3b82f6',
  'Triagem': '#f59e0b',
  'Em Lote': '#8b5cf6',
  'Em Progresso': '#06b6d4',
  'Bloqueada': '#ef4444',
  'Concluída': '#10b981',
  'Entregue': '#059669',
  'Cancelada': '#94a3b8',
};

const TIPO_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];

const PRIORITY_LABEL: Record<string, string> = {
  urgente: '🔴 Urgente',
  normal: '🟢 Normal',
};

// ── Skeletons ─────────────────────────────────────────────────────────────────

const KpiSkeleton = () => (
  <div className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse space-y-3">
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 bg-slate-100 rounded-xl" />
      <div className="h-3 bg-slate-100 rounded w-28" />
    </div>
    <div className="h-8 bg-slate-100 rounded w-2/3" />
    <div className="h-2 bg-slate-100 rounded w-full" />
  </div>
);

const ChartSkeleton = () => (
  <div className="animate-pulse h-52 flex items-end gap-2 px-2">
    {[50, 80, 60, 90, 40, 75, 55, 85, 45, 70].map((h, i) => (
      <div key={i} className="flex-1 bg-slate-100 rounded-t-md" style={{ height: `${h}%` }} />
    ))}
  </div>
);

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  badge?: { text: string; color: string };
}

const KpiCard: React.FC<KpiProps> = ({ label, value, sub, icon, iconBg, badge }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', iconBg)}>
        {icon}
      </div>
      {badge && (
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', badge.color)}>
          {badge.text}
        </span>
      )}
    </div>
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-black text-slate-900 leading-tight truncate" title={value}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Kpis {
  total_solicitadas: number;
  total_concluidas: number;
  total_em_aberto: number;
  total_bloqueadas: number;
  taxa_conclusao_pct: number;
  taxa_bloqueio_pct: number;
  tempo_medio_fila_min: number | null;
  tempo_medio_producao_min: number | null;
  lead_time_medio_min: number | null;
}

interface VolumeDia { date: string; solicitadas: number; concluidas: number; }
interface TipoQuadro { tipo: string; total: number; pct: number; }
interface StatusDist { status: string; total: number; pct: number; }
interface LeadTimeTend { date: string; lead_time_medio_min: number; }
interface FilaItem {
  id: string; mo_number: string; status: string;
  package_code: string; priority: string; aging_horas: number;
  solicitado_em: string | null;
}
interface LotesStats {
  total_lotes: number; lotes_finalizados: number;
  lotes_em_andamento: number; tempo_medio_lote_min: number | null;
}

// ── Componente principal ──────────────────────────────────────────────────────

export const IDVisualAnalytics: React.FC = () => {
  const [period, setPeriod] = useState({ from: daysAgo(30), to: today() });
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [volume, setVolume] = useState<VolumeDia[]>([]);
  const [tipos, setTipos] = useState<TipoQuadro[]>([]);
  const [statusDist, setStatusDist] = useState<StatusDist[]>([]);
  const [leadTend, setLeadTend] = useState<LeadTimeTend[]>([]);
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [lotes, setLotes] = useState<LotesStats | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const q = `from_date=${period.from}&to_date=${period.to}`;
    try {
      const [k, v, t, s, lt, f, l] = await Promise.all([
        api.get(`/id-visual/analytics/kpis?${q}`),
        api.get(`/id-visual/analytics/volume-diario?${q}`),
        api.get(`/id-visual/analytics/por-tipo-quadro?${q}`),
        api.get(`/id-visual/analytics/por-status?${q}`),
        api.get(`/id-visual/analytics/lead-time-tendencia?${q}`),
        api.get('/id-visual/analytics/fila-atual'),
        api.get(`/id-visual/analytics/lotes?${q}`),
      ]);
      setKpis(k); setVolume(v); setTipos(t); setStatusDist(s);
      setLeadTend(lt); setFila(f); setLotes(l);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar analytics');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="space-y-6 p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">

      {/* ── Cabeçalho ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            Analytics ID Visual
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Métricas operacionais do fluxo de produção de identificações
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 min-h-[44px] bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors w-full sm:w-auto disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Data início</label>
            <input type="date" value={period.from} max={period.to}
              onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))}
              className="px-3 py-2 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Data fim</label>
            <input type="date" value={period.to} min={period.from} max={today()}
              onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))}
              className="px-3 py-2 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[{ label: '7d', days: 7 }, { label: '30d', days: 30 }, { label: '90d', days: 90 }].map(({ label, days }) => (
              <button key={label}
                onClick={() => setPeriod({ from: daysAgo(days), to: today() })}
                className={cn(
                  'px-3 min-h-[44px] rounded-xl text-xs font-bold border transition-colors',
                  period.from === daysAgo(days) && period.to === today()
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'
                )}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      ) : kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            label="Solicitadas"
            value={String(kpis.total_solicitadas)}
            sub={`${kpis.total_concluidas} concluídas`}
            icon={<Package className="w-4 h-4 text-blue-600" />}
            iconBg="bg-blue-100"
            badge={{ text: `${kpis.taxa_conclusao_pct}% concluídas`, color: 'bg-blue-100 text-blue-700' }}
          />
          <KpiCard
            label="Em Aberto"
            value={String(kpis.total_em_aberto)}
            sub="aguardando produção"
            icon={<Layers className="w-4 h-4 text-amber-600" />}
            iconBg="bg-amber-100"
          />
          <KpiCard
            label="Bloqueadas"
            value={String(kpis.total_bloqueadas)}
            sub={`${kpis.taxa_bloqueio_pct}% do total`}
            icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
            iconBg="bg-red-100"
            badge={kpis.total_bloqueadas > 0 ? { text: 'Atenção', color: 'bg-red-100 text-red-600' } : undefined}
          />
          <KpiCard
            label="Tempo na Fila"
            value={fmtMin(kpis.tempo_medio_fila_min)}
            sub="solicitado → iniciado"
            icon={<Clock className="w-4 h-4 text-purple-600" />}
            iconBg="bg-purple-100"
          />
          <KpiCard
            label="Lead Time Médio"
            value={fmtMin(kpis.lead_time_medio_min)}
            sub="solicitado → entregue"
            icon={<Timer className="w-4 h-4 text-emerald-600" />}
            iconBg="bg-emerald-100"
          />
        </div>
      )}

      {/* ── Lotes KPIs ── */}
      {!loading && lotes && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Lotes Criados" value={String(lotes.total_lotes)} sub="no período"
            icon={<Layers className="w-4 h-4 text-blue-600" />} iconBg="bg-blue-100" />
          <KpiCard label="Lotes Finalizados" value={String(lotes.lotes_finalizados)} sub="concluídos"
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} iconBg="bg-emerald-100" />
          <KpiCard label="Em Andamento" value={String(lotes.lotes_em_andamento)} sub="lotes ativos"
            icon={<TrendingUp className="w-4 h-4 text-amber-600" />} iconBg="bg-amber-100" />
          <KpiCard label="Tempo Médio Lote" value={fmtMin(lotes.tempo_medio_lote_min)} sub="criação → finalização"
            icon={<Timer className="w-4 h-4 text-purple-600" />} iconBg="bg-purple-100" />
        </div>
      )}

      {/* ── Gráficos linha 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Volume diário */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-700">Volume Diário</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Solicitadas</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Concluídas</span>
            </div>
          </div>
          {loading ? <ChartSkeleton /> : volume.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-slate-400 text-sm">Sem dados no período</div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volume} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    labelFormatter={l => `📅 ${l}`} />
                  <Bar dataKey="solicitadas" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Solicitadas" />
                  <Bar dataKey="concluidas" fill="#10b981" radius={[4, 4, 0, 0]} name="Concluídas" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Lead time tendência */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Tendência do Lead Time</h2>
          {loading ? <ChartSkeleton /> : leadTend.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-slate-400 text-sm">Sem dados de lead time no período</div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={leadTend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                    tickFormatter={v => fmtMin(v)} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v: number) => [fmtMin(v), 'Lead Time Médio']}
                    labelFormatter={l => `📅 ${l}`} />
                  <Line type="monotone" dataKey="lead_time_medio_min" stroke="#8b5cf6" strokeWidth={2}
                    dot={{ r: 3, fill: '#8b5cf6' }} activeDot={{ r: 5 }} name="Lead Time" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Gráficos linha 2 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Por tipo de quadro */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Por Tipo de Quadro</h2>
          {loading ? <ChartSkeleton /> : tipos.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Sem dados</div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="h-44 w-full sm:w-44 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={tipos} dataKey="total" nameKey="tipo" cx="50%" cy="50%"
                      innerRadius={45} outerRadius={70} paddingAngle={3}>
                      {tipos.map((_, i) => <Cell key={i} fill={TIPO_COLORS[i % TIPO_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(v: number, _: string, p: any) => [`${v} (${p.payload.pct}%)`, p.payload.tipo]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2 w-full">
                {tipos.map((t, i) => (
                  <div key={t.tipo} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: TIPO_COLORS[i % TIPO_COLORS.length] }} />
                    <span className="text-xs text-slate-600 flex-1 truncate capitalize">{t.tipo}</span>
                    <span className="text-xs font-bold text-slate-700">{t.total}</span>
                    <span className="text-[10px] text-slate-400 w-10 text-right">{t.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Por status */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Distribuição por Status</h2>
          {loading ? <ChartSkeleton /> : statusDist.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Sem dados</div>
          ) : (
            <div className="space-y-2.5">
              {statusDist.map(s => (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-28 flex-shrink-0">{s.status}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${s.pct}%`,
                        backgroundColor: STATUS_COLORS[s.status] || '#94a3b8',
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-700 w-8 text-right">{s.total}</span>
                  <span className="text-[10px] text-slate-400 w-10 text-right">{s.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Fila atual ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <List className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-700">Fila Atual (IDs em Aberto)</h2>
          </div>
          <span className="text-xs text-slate-400">{fila.length} item{fila.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : fila.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <CheckCircle2 className="w-8 h-8 opacity-30" />
            <p className="text-sm">Fila vazia — nenhuma ID em aberto</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <th className="text-left px-5 py-3">Fabricação</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">Prioridade</th>
                  <th className="text-right px-5 py-3">Aguardando</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {fila.map(item => {
                  const aging = item.aging_horas;
                  const agingColor = aging > 24 ? 'text-red-600 font-bold' : aging > 8 ? 'text-amber-600 font-semibold' : 'text-slate-600';
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-800 text-sm">{item.mo_number}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{
                            backgroundColor: (STATUS_COLORS[item.status] || '#94a3b8') + '20',
                            color: STATUS_COLORS[item.status] || '#94a3b8',
                          }}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 capitalize">{item.package_code}</td>
                      <td className="px-4 py-3 text-xs">
                        {PRIORITY_LABEL[item.priority] || item.priority}
                      </td>
                      <td className={cn('px-5 py-3 text-right text-sm whitespace-nowrap', agingColor)}>
                        {fmtHours(aging)}
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
