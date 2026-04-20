import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Filter, RefreshCw, Clock,
  ChevronDown, ChevronRight, User, Wrench, Factory, CheckCircle2,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { AndonCall, PendingJustificationFilters } from '../types';
import { JustificationModal } from './JustificationModal';
import { EmptyState } from './EmptyState';
import { SkeletonListItem } from './SkeletonLoader';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { cn } from '@/lib/utils';

interface AndonPendenciasPageProps {
  currentUser: string;
}

function groupByWorkcenter(calls: AndonCall[]): Map<number, AndonCall[]> {
  const map = new Map<number, AndonCall[]>();
  for (const call of calls) {
    const group = map.get(call.workcenter_id) ?? [];
    group.push(call);
    map.set(call.workcenter_id, group);
  }
  return map;
}

export const AndonPendenciasPage: React.FC<AndonPendenciasPageProps> = ({ currentUser }) => {
  const [calls, setCalls] = useState<AndonCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<AndonCall | null>(null);
  const [filterColor, setFilterColor] = useState<string>('');
  const [filterFromDate, setFilterFromDate] = useState<string>('');
  const [filterToDate, setFilterToDate] = useState<string>('');
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const bp = useBreakpoint();
  const isBelowLg = bp === 'mobile' || bp === 'sm' || bp === 'md';

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const activeFilters: PendingJustificationFilters = {};
      if (filterColor) activeFilters.color = filterColor as 'RED' | 'YELLOW';
      if (filterFromDate) activeFilters.from_date = filterFromDate;
      if (filterToDate) activeFilters.to_date = filterToDate;
      const data: AndonCall[] = await api.getPendingJustification(activeFilters);
      setCalls(data);
      const ids = new Set(data.map(c => c.workcenter_id));
      setExpandedGroups(ids);
    } catch {
      toast.error('Erro ao carregar pendências');
    } finally {
      setLoading(false);
    }
  }, [filterColor, filterFromDate, filterToDate]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  useEffect(() => {
    const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/devices/ws';
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'andon_justification_required') fetchPending();
        else if (msg.event === 'andon_call_justified') {
          setCalls(prev => prev.filter(c => c.id !== msg.data.call_id));
        }
      } catch { /* ignore */ }
    };
    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, [fetchPending]);

  const handleJustifySuccess = (callId: number) => {
    setCalls(prev => prev.filter(c => c.id !== callId));
    setSelectedCall(null);
  };

  const toggleGroup = (wcId: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(wcId)) next.delete(wcId);
      else next.add(wcId);
      return next;
    });
  };

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (minutes?: number) => {
    if (minutes == null) return '—';
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m > 0 ? ` ${m}min` : ''}`;
  };

  const hasActiveFilters = filterColor || filterFromDate || filterToDate;
  const grouped = groupByWorkcenter(calls);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header — flex-col em mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900">
            Pendências de Justificativa
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Chamados resolvidos aguardando justificativa — agrupados por mesa
          </p>
        </div>
        <button
          onClick={fetchPending}
          className="flex items-center justify-center gap-2 px-4 min-h-[44px] bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors w-full sm:w-auto"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Filtros — colapsáveis em mobile */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Botão toggle de filtros (mobile) */}
        <button
          onClick={() => setIsFiltersOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 sm:hidden"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Filtros</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-blue-500" />
            )}
          </div>
          {isFiltersOpen
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />
          }
        </button>

        {/* Conteúdo dos filtros — sempre visível em sm+, colapsável em mobile */}
        <div className={cn(
          'p-4',
          isBelowLg && !isFiltersOpen ? 'hidden' : 'block'
        )}>
          <div className="hidden sm:flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Filtros</span>
          </div>
          {/* Filtros em coluna em mobile, linha em desktop */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <select
              value={filterColor}
              onChange={e => setFilterColor(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 min-h-[44px] bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Todas as cores</option>
              <option value="RED">🔴 Vermelho</option>
              <option value="YELLOW">🟡 Amarelo</option>
            </select>
            <input
              type="date"
              value={filterFromDate}
              onChange={e => setFilterFromDate(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 min-h-[44px] bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <input
              type="date"
              value={filterToDate}
              onChange={e => setFilterToDate(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 min-h-[44px] bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {hasActiveFilters && (
              <button
                onClick={() => { setFilterColor(''); setFilterFromDate(''); setFilterToDate(''); }}
                className="w-full sm:w-auto px-3 py-2 min-h-[44px] text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {[...Array(5)].map((_, i) => <SkeletonListItem key={i} />)}
          </div>
        </div>
      ) : calls.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200">
          <EmptyState
            icon={CheckCircle2}
            title="Tudo em dia"
            description="Nenhuma pendência de justificativa no momento."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([wcId, wcCalls]) => {
            const isExpanded = expandedGroups.has(wcId);
            const firstCall = wcCalls[0];
            const hasRed = wcCalls.some(c => c.color === 'RED');
            const ownerName = firstCall.owner_name || '—';
            const workType = firstCall.work_type || '—';
            const productionName = firstCall.production_name || '—';

            return (
              <div key={wcId} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {/* Cabeçalho do grupo */}
                <button
                  onClick={() => toggleGroup(wcId)}
                  className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-slate-50 active:bg-slate-100 transition-colors min-h-[44px]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    }
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${hasRed ? 'bg-red-500' : 'bg-yellow-400'}`} />
                    <span className="font-bold text-slate-900 text-sm sm:text-base truncate">
                      {ownerName !== '—' ? ownerName : firstCall.workcenter_name}
                    </span>
                    {ownerName !== '—' && (
                      <span className="hidden sm:inline text-xs text-slate-400 font-medium truncate">
                        {firstCall.workcenter_name}
                      </span>
                    )}
                    {/* Detalhes — ocultos em mobile, visíveis em sm+ */}
                    <div className="hidden sm:flex items-center gap-3 text-sm text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />{ownerName}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5" />{workType}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Factory className="w-3.5 h-3.5" />
                        <span className="font-mono text-xs">{productionName}</span>
                      </span>
                    </div>
                  </div>
                  <span className={cn(
                    'text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0',
                    hasRed ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  )}>
                    {wcCalls.length} parada{wcCalls.length > 1 ? 's' : ''}
                  </span>
                </button>

                {/* Conteúdo expandido */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    {isBelowLg ? (
                      /* ── Card View (mobile/tablet < lg) ── */
                      <div className="p-3 space-y-3">
                        {wcCalls.map(call => (
                          <div
                            key={call.id}
                            className={cn(
                              'rounded-xl border p-3 flex flex-col gap-2',
                              call.color === 'RED'
                                ? 'border-red-200 bg-red-50/40 border-l-4 border-l-red-500'
                                : 'border-yellow-200 bg-yellow-50/30 border-l-4 border-l-yellow-400'
                            )}
                          >
                            {/* Cor + duração */}
                            <div className="flex items-center justify-between">
                              <span className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
                                call.color === 'RED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                              )}>
                                {call.color === 'RED' ? '🔴 Vermelho' : '🟡 Amarelo'}
                              </span>
                              <span className={cn(
                                'flex items-center gap-1 text-sm font-semibold',
                                (call.downtime_minutes ?? 0) > 60 ? 'text-red-600' : 'text-slate-700'
                              )}>
                                <Clock className="w-3.5 h-3.5" />
                                {formatDuration(call.downtime_minutes)}
                              </span>
                            </div>
                            {/* Responsável + tipo */}
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                              <div>
                                <p className="text-slate-400 font-medium">Responsável</p>
                                <p className="font-medium">{call.owner_name || '—'}</p>
                              </div>
                              <div>
                                <p className="text-slate-400 font-medium">Tipo</p>
                                <p>{call.work_type || '—'}</p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-slate-400 font-medium">Fabricação</p>
                                <p className="font-mono">{call.production_name || '—'}</p>
                              </div>
                            </div>
                            {/* Botão Justificar */}
                            <button
                              onClick={() => setSelectedCall(call)}
                              className="w-full min-h-[44px] px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
                            >
                              Justificar
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* ── Table View (desktop >= lg) ── */
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-slate-50">
                              {['Cor', 'Responsável', 'Tipo', 'Fabricação', 'Parou às', 'Retomou às', 'Duração', 'Ações'].map(h => (
                                <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {wcCalls.map(call => (
                              <tr
                                key={call.id}
                                className={call.color === 'RED' ? 'bg-red-50/50 hover:bg-red-50' : 'bg-yellow-50/30 hover:bg-yellow-50'}
                              >
                                <td className="px-4 py-3">
                                  <span className={cn(
                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
                                    call.color === 'RED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                  )}>
                                    {call.color === 'RED' ? '🔴 Vermelho' : '🟡 Amarelo'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-700 font-medium">{call.owner_name || '—'}</td>
                                <td className="px-4 py-3 text-sm text-slate-600">{call.work_type || '—'}</td>
                                <td className="px-4 py-3 text-sm text-slate-600 font-mono">{call.production_name || '—'}</td>
                                <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                                  {call.created_at ? formatDate(call.created_at) : '—'}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                                  {call.updated_at ? formatDate(call.updated_at) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={cn(
                                    'flex items-center gap-1 text-sm font-semibold',
                                    (call.downtime_minutes ?? 0) > 60 ? 'text-red-600' : 'text-slate-700'
                                  )}>
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatDuration(call.downtime_minutes)}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => setSelectedCall(call)}
                                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
                                  >
                                    Justificar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedCall && (
        <JustificationModal
          call={selectedCall}
          currentUser={currentUser}
          onClose={() => setSelectedCall(null)}
          onSuccess={handleJustifySuccess}
        />
      )}
    </div>
  );
};
