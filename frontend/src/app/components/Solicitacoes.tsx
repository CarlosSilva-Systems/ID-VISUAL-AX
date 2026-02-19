import React, { useState, useMemo } from 'react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  Search,
  ChevronRight,
  ExternalLink,
  Ban,
  Tag,
  History,
  Info,
  ArrowRightCircle,
  Plus,
  CheckCircle2,
  Package,
  FileText
} from 'lucide-react';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { Fabrication, Priority, StatusID, ManualRequest } from '../types';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SolicitacoesProps {
  onCreateBatch: (batchId: string) => void;
}

export function Solicitacoes({ onCreateBatch }: SolicitacoesProps) {
  const { isCompact } = useBreakpoint();
  const [items, setItems] = useState<ManualRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [docItem, setDocItem] = useState<ManualRequest | null>(null);

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getManualRequests();

      const mapped: ManualRequest[] = data.map((req: any) => {
        return {
          request_id: req.request_id,
          mo_number: req.mo_number,
          obra_nome: req.obra_nome,
          product_qty: req.product_qty,
          date_start: req.date_start ? String(req.date_start).split('T')[0] : '',
          priority: req.priority,
          status: req.status,
          requester_name: req.requester_name,
          notes: req.notes,

          // Odoo Fields
          mo_state: req.mo_state,
          mo_state_label: req.mo_state_label,
          mo_state_variant: req.mo_state_variant,
          odoo_mo_id: req.odoo_mo_id
        };
      });

      setItems(mapped);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar solicitações manuais');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async (item: ManualRequest) => {
    if (!item.request_id) return;
    try {
      await api.transferManualRequest(item.request_id);
      toast.success(`Solicitação ${item.mo_number} transferida para fila de produção!`);
      loadData(); // Refresh list
      window.dispatchEvent(new Event('manual-request-updated'));
      setSelectedItem(null);
    } catch (err: any) {
      toast.error(`Erro ao transferir: ${err.message}`);
    }
  };

  const handleOpenDocs = (item: ManualRequest) => {
    setDocItem(item);
    setIsDocModalOpen(true);
  };

  const [filter, setFilter] = useState<StatusID | 'Hoje' | 'Esta Semana' | 'Atrasadas' | 'Tudo'>('Tudo');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<ManualRequest | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.mo_number.toLowerCase().includes(search.toLowerCase()) ||
        (item.obra_nome || '').toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (filter === 'Tudo') return true;
      if (filter === 'Nova' || filter === 'Triagem' || filter === 'Em Lote' || filter === 'Bloqueada' || filter === 'Concluída') {
        return item.status === filter;
      }
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

  const handleCreateBatch = () => {
    // const batchItems = items.filter(item => selectedIds.has(item.request_id));
    // onCreateBatch(batchItems);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page Header */}
      <div className={cn("bg-white border-b border-gray-100 flex items-center justify-between", isCompact ? "px-4 py-4" : "px-8 py-6")}>
        <div>
          <h2 className={cn("font-bold text-slate-800", isCompact ? "text-lg" : "text-2xl")}>Solicitações Manuais</h2>
          <p className="text-sm text-slate-500">Pedidos manuais via tablet aguardando processamento.</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className={cn("bg-slate-50 border-b border-gray-100 flex items-center gap-4", isCompact ? "px-4 py-3 flex-col items-stretch" : "px-8 py-4 flex-wrap")}>
        <div className="flex items-center gap-2 overflow-x-auto flex-nowrap pb-1 scrollbar-hide">
          {['Tudo', 'Nova', 'Triagem', 'Em Lote'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all border whitespace-nowrap",
                filter === f
                  ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                  : "bg-white text-slate-600 border-gray-200 hover:border-slate-300"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-gray-200 hidden md:block" />
        <div className={cn("relative", isCompact ? "w-full" : "flex-1 min-w-[200px] max-w-md")}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por MO / Obra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className={cn("flex-1 overflow-auto bg-white", isCompact ? "p-4 pt-2" : "p-8 pt-4")}>
        {isCompact ? (
          /* ═══ MOBILE: Card List ═══ */
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.request_id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm active:bg-slate-50 transition-colors"
                onClick={() => setSelectedItem(item)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-900">{item.mo_number}</span>
                  <StatusBadge label={item.mo_state_label ?? ''} variant={item.mo_state_variant ?? 'neutral'} rawState={item.mo_state ?? ''} />
                </div>
                <p className="text-sm text-slate-600 truncate mb-1">Obra: {item.obra_nome || 'Sem Obra'}</p>
                <p className="text-xs text-slate-500 mb-1">Solicitante: <span className="font-medium text-slate-700">{item.requester_name || 'N/A'}</span></p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs font-bold text-slate-500">{item.date_start ? new Date(item.date_start).toLocaleDateString('pt-BR') : '-'}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpenDocs(item); }}
                      className="p-2 bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Ver Documentos"
                    >
                      <FileText size={18} />
                    </button>
                    <TransferButton item={item} onTransfer={handleTransfer} />
                  </div>
                </div>
              </div>
            ))}
            {filteredItems.length === 0 && (
              <div className="p-12 text-center text-slate-400">
                <Package className="mx-auto mb-2 opacity-20" size={48} />
                <p className="font-medium">Nenhuma solicitação manual pendente.</p>
              </div>
            )}
          </div>
        ) : (
          /* ═══ DESKTOP: Table ═══ */
          <div className="rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-100">
                  <th className="p-4 w-12"><input type="checkbox" disabled className="w-4 h-4 rounded border-gray-300" /></th>
                  <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Status</th>
                  <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Solicitante</th>
                  <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">MO / Obra</th>
                  <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Data</th>
                  <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Docs</th>
                  <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map((item) => (
                  <tr
                    key={item.request_id}
                    className="group hover:bg-blue-50/20 transition-colors cursor-pointer"
                    onClick={() => setSelectedItem(item)}
                  >
                    <td className="p-4"><input type="checkbox" disabled className="w-4 h-4 rounded border-gray-300" /></td>
                    <td className="p-4">
                      <StatusBadge label={item.mo_state_label ?? ''} variant={item.mo_state_variant ?? 'neutral'} rawState={item.mo_state ?? ''} />
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">{item.requester_name || 'N/A'}</span>
                        <span className="text-[10px] text-slate-500 truncate max-w-[150px]">{item.notes}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">{item.mo_number}</span>
                        <span className="text-xs text-slate-500">{item.obra_nome || 'Sem Obra'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-xs font-bold text-slate-600">{item.date_start ? new Date(item.date_start).toLocaleDateString('pt-BR') : '-'}</td>
                    <td className="p-4 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenDocs(item); }}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-all mx-auto block"
                        title="Visualizar Documentos"
                      >
                        <FileText size={18} />
                      </button>
                    </td>
                    <td className="p-4 text-right">
                      <TransferButton item={item} onTransfer={handleTransfer} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredItems.length === 0 && (
              <div className="p-12 text-center text-slate-400">
                <Package className="mx-auto mb-2 opacity-20" size={48} />
                <p className="font-medium text-lg">Nenhuma solicitação manual pendente.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Details Drawer */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setSelectedItem(null)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">{selectedItem.mo_number}</h3>
              <button onClick={() => setSelectedItem(null)}><Ban size={24} /></button>
            </div>

            <div className="space-y-4 flex-1">
              <div className="p-4 bg-slate-50 rounded-lg">
                <label className="text-[10px] font-black uppercase text-slate-400">Solicitante</label>
                <p className="font-bold text-slate-800">{selectedItem.requester_name || 'N/A'}</p>
              </div>
              {selectedItem.notes && (
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                  <label className="text-[10px] font-black uppercase text-yellow-600">Observação</label>
                  <p className="text-sm text-yellow-800 mt-1 whitespace-pre-wrap">{selectedItem.notes}</p>
                </div>
              )}
              <div className="p-4 bg-slate-50 rounded-lg">
                <label className="text-[10px] font-black uppercase text-slate-400">Obra</label>
                <p className="font-bold text-slate-800">{selectedItem.obra_nome || 'Sem Obra'}</p>
              </div>
            </div>

            <div className="mt-auto">
              <button
                onClick={() => handleTransfer(selectedItem)}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20"
              >
                Confirmar Transferência para Fila Padrão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {isDocModalOpen && docItem && (
        <DocumentPreviewModal
          moId={String(docItem.odoo_mo_id || '')} // Ensure string and handle undefined
          moNumber={docItem.mo_number}
          onClose={() => setIsDocModalOpen(false)}
        />
      )}
    </div>
  );
}

const StatusBadge = ({ label, variant, rawState }: { label: string, variant: string, rawState: string }) => {
  const styles: Record<string, string> = {
    neutral: 'bg-gray-100 text-gray-600',
    success: 'bg-emerald-100 text-emerald-700',
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-rose-100 text-rose-700',
    default: 'bg-indigo-100 text-indigo-700',
  };

  return (
    <div className="group/badge relative inline-block">
      <span className={cn(
        "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
        styles[variant] || styles.neutral
      )}>
        {label}
      </span>
      {label === 'Desconhecido' && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover/badge:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
          State: {rawState}
        </span>
      )}
    </div>
  );
};

const TransferButton = ({ item, onTransfer }: { item: ManualRequest, onTransfer: (i: ManualRequest) => void }) => {
  const isDisabled = item.mo_state === 'cancel' || item.mo_state === 'done';
  const tooltipText = item.mo_state === 'cancel' ? 'Cancelado no Odoo' :
    item.mo_state === 'done' ? 'Concluído no Odoo' : '';

  return (
    <div className="group/btn relative inline-block ml-auto">
      <button
        onClick={(e) => { e.stopPropagation(); !isDisabled && onTransfer(item); }}
        disabled={isDisabled}
        className={cn(
          "px-3 py-1 rounded text-xs font-bold transition-colors flex items-center gap-1",
          isDisabled
            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
            : "bg-blue-100 text-blue-700 hover:bg-blue-200"
        )}
      >
        Transferir <ArrowRightCircle size={14} />
      </button>

      {isDisabled && (
        <span className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
          {tooltipText}
        </span>
      )}
    </div>
  );
};
