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
  XCircle,
  FileText
} from 'lucide-react';
import { Fabrication, PackageType } from '../types';
import { ModalPacote } from './ModalPacote';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { api } from '../../services/api';
import { toast } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Urgency Engine ──────────────────────────────────────────────────
type UrgencyKey = 'on_time' | 'week' | 'today' | 'overdue_activity' | 'late_start';

function computeUrgency(mo: {
  activity_deadline?: string | null;
  date_start?: string | null;
  mo_state?: string | null;
}): { urgency_level: 0 | 1 | 2 | 3; urgency_key: UrgencyKey; urgency_label_pt: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let level: 0 | 1 | 2 | 3 = 0;
  let key: UrgencyKey = 'on_time';
  let label = 'No Prazo';

  // 1) Check activity_deadline
  if (mo.activity_deadline) {
    const dl = new Date(mo.activity_deadline);
    dl.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((dl.getTime() - today.getTime()) / 86400000);

    if (diffDays < 0) {
      level = 3;
      key = 'overdue_activity';
      label = `Atividade vencida há ${Math.abs(diffDays)} dia(s)`;
    } else if (diffDays === 0) {
      level = 2;
      key = 'today';
      label = 'Vence hoje';
    } else if (diffDays <= 7) {
      level = 1;
      key = 'week';
      label = `Vence em ${diffDays} dia(s)`;
    }
  }

  // 2) Check date_start (only upgrades, never downgrades)
  if (mo.date_start && !['done', 'cancel'].includes(mo.mo_state || '')) {
    const ds = new Date(mo.date_start);
    ds.setHours(0, 0, 0, 0);
    const diffStart = Math.floor((ds.getTime() - today.getTime()) / 86400000);

    if (diffStart < 0 && level < 3) {
      level = 3;
      key = 'late_start';
      label = `Início previsto há ${Math.abs(diffStart)} dia(s)`;
    }
  }

  return { urgency_level: level, urgency_key: key, urgency_label_pt: label };
}

// ── Dashboard Component ─────────────────────────────────────────────
interface DashboardProps {
  onCreateBatch: (batchId: string) => void;
}

