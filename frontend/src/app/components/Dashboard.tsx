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
  X
} from 'lucide-react';
import { Fabrication, PackageType } from '../types';
import { ModalPacote } from './ModalPacote';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatObraDisplayName } from '../../lib/utils';
import { api } from '../../services/api';
import { toast } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DashboardProps {
  onCreateBatch: (batchId: string) => void;
}

export function Dashboard({ onCreateBatch }: DashboardProps) {
  const [items, setItems] = useState<Fabrication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'Todas' | 'Hoje' | 'Esta Semana' | 'Atrasadas' | 'Bloqueadas'>('Todas');
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToConfigure, setItemToConfigure] = useState<Fabrication | null>(null);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);

  // Document preview modal state
  const [docModalMoId, setDocModalMoId] = useState<string | null>(null);
  const [docModalMoNumber, setDocModalMoNumber] = useState<string | null>(null);

  // Active batches state (isolated from main load)
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
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getOdooMOs();
      const mappedItems: Fabrication[] = data.map((mo: any) => {
        // Calculate SLA based on Activity Deadline
        let sla = 'No Prazo';
        if (mo.activity_date_deadline) {
          const deadline = new Date(mo.activity_date_deadline);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (deadline < today) sla = 'Vencida';
          else if (deadline.getTime() === today.getTime()) sla = 'Hoje';
        }

        return {
          id: String(mo.odoo_mo_id),
          mo_number: mo.mo_number,
          obra: mo.obra || 'Sem Obra',
          status: mo.state === 'confirmed' ? 'Nova' : (mo.state === 'progress' ? 'Em Lote' : mo.state),
          priority: sla === 'Vencida' ? 'Urgente' : 'Normal',
          date_start: mo.date_start ? new Date(mo.date_start).toLocaleDateString('pt-BR') : '-',
          product_qty: mo.product_qty,
          sla: sla,
          packageType: undefined,
          activity_summary: mo.activity_summary,
          from_production: mo.from_production,
          production_requester: mo.production_requester,
          // Support for full Fabrication type
          mrp_state: mo.state === 'done' ? 'Concluído' : 'Em Produção',
          tasks: [],
          docs: { diagrama: false, legenda: false }
        };
      });
      setItems(mappedItems);
    } catch (err: any) {
      console.error(err);
      setError("Falha ao carregar dados do Odoo");
    } finally {
      setLoading(false);
    }

    // Isolated: Load active batches (failure does NOT affect main queue)
    try {
      const batchesData = await api.getActiveBatches();
      setActiveBatches(batchesData);
      setActiveBatchesError(null);
    } catch (err: any) {
      console.error('Active batches load failed:', err);
      setActiveBatchesError('Não foi possível carregar lotes em andamento');
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const searchLower = search.toLowerCase();
      const matchesSearch = (item.mo_number || '').toLowerCase().includes(searchLower) ||
        (item.obra || '').toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      if (filter === 'Atrasadas') return item.sla === 'Vencida';
      if (filter === 'Bloqueadas') return item.status === 'Bloqueada';
      // 'Hoje' and 'Esta Semana' implementation skipped for brevity/simplicity in V1
      return true;
    });
  }, [items, search, filter]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleOpenModal = (item: Fabrication) => {
    setItemToConfigure(item);
    setIsModalOpen(true);
  };

  const handleSavePackage = (packageType: PackageType) => {
    if (itemToConfigure) {
      setItems(prev => prev.map(item =>
        item.id === itemToConfigure.id
          ? { ...item, packageType, status: 'Triagem' }
          : item
      ));
      setIsModalOpen(false);
      setItemToConfigure(null);
    }
  };

  const handleFinalizeBatch = async (batchId: string) => {
    setActionLoading(batchId);
    try {
      await api.finalizeBatch(batchId);
      toast.success('Lote finalizado com sucesso!');
      setActiveBatches(prev => prev.filter(b => b.batch_id !== batchId));
    } catch (err: any) {
      if (err.data?.pendencies) {
        const count = err.data.pendencies.length;
        toast.error(`Não é possível finalizar: ${count} pendência(s). Retome o lote para completar.`);
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p className="font-medium text-slate-500">Carregando Produção do Odoo...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
          <h3 className="text-xl font-bold text-slate-800">Erro de Conexão</h3>
          <p className="text-slate-500 mb-6">{error}</p>
          <button onClick={loadData} className="px-4 py-2 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 font-bold flex items-center gap-2 mx-auto text-slate-700">
            <RefreshCw size={18} /> Tentar Novamente
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Filas" value={items.length.toString()} icon={Package} color="blue" />
        <StatCard label="Selecionados" value={selectedIds.size.toString()} icon={CheckCircle2} color="amber" />
        {/* Placeholder Stats */}
        <StatCard label="Atrasadas" value="0" icon={Clock} color="red" />
        <StatCard label="Bloqueadas" value="0" icon={AlertTriangle} color="red" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeBatches.map((batch) => {
                const timeDiff = Date.now() - new Date(batch.last_activity_at).getTime();
                const minutes = Math.floor(timeDiff / 60000);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);
                const timeAgo = days > 0 ? `${days}d atrás` : hours > 0 ? `${hours}h atrás` : minutes > 1 ? `${minutes}min atrás` : 'Agora';

                return (
                  <div
                    key={batch.batch_id}
                    className="p-5 border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all group bg-white"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm">{batch.batch_name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{batch.items_count} fabricação(ões)</p>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium shrink-0">{timeAgo}</span>
                    </div>

                    {batch.is_complete ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg mb-3">
                        <CheckCircle size={16} className="text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-700">Pronto para finalizar</span>
                      </div>
                    ) : (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Progresso</span>
                          <span className="text-xs font-bold text-slate-700">{batch.progress_pct}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              batch.progress_pct >= 75 ? "bg-gradient-to-r from-blue-500 to-emerald-500" :
                                batch.progress_pct >= 40 ? "bg-gradient-to-r from-blue-500 to-blue-400" :
                                  "bg-blue-500"
                            )}
                            style={{ width: `${batch.progress_pct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onCreateBatch(batch.batch_id)}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                      >
                        Retomar <ChevronRight size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (!batch.is_complete) {
                            setConfirmAction({ batchId: batch.batch_id, type: 'finalize' });
                          } else {
                            handleFinalizeBatch(batch.batch_id);
                          }
                        }}
                        disabled={actionLoading === batch.batch_id}
                        className="px-3 py-2 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        title="Concluir lote"
                      >
                        {actionLoading === batch.batch_id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      </button>
                      <button
                        onClick={() => setConfirmAction({ batchId: batch.batch_id, type: 'delete' })}
                        disabled={actionLoading === batch.batch_id}
                        className="px-3 py-2 bg-rose-100 text-rose-600 rounded-lg font-bold text-xs hover:bg-rose-200 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        title="Apagar lote"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Confirmation Alert */}
                    {confirmAction?.batchId === batch.batch_id && (
                      <div className={cn(
                        "mt-3 p-3 rounded-lg border text-xs",
                        confirmAction.type === 'delete'
                          ? "bg-rose-50 border-rose-200"
                          : "bg-amber-50 border-amber-200"
                      )}>
                        <div className="flex items-start gap-2 mb-2">
                          <AlertTriangle size={14} className={confirmAction.type === 'delete' ? 'text-rose-500 shrink-0 mt-0.5' : 'text-amber-500 shrink-0 mt-0.5'} />
                          <span className={cn("font-bold", confirmAction.type === 'delete' ? 'text-rose-700' : 'text-amber-700')}>
                            {confirmAction.type === 'delete'
                              ? 'Tem certeza que deseja apagar este lote? Esta ação não pode ser desfeita.'
                              : 'Este lote possui tarefas pendentes. Tem certeza que deseja tentar concluir?'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setConfirmAction(null)}
                            className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => {
                              if (confirmAction.type === 'delete') {
                                handleCancelBatch(batch.batch_id);
                              } else {
                                handleFinalizeBatch(batch.batch_id);
                              }
                              setConfirmAction(null);
                            }}
                            className={cn(
                              "px-3 py-1.5 text-xs font-bold text-white rounded-lg transition-all",
                              confirmAction.type === 'delete'
                                ? "bg-rose-600 hover:bg-rose-700"
                                : "bg-amber-600 hover:bg-amber-700"
                            )}
                          >
                            {confirmAction.type === 'delete' ? 'Sim, Apagar' : 'Sim, Concluir'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Block: Fila de IDs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white sticky top-0 z-20">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Fila de Produção (Odoo)</h2>
            <p className="text-sm text-slate-500">Selecione as MOs para iniciar o lote de trabalho.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-600">
              Selecionadas: <span className="text-blue-600 font-bold">{selectedIds.size}</span>
            </div>
            <button
              onClick={handleCreateBatch}
              disabled={selectedIds.size === 0 || isCreatingBatch}
              className={cn(
                "px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-md",
                selectedIds.size > 0 && !isCreatingBatch
                  ? "bg-blue-600 text-white hover:bg-blue-700 active:scale-95 cursor-pointer"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              )}
            >
              {isCreatingBatch ? <Loader2 className="animate-spin" size={18} /> : <div className="flex items-center gap-2">Criar Lote <ChevronRight size={18} /></div>}
            </button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="px-6 py-4 border-b border-gray-100 bg-slate-50 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
            {(['Todas', 'Hoje', 'Esta Semana', 'Atrasadas', 'Bloqueadas'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border",
                  filter === f
                    ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                    : "bg-white text-slate-600 border-gray-200 hover:border-slate-300"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por MO / Obra..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto max-h-[600px] divide-y divide-gray-100">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "p-4 hover:bg-blue-50/30 transition-all flex items-center gap-4 cursor-default",
                selectedIds.has(item.id) && "bg-blue-50/60 ring-1 ring-inset ring-blue-500/30"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-bold text-slate-900">{item.mo_number}</span>
                  <PriorityChip priority={item.priority} />
                  <StatusChip status={item.status} />
                  {item.from_production && (
                    <div className="group relative">
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold tracking-wider cursor-help">
                        PRODUÇÃO
                      </span>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                        Solicitante: {item.production_requester}
                      </div>
                    </div>
                  )}
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
                  {/* SLA Logic can be improved later */}
                </div>
              </div>

              <div className="flex flex-col gap-2 items-end min-w-[120px]">
                {/* 
                <button
                  onClick={() => handleOpenModal(item)}
                  className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors w-full"
                >
                  Selecionar Pacote
                </button>
                */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDocModalMoId(item.id); setDocModalMoNumber(item.mo_number); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    title="Ver documentos"
                  >
                    <FileText size={14} />
                    Docs
                  </button>
                  <button
                    onClick={() => toggleSelect(item.id)}
                    className={cn(
                      "w-6 h-6 rounded border-2 flex items-center justify-center transition-all",
                      selectedIds.has(item.id)
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-gray-300 hover:border-blue-400"
                    )}
                  >
                    {selectedIds.has(item.id) && <CheckCircle2 size={16} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div className="p-12 text-center text-slate-400">
              <Info className="mx-auto mb-2 opacity-20" size={48} />
              <p>Nenhuma fabricação encontrada.</p>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && itemToConfigure && (
        <ModalPacote
          fabrication={itemToConfigure}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSavePackage}
        />
      )}

      {docModalMoId && docModalMoNumber && (
        <DocumentPreviewModal
          moId={docModalMoId}
          moNumber={docModalMoNumber}
          onClose={() => { setDocModalMoId(null); setDocModalMoNumber(null); }}
        />
      )}
    </div>
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
    Nova: 'text-blue-500',
    Triagem: 'text-amber-500',
    'Em Lote': 'text-indigo-500',
    Bloqueada: 'text-rose-500',
    Concluída: 'text-emerald-500',
    'Sem Solicitação': 'text-slate-400',
  };

  const currentStyle = styles[status] || 'text-slate-400';

  return (
    <span className={cn("flex items-center gap-1.5 text-xs font-bold", currentStyle)}>
      <div className={cn(
        "w-1.5 h-1.5 rounded-full",
        status === 'Nova' ? 'bg-blue-500 animate-pulse' : currentStyle.replace('text-', 'bg-')
      )} />
      {status}
    </span>
  );
}
