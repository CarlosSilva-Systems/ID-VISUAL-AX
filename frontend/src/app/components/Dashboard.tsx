import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Filter,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Package,
  Plus,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  FileText,
  Play,
  CheckCircle,
  Trash2,
  X,
  MonitorPlay,
} from 'lucide-react';
import { Fabrication, PackageType } from '../types';
import { ModalPacote } from './ModalPacote';
import { EmptyState } from './EmptyState';
import { useDocViewer } from '../../components/DocViewerModal';import { SkeletonKPICard, SkeletonListItem } from './SkeletonLoader';
import { FilterBar, type FilterOption } from '@/app/components/FilterBar';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { clsx, type ClassValue } from 'clsx';
import { formatObraDisplayName } from '../../lib/utils';
import { twMerge } from 'tailwind-merge';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { useData } from '../contexts/DataContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DashboardProps {
  onCreateBatch: (batchId: string) => void;
}

function PriorityChip({ priority }: { priority: string }) {
  const styles = {
    Urgente: 'bg-rose-100 text-rose-700',
    Alta: 'bg-amber-100 text-amber-700',
    Normal: 'bg-slate-100 text-slate-600',
  };
  return <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", styles[priority as keyof typeof styles])}>{priority}</span>;
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Nova:              'text-blue-500',
    Triagem:           'text-amber-500',
    'Em Lote':         'text-indigo-500',
    'Em Progresso':    'text-cyan-600',
    Bloqueada:         'text-rose-500',
    'Concluída':       'text-emerald-500',
    Entregue:          'text-green-600',
    Cancelada:         'text-slate-400',
    'Sem Solicitação': 'text-slate-400',
    Rascunho:          'text-slate-400',
  };
  const dotColors: Record<string, string> = {
    Nova:              'bg-blue-500 animate-pulse',
    Triagem:           'bg-amber-500',
    'Em Lote':         'bg-indigo-500',
    'Em Progresso':    'bg-cyan-600',
    Bloqueada:         'bg-rose-500',
    'Concluída':       'bg-emerald-500',
    Entregue:          'bg-green-600',
    Cancelada:         'bg-slate-400',
    'Sem Solicitação': 'bg-slate-300',
    Rascunho:          'bg-slate-300',
  };
  const textStyle = styles[status] || 'text-slate-400';
  const dotStyle = dotColors[status] || 'bg-slate-300';
  return (
    <span className={cn("flex items-center gap-1.5 text-xs font-bold", textStyle)}>
      <div className={cn("w-1.5 h-1.5 rounded-full", dotStyle)} />
      {status}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string, value: string, icon: any, color: 'blue' | 'amber' | 'green' | 'red' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 ring-blue-500/10',
    amber: 'bg-amber-50 text-amber-600 ring-amber-500/10',
    green: 'bg-emerald-50 text-emerald-600 ring-emerald-500/10',
    red: 'bg-rose-50 text-rose-600 ring-rose-500/10',
  };
  return (
    <div className={cn("p-4 rounded-xl border border-gray-200 bg-white flex items-center gap-4 ring-1 shadow-sm", colors[color])}>
      <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center", colors[color])}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function DashboardRow({ item, isSelected, onToggle, onViewDocs, isMobile, isDocsLoading }: {
  item: Fabrication;
  isSelected: boolean;
  onToggle: () => void;
  onViewDocs: () => void;
  isMobile: boolean;
  isDocsLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // Card compacto para mobile (< md / 768px)
  if (isMobile) {
    return (
      <div
        className={cn(
          "p-3 transition-all active:bg-blue-50/40",
          isSelected && "bg-blue-50/60 ring-1 ring-inset ring-blue-500/30"
        )}
      >
        {/* Linha principal: status + MO + checkbox */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <StatusChip status={item.status} />
            <span className="font-bold text-slate-900 text-sm">{item.mo_number}</span>
            {item.source === 'producao' ? (
              <span className="px-1.5 py-0.5 bg-purple-600 text-white rounded text-[9px] font-black tracking-widest">
                PROD
              </span>
            ) : (
              <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[9px] font-black tracking-widest">
                ODOO
              </span>
            )}
            <PriorityChip priority={item.priority} />
          </div>
          {/* Checkbox com área de toque 44×44px */}
          <button
            onClick={onToggle}
            className={cn(
              "min-w-[44px] min-h-[44px] flex items-center justify-center rounded flex-shrink-0",
              isSelected ? "text-blue-600" : "text-slate-300"
            )}
            aria-label={isSelected ? 'Desselecionar' : 'Selecionar'}
          >
            <div className={cn(
              "w-6 h-6 rounded border-2 flex items-center justify-center transition-all",
              isSelected
                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                : "bg-white border-gray-300"
            )}>
              {isSelected && <CheckCircle2 size={16} />}
            </div>
          </button>
        </div>

        {/* Obra */}
        <div className="text-sm text-slate-700 truncate mb-1">
          {formatObraDisplayName(item.obra)}
        </div>

        {/* Data prevista + SLA */}
        <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
          <span className="flex items-center gap-1 font-medium text-slate-600">
            <Calendar size={11} /> {item.date_start}
          </span>
          {item.sla === 'Vencida' && item.status !== 'Concluída' && (
            <span className="flex items-center gap-1 font-black text-rose-600 animate-pulse">
              <Clock size={11} /> ATRASADA
            </span>
          )}
          {item.sla === 'Vence Hoje' && item.status !== 'Concluída' && (
            <span className="flex items-center gap-1 font-black text-amber-600">
              <Clock size={11} /> VENCE HOJE
            </span>
          )}
        </div>

        {/* Campos secundários colapsáveis */}
        {expanded && (
          <div className="text-xs text-slate-500 space-y-1 mb-2 pl-1 border-l-2 border-slate-100">
            <div className="flex items-center gap-1">
              <Package size={11} /> Qtd: {item.product_qty}
            </div>
            {item.packageType && (
              <div>
                <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold">
                  {item.packageType}
                </span>
              </div>
            )}
            {item.source === 'producao' && item.production_requester && (
              <div>Solicitante: {item.production_requester}</div>
            )}
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onViewDocs(); }}
            disabled={isDocsLoading}
            className="flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 active:bg-blue-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isDocsLoading
              ? <Loader2 size={13} className="animate-spin" />
              : <FileText size={13} />
            }
            Docs
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 px-3 min-h-[44px] text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
          >
            {expanded ? 'ver menos' : 'ver mais'}
          </button>
        </div>
      </div>
    );
  }

  // Layout desktop (>= md)
  return (
    <div
      className={cn(
        "p-4 hover:bg-blue-50/30 active:bg-blue-50/40 transition-all flex items-center gap-4 cursor-default",
        isSelected && "bg-blue-50/60 ring-1 ring-inset ring-blue-500/30"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <span className="font-bold text-slate-900">{item.mo_number}</span>

          {/* Origin Badge */}
          {item.source === 'producao' ? (
            <div className="group relative">
              <span className="px-2 py-0.5 bg-purple-600 text-white rounded text-[9px] font-black tracking-widest cursor-help shadow-sm">
                PRODUÇÃO
              </span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl border border-slate-700">
                Solicitante: {item.production_requester}
              </div>
            </div>
          ) : (
            <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[9px] font-black tracking-widest shadow-sm">
              ODOO
            </span>
          )}

          <PriorityChip priority={item.priority} />
          <StatusChip status={item.status} />

          {item.packageType && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold tracking-wider">
              {item.packageType}
            </span>
          )}
        </div>
        <div className="text-sm font-medium text-slate-700 truncate mb-1">
          Obra: {formatObraDisplayName(item.obra)}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Package size={12} /> Qtd: {item.product_qty}</span>
          <span className="flex items-center gap-1 font-bold text-slate-600"><Calendar size={12} /> {item.date_start}</span>
          {item.sla === 'Vencida' && item.status !== 'Concluída' && (
            <span className="flex items-center gap-1 font-black text-rose-600 animate-pulse">
              <Clock size={12} /> ATRASADA
            </span>
          )}
          {item.sla === 'Vence Hoje' && item.status !== 'Concluída' && (
            <span className="flex items-center gap-1 font-black text-amber-600">
              <Clock size={12} /> VENCE HOJE
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 items-end min-w-[120px]">
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onViewDocs(); }}
            disabled={isDocsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 active:bg-blue-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Ver documentos"
          >
            {isDocsLoading
              ? <Loader2 size={14} className="animate-spin" />
              : <FileText size={14} />
            }
            Docs
          </button>
          <button
            onClick={onToggle}
            className={cn(
              "w-6 h-6 rounded border-2 flex items-center justify-center transition-all",
              isSelected
                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                : "bg-white border-gray-300 hover:border-blue-400"
            )}
          >
            {isSelected && <CheckCircle2 size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ onCreateBatch }: DashboardProps) {
  const { odooMOs, loadingMOs, refreshMOs, syncStatus } = useData();
  const [loadingBatches, setLoadingBatches] = useState(true);
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'mobile' || breakpoint === 'sm';

  const { openDocs, isLoading: docsLoading, DocViewer } = useDocViewer();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'Todas' | 'Hoje' | 'Esta Semana' | 'Atrasadas' | 'Bloqueadas'>('Todas');
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToConfigure, setItemToConfigure] = useState<Fabrication | null>(null);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);

  // Active batches state
  interface ActiveBatch {
    batch_id: string;
    batch_name: string;
    items_count: number;
    progress_pct: number;
    is_complete: boolean;
    created_at: string;
    last_activity_at: string;
  }
  const [activeBatches, setActiveBatches] = useState<ActiveBatch[]>([]);
  const [activeBatchesError, setActiveBatchesError] = useState<string | null>(null);

  // Batch action confirmation state
  const [confirmAction, setConfirmAction] = useState<{ batchId: string; type: 'finalize' | 'delete' } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadActiveBatches();
    refreshMOs();
  }, [refreshMOs]);

  useEffect(() => {
    loadActiveBatches();
  }, [syncStatus]);

  const loadActiveBatches = async () => {
    setLoadingBatches(true);
    try {
      const batchesData = await api.getActiveBatches();
      setActiveBatches(batchesData);
      setActiveBatchesError(null);
    } catch (err: any) {
      console.error('Active batches load failed:', err);
      setActiveBatchesError('Não foi possível carregar lotes em andamento');
    } finally {
      setLoadingBatches(false);
    }
  };

  const filteredItems = useMemo(() => {
    const items = odooMOs;
    return items.filter(item => {
      const searchLower = search.toLowerCase();
      const matchesSearch = (item.mo_number || '').toLowerCase().includes(searchLower) ||
        (item.obra || '').toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      if (filter === 'Atrasadas') return item.sla === 'Vencida' && item.status !== 'Concluída';
      if (filter === 'Bloqueadas') return item.status === 'Bloqueada';
      return true;
    });
  }, [odooMOs, search, filter]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleFinalizeBatch = async (batchId: string) => {
    setActionLoading(batchId);
    try {
      await api.finalizeBatch(batchId);
      toast.success('Lote finalizado com sucesso!');
      setActiveBatches(prev => prev.filter(b => b.batch_id !== batchId));
    } catch (err: any) {
      if (err.data?.pendencies) {
        toast.error(`Não é possível finalizar: ${err.data.pendencies.length} pendência(s).`);
      } else {
        toast.error(`Erro ao finalizar: ${err.message}`);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelBatch = async (batchId: string) => {
    setActionLoading(batchId);
    try {
      await api.cancelBatch(batchId);
      toast.success('Lote apagado com sucesso.');
      setActiveBatches(prev => prev.filter(b => b.batch_id !== batchId));
    } catch (err: any) {
      toast.error(`Erro ao apagar lote: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateBatch = async () => {
    if (selectedIds.size === 0) return;
    setIsCreatingBatch(true);
    try {
      const ids = Array.from(selectedIds).map(id => parseInt(id));
      const res = await api.createBatch(ids);
      toast.success(`Lote criado com sucesso! (${res.requests_count} itens)`);
      onCreateBatch(res.batch_id);
    } catch (err: any) {
      toast.error(`Erro ao criar lote: ${err.message}`);
    } finally {
      setIsCreatingBatch(false);
    }
  };

  if (loadingMOs && odooMOs.length === 0) {
    return (
      <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 auto-rows-fr gap-4">
          {[...Array(4)].map((_, i) => <SkeletonKPICard key={i} />)}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="h-6 w-48 animate-shimmer rounded-md" />
          </div>
          <div className="divide-y divide-slate-100">
            {[...Array(8)].map((_, i) => <SkeletonListItem key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Stats Section */}
      <div className="grid grid-cols-2 sm:grid-cols-4 auto-rows-fr gap-4">
        <StatCard label="Total Filas" value={odooMOs.length.toString()} icon={Package} color="blue" />
        <StatCard label="Selecionados" value={selectedIds.size.toString()} icon={CheckCircle2} color="amber" />
        <StatCard
          label="Atrasadas"
          value={odooMOs.filter(i => i.sla === 'Vencida' && i.status !== 'Concluída').length.toString()}
          icon={Clock}
          color="red"
        />
        <StatCard
          label="Bloqueadas"
          value={odooMOs.filter(i => i.status === 'Bloqueada').length.toString()}
          icon={AlertTriangle}
          color="red"
        />
      </div>

      {/* Active Batches Section */}
      {activeBatches.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <Play size={18} className="text-blue-600" />
              <h2 className="text-lg font-bold text-slate-800">Lotes em Andamento</h2>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">{activeBatches.length}</span>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeBatches.map((batch) => (
                <div key={batch.batch_id} className="p-5 border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all group bg-white">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">{batch.batch_name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{batch.items_count} fabricação(ões)</p>
                    </div>
                  </div>
                  {batch.is_complete ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg mb-3">
                      <CheckCircle size={16} className="text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-700">Pronto para finalizar</span>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${batch.progress_pct}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={() => onCreateBatch(batch.batch_id)} className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700">Retomar</button>
                    <button onClick={() => setConfirmAction({ batchId: batch.batch_id, type: 'finalize' })} className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><CheckCircle size={14} /></button>
                    <button onClick={() => setConfirmAction({ batchId: batch.batch_id, type: 'delete' })} className="px-3 py-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Block: Fila de IDs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white sticky top-0 z-20">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Fila de Produção</h2>
            <p className="text-sm text-slate-500">Selecione as MOs para iniciar o lote de trabalho.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-600">
              Selecionadas: <span className="text-blue-600 font-bold">{selectedIds.size}</span>
            </div>
            <button
              onClick={handleCreateBatch}
              disabled={selectedIds.size === 0 || isCreatingBatch}
              className={cn(
                "w-full sm:w-auto min-h-[44px] px-6 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-md",
                selectedIds.size > 0 && !isCreatingBatch ? "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800" : "bg-slate-200 text-slate-400"
              )}
            >
              Criar Lote <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="px-6 py-4 border-b border-gray-100 bg-slate-50 flex flex-col md:flex-row items-center justify-between gap-4">
          <FilterBar<'Todas' | 'Hoje' | 'Esta Semana' | 'Atrasadas' | 'Bloqueadas'>
            options={[
              { value: 'Todas', label: 'Todas' },
              { value: 'Hoje', label: 'Hoje' },
              { value: 'Esta Semana', label: 'Esta Semana' },
              { value: 'Atrasadas', label: 'Atrasadas' },
              { value: 'Bloqueadas', label: 'Bloqueadas' },
            ]}
            value={filter}
            onChange={setFilter}
            className="w-full md:w-auto"
          />
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="Buscar por MO / Obra..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500/20 text-sm" />
          </div>
        </div>

        {/* Grouped Lists */}
        <div className="overflow-y-auto max-h-[800px] divide-y divide-gray-100 bg-slate-50/30">

          {/* Section A: Odoo */}
          <div className="bg-white">
            <div className="px-6 py-3 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between">
              <h3 className="text-xs font-black text-blue-800 uppercase tracking-widest">IDs do Odoo (Fluxo Padrão)</h3>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">{filteredItems.filter(i => i.source !== 'producao').length}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredItems.filter(i => i.source !== 'producao').map(item => (
                <DashboardRow key={item.id} item={item} isSelected={selectedIds.has(item.id)} onToggle={() => toggleSelect(item.id)} onViewDocs={() => openDocs(item.id, item.mo_number)} isMobile={isMobile} isDocsLoading={docsLoading(item.id)} />
              ))}
              {filteredItems.filter(i => i.source !== 'producao').length === 0 && (
                <EmptyState
                  icon={Package}
                  title="Nenhuma ID do Odoo"
                  description="Não há fabricações do fluxo padrão no momento."
                  className="py-10"
                />
              )}
            </div>
          </div>

          {/* Section B: Produção */}
          <div className="bg-white border-t-4 border-slate-100">
            <div className="px-6 py-3 bg-purple-50/50 border-b border-purple-100 flex items-center justify-between">
              <h3 className="text-xs font-black text-purple-800 uppercase tracking-widest">IDs da Produção (Manuais)</h3>
              <span className="text-[10px] font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">{filteredItems.filter(i => i.source === 'producao').length}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredItems.filter(i => i.source === 'producao').map(item => (
                <DashboardRow key={item.id} item={item} isSelected={selectedIds.has(item.id)} onToggle={() => toggleSelect(item.id)} onViewDocs={() => openDocs(item.id, item.mo_number)} isMobile={isMobile} isDocsLoading={docsLoading(item.id)} />
              ))}
              {filteredItems.filter(i => i.source === 'producao').length === 0 && (
                <EmptyState
                  icon={Package}
                  title="Nenhuma ID manual"
                  description="Não há solicitações manuais de produção no momento."
                  className="py-10"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && itemToConfigure && (
        <ModalPacote fabrication={itemToConfigure} onClose={() => setIsModalOpen(false)} onSave={() => setIsModalOpen(false)} />
      )}

      <DocViewer />

      {/* Confirmation Modal for Finalize / Delete Batch */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col scale-100 animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className={cn(
                "w-16 h-16 rounded-full mx-auto flex items-center justify-center",
                confirmAction.type === 'finalize' ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
              )}>
                {confirmAction.type === 'finalize' ? <CheckCircle2 size={32} /> : <Trash2 size={32} />}
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">
                  {confirmAction.type === 'finalize' ? 'Finalizar Lote?' : 'Apagar Lote?'}
                </h3>
                <p className="text-sm text-slate-500 mt-2">
                  {confirmAction.type === 'finalize'
                    ? 'Tem certeza que testou tudo e deseja concluir todas as pendências referentes a este lote no Odoo?'
                    : 'Tem certeza que deseja apagar este lote em andamento? As MOs voltarão para a fila.'
                  }
                </p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2 font-bold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={actionLoading === confirmAction.batchId}
                onClick={async () => {
                   if (confirmAction.type === 'finalize') {
                     await handleFinalizeBatch(confirmAction.batchId);
                   } else {
                     await handleCancelBatch(confirmAction.batchId);
                   }
                   setConfirmAction(null);
                }}
                className={cn(
                  "flex-1 px-4 py-2 font-bold text-white rounded-lg transition-colors shadow-sm flex items-center justify-center",
                  confirmAction.type === 'finalize' ? "bg-emerald-600 hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500/20" : "bg-rose-600 hover:bg-rose-700 focus:ring-2 focus:ring-rose-500/20",
                  actionLoading === confirmAction.batchId && "opacity-70 cursor-not-allowed"
                )}
              >
                {actionLoading === confirmAction.batchId ? (
                   <Loader2 size={16} className="animate-spin" />
                ) : (
                   'Confirmar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