export function Dashboard({ onCreateBatch }: DashboardProps) {
  const [items, setItems] = useState<Fabrication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'Todas' | 'Hoje' | 'Esta Semana' | 'Atrasadas' | 'Canceladas'>('Todas');
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToConfigure, setItemToConfigure] = useState<Fabrication | null>(null);

  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [docItem, setDocItem] = useState<Fabrication | null>(null);

  const [isCreatingBatch, setIsCreatingBatch] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getOdooMOs();
      const mappedItems: Fabrication[] = data.map((mo: any) => {
        const urgency = computeUrgency({
          activity_deadline: mo.activity_deadline,
          date_start: mo.date_start,
          mo_state: mo.mo_state,
        });

        return {
          id: String(mo.odoo_mo_id),
          mo_number: mo.mo_number,
          obra: mo.obra || 'Sem Obra',
          status: mo.mo_state_label || 'Sem Status',
          date_start: mo.date_start || null,
          product_qty: mo.product_qty,
          packageType: null,
          activity_summary: mo.activity_summary,
          activity_deadline: mo.activity_deadline || null,
          from_production: mo.from_production,
          production_requester: mo.production_requester,
          mo_state: mo.mo_state,
          mo_state_variant: mo.mo_state_variant,
          origin: mo.origin,
          product_document_count: mo.product_document_count || 0,
          ...urgency,
        };
      });
      setItems(mappedItems);
    } catch (err: any) {
      console.error('Odoo Load Error:', err);
      // Capture diagnostic detail from API error if possible
      const diagnostic = err.data || {};
      setError(diagnostic.hint || err.message || "Falha ao carregar dados do Odoo");
      (window as any)._lastOdooError = diagnostic; // Optional: for developer console inspection
    } finally {
      setLoading(false);
    }
  };

  // ── Stats (dynamic) ──
  const stats = useMemo(() => ({
    urgentes: items.filter(i => i.urgency_level === 3).length,
    hoje: items.filter(i => i.urgency_key === 'today').length,
    semana: items.filter(i => ['today', 'week'].includes(i.urgency_key)).length,
    canceladas: items.filter(i => i.mo_state === 'cancel').length,
  }), [items]);

  // ── Filters ──
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const searchLower = search.toLowerCase();
      const matchesSearch = (item.mo_number || '').toLowerCase().includes(searchLower) ||
        (item.obra || '').toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      if (filter === 'Hoje') return item.urgency_key === 'today';
      if (filter === 'Esta Semana') return ['today', 'week'].includes(item.urgency_key);
      if (filter === 'Atrasadas') return item.urgency_level === 3;
      if (filter === 'Canceladas') return item.mo_state === 'cancel';
      return true;
    });
  }, [items, search, filter]);

  // ── Lean Ordering ──
  const sortedItems = useMemo(() =>
    [...filteredItems].sort((a, b) =>
      (b.urgency_level - a.urgency_level)
      || ((a.activity_deadline ?? '9999').localeCompare(b.activity_deadline ?? '9999'))
      || ((a.date_start ?? '9999').localeCompare(b.date_start ?? '9999'))
      || (a.mo_number ?? '').localeCompare(b.mo_number ?? '')
    ), [filteredItems]);

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

  const handleOpenDocs = (item: Fabrication) => {
    setDocItem(item);
    setIsDocModalOpen(true);
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
    const diag = (window as any)._lastOdooError || {};
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-red-100 overflow-hidden">
          <div className="bg-red-50 p-6 flex flex-col items-center border-b border-red-100">
            <AlertTriangle className="text-red-500 mb-2" size={48} />
            <h3 className="text-xl font-bold text-red-900">Erro de Conexão (Odoo)</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-1">
              <p className="text-slate-700 font-medium">{error}</p>
              {diag.stage && (
                <p className="text-xs text-slate-500">
                  Falha em: <span className="font-mono bg-slate-100 px-1 rounded">{diag.stage}</span>
                </p>
              )}
            </div>

            {diag.request_id && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[10px] font-mono text-slate-500 space-y-1">
                <p>Request ID: {diag.request_id}</p>
                {diag.odoo_call && <p>Call: {diag.odoo_call}</p>}
              </div>
            )}

            <button
              onClick={loadData}
              className="w-full py-3 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <RefreshCw size={18} /> Tentar Novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6">
      {/* Stats Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Total Fila" value={items.length.toString()} icon={Package} color="blue" />
        <StatCard label="Urgentes" value={stats.urgentes.toString()} icon={AlertTriangle} color="red" />
        <StatCard label="Hoje" value={stats.hoje.toString()} icon={Clock} color="amber" />
        <StatCard label="Canceladas" value={stats.canceladas.toString()} icon={XCircle} color="red" />
      </div>

      {/* Main Block */}
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
          <div className="flex items-center gap-2 overflow-x-auto flex-nowrap pb-2 md:pb-0 scrollbar-hide -mx-1 px-1">
            {(['Todas', 'Hoje', 'Esta Semana', 'Atrasadas', 'Canceladas'] as const).map((f) => (
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
                {f === 'Atrasadas' && stats.urgentes > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-rose-500 text-white text-[10px] rounded-full">{stats.urgentes}</span>
                )}
                {f === 'Hoje' && stats.hoje > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] rounded-full">{stats.hoje}</span>
                )}
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
          {sortedItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "p-3 md:p-4 hover:bg-blue-50/30 transition-all flex items-start md:items-center gap-3 md:gap-4 cursor-default",
                selectedIds.has(item.id) && "bg-blue-50/60 ring-1 ring-inset ring-blue-500/30",
                item.urgency_level === 3 && "border-l-4 border-l-rose-500",
                item.urgency_level === 2 && "border-l-4 border-l-amber-400",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-slate-900">{item.mo_number}</span>
                  <UrgencyChip level={item.urgency_level} />
                  <StatusChip status={item.status} variant={item.mo_state_variant} />
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
                  Obra: {item.obra}
                </div>
                <div className="flex items-center gap-3 md:gap-4 text-xs text-slate-500 flex-wrap">
                  <span className="flex items-center gap-1"><Package size={12} /> Qtd: {item.product_qty}</span>
                  <span className="flex items-center gap-1 font-bold text-slate-600">
                    <Calendar size={12} /> {item.date_start ? new Date(item.date_start).toLocaleDateString('pt-BR') : 'Sem data'}
                  </span>
                  {/* Urgency label */}
                  {item.urgency_level > 0 && (
                    <UrgencyLabel urgencyKey={item.urgency_key} label={item.urgency_label_pt} level={item.urgency_level} />
                  )}
                  {!item.date_start && (
                    <span className="text-slate-400 italic">Sem data de início</span>
                  )}
                  {item.product_document_count !== undefined && (
                    <span className={cn(
                      "flex items-center gap-1 font-bold",
                      item.product_document_count > 0 ? "text-blue-600" : "text-slate-400"
                    )}>
                      <FileText size={12} /> Docs: {item.product_document_count}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 items-end min-w-[120px]">
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenDocs(item); }}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      (item.product_document_count || 0) > 0 ? "text-blue-600 hover:bg-blue-50" : "text-slate-300 hover:text-slate-500 hover:bg-slate-50"
                    )}
                    title="Ver Documentos"
                  >
                    <FileText size={20} />
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
          {sortedItems.length === 0 && (
            <div className="p-12 text-center text-slate-400">
              <Info className="mx-auto mb-2 opacity-20" size={48} />
              <p>
                {filter !== 'Todas'
                  ? `Nenhuma fabricação encontrada no filtro "${filter}".`
                  : "Nenhuma fabricação com atividade 'Imprimir ID Visual' encontrada."
                }
              </p>
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

      {isDocModalOpen && docItem && (
        <DocumentPreviewModal
          moId={docItem.id}
          moNumber={docItem.mo_number}
          onClose={() => setIsDocModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

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

function UrgencyChip({ level }: { level: 0 | 1 | 2 | 3 }) {
  if (level === 0) return null;
  const config = {
    1: { label: 'Semana', style: 'bg-slate-100 text-slate-600' },
    2: { label: 'Hoje', style: 'bg-amber-100 text-amber-700' },
    3: { label: 'Urgente', style: 'bg-rose-100 text-rose-700' },
  };
  const c = config[level];
  return <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", c.style)}>{c.label}</span>;
}

function UrgencyLabel({ urgencyKey, label, level }: { urgencyKey: string; label: string; level: number }) {
  const colors: Record<string, string> = {
    overdue_activity: 'text-rose-600',
    late_start: 'text-amber-600',
    today: 'text-blue-600',
    week: 'text-slate-500',
  };
  const icons: Record<string, string> = {
    overdue_activity: '⚠️',
    late_start: '🕐',
    today: '📅',
    week: '📋',
  };
  return (
    <span className={cn("flex items-center gap-1 font-medium", colors[urgencyKey] || 'text-slate-400')}>
      <span>{icons[urgencyKey] || ''}</span>
      {label}
    </span>
  );
}

function StatusChip({ status, variant }: { status: string, variant?: string }) {
  const variantStyles: Record<string, string> = {
    neutral: 'text-slate-500 bg-slate-50 border-slate-200',
    success: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    info: 'text-blue-700 bg-blue-50 border-blue-200',
    warning: 'text-amber-700 bg-amber-50 border-amber-200',
    danger: 'text-rose-700 bg-rose-50 border-rose-200',
    default: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  };

  const localStyles: Record<string, string> = {
    Rascunho: 'text-slate-500',
    Confirmado: 'text-emerald-700 bg-emerald-50',
    'Em progresso': 'text-blue-700 bg-blue-50',
    'A ser fechado': 'text-amber-700 bg-amber-50',
    Concluído: 'text-indigo-700 bg-indigo-50',
    Cancelado: 'text-rose-700 bg-rose-50',
  };

  const style = variant && variantStyles[variant]
    ? variantStyles[variant]
    : localStyles[status] || 'text-slate-400';

  return (
    <span className={cn("text-xs font-bold px-2 py-0.5 rounded border border-transparent", style)}>
      {status || 'Sem Status'}
    </span>
  );
}
