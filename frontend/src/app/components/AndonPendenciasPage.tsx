import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Filter, RefreshCw, Clock, ChevronDown, ChevronRight, User, Wrench, Factory } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { AndonCall, PendingJustificationFilters } from '../types';
import { JustificationModal } from './JustificationModal';

interface AndonPendenciasPageProps {
  currentUser: string;
}

// Agrupa chamados por workcenter_id
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
  // Grupos expandidos — todos abertos por padrão
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const activeFilters: PendingJustificationFilters = {};
      if (filterColor) activeFilters.color = filterColor as 'RED' | 'YELLOW';
      if (filterFromDate) activeFilters.from_date = filterFromDate;
      if (filterToDate) activeFilters.to_date = filterToDate;
      const data: AndonCall[] = await api.getPendingJustification(activeFilters);
      setCalls(data);
      // Expandir todos os grupos ao carregar
      const ids = new Set(data.map(c => c.workcenter_id));
      setExpandedGroups(ids);
    } catch {
      toast.error('Erro ao carregar pendências');
    } finally {
      setLoading(false);
    }
  }, [filterColor, filterFromDate, filterToDate]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // WebSocket para atualizações em tempo real
  useEffect(() => {
    const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/devices/ws';
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'andon_justification_required') {
          fetchPending();
        } else if (msg.event === 'andon_call_justified') {
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

  const formatTime = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

  const grouped = groupByWorkcenter(calls);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pendências de Justificativa</h1>
          <p className="text-sm text-slate-500 mt-1">
            Chamados resolvidos aguardando justificativa — agrupados por mesa
          </p>
        </div>
        <button
          onClick={fetchPending}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={filterColor}
            onChange={e => setFilterColor(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">Todas as cores</option>
            <option value="RED">🔴 Vermelho</option>
            <option value="YELLOW">🟡 Amarelo</option>
          </select>
          <input
            type="date"
            value={filterFromDate}
            onChange={e => setFilterFromDate(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <input
            type="date"
            value={filterToDate}
            onChange={e => setFilterToDate(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {(filterColor || filterFromDate || filterToDate) && (
            <button
              onClick={() => { setFilterColor(''); setFilterFromDate(''); setFilterToDate(''); }}
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Carregando...
        </div>
      ) : calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium">Nenhuma pendência encontrada</p>
          <p className="text-sm mt-1">Todos os chamados foram justificados</p>
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
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    }
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${hasRed ? 'bg-red-500' : 'bg-yellow-400'}`} />
                      <span className="font-bold text-slate-900 text-base">{firstCall.workcenter_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <User className="w-3.5 h-3.5" />
                      <span>{ownerName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Wrench className="w-3.5 h-3.5" />
                      <span>{workType}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Factory className="w-3.5 h-3.5" />
                      <span className="font-mono">{productionName}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    hasRed ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {wcCalls.length} parada{wcCalls.length > 1 ? 's' : ''}
                  </span>
                </button>

                {/* Tabela de paradas da mesa */}
                {isExpanded && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Cor</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Responsável</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Tipo</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Fabricação</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Parou às</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Retomou às</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Duração</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {wcCalls.map(call => (
                          <tr
                            key={call.id}
                            className={call.color === 'RED' ? 'bg-red-50/50 hover:bg-red-50' : 'bg-yellow-50/30 hover:bg-yellow-50'}
                          >
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                                call.color === 'RED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                {call.color === 'RED' ? '🔴 Vermelho' : '🟡 Amarelo'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700 font-medium">
                              {call.owner_name || '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {call.work_type || '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                              {call.production_name || '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                              {call.created_at ? formatDate(call.created_at) : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                              {call.updated_at ? formatDate(call.updated_at) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`flex items-center gap-1 text-sm font-semibold ${
                                (call.downtime_minutes ?? 0) > 60 ? 'text-red-600' : 'text-slate-700'
                              }`}>
                                <Clock className="w-3.5 h-3.5" />
                                {formatDuration(call.downtime_minutes)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setSelectedCall(call)}
                                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
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
            );
          })}
        </div>
      )}

      {/* Modal de Justificativa */}
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
