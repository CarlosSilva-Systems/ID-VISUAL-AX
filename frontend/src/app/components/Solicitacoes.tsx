import React, { useState, useMemo } from 'react';
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
  Package
} from 'lucide-react';
import { Fabrication, Priority, StatusID } from '../types';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { useData } from '../contexts/DataContext';
import { formatObraDisplayName } from '../../lib/utils';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SolicitacoesProps {
  onCreateBatch: (items: Fabrication[]) => void;
}

export function Solicitacoes({ onCreateBatch }: SolicitacoesProps) {
  const { manualRequests, loadingRequests, refreshManualRequests } = useData();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isTransferring, setIsTransferring] = useState(false);

  React.useEffect(() => {
    refreshManualRequests();
  }, [refreshManualRequests]);

  const handleTransfer = async (idOrIds: string | string[]) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    if (ids.length === 0) return;

    setIsTransferring(true);
    const loadingToast = toast.loading(ids.length === 1
      ? `Transferindo solicitação...`
      : `Transferindo ${ids.length} solicitações...`
    );

    try {
      if (ids.length === 1) {
        await api.transferManualRequest(ids[0]);
        toast.success(`Solicitação transferida com sucesso!`, { id: loadingToast });
      } else {
        const result = await api.bulkTransferManualRequests(ids);
        if (result.fail_count === 0) {
          toast.success(`${result.success_count} solicitações transferidas com sucesso!`, { id: loadingToast });
        } else {
          toast.error(`${result.success_count} transferidas, ${result.fail_count} falharam.`, { id: loadingToast });
        }
      }

      setSelectedIds(new Set());
      refreshManualRequests(true);
      window.dispatchEvent(new Event('manual-request-updated'));
      setSelectedItem(null);
    } catch (err: any) {
      toast.error(`Erro ao transferir: ${err.message}`, { id: loadingToast });
    } finally {
      setIsTransferring(false);
    }
  };

  const [filter, setFilter] = useState<StatusID | 'Hoje' | 'Esta Semana' | 'Atrasadas' | 'Tudo'>('Tudo');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<Fabrication | null>(null);

  const filteredItems = useMemo(() => {
    return manualRequests.filter(item => {
      const matchesSearch = item.mo_number.toLowerCase().includes(search.toLowerCase()) ||
        item.obra.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (filter === 'Tudo') return true;
      if (filter === 'Nova' || filter === 'Triagem' || filter === 'Em Lote' || filter === 'Bloqueada' || filter === 'Concluída') {
        return item.status === filter;
      }
      return true;
    });
  }, [manualRequests, search, filter]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const handleCreateBatch = () => {
    const batchItems = manualRequests.filter(item => selectedIds.has(item.id));
    onCreateBatch(batchItems);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page Header */}
      <div className="px-8 py-6 bg-white border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Solicitações Manuais (Produção)</h2>
          <p className="text-sm text-slate-500">Pedidos manuais via tablet aguardando processamento.</p>
        </div>
        <div className="flex items-center gap-4">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
              <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                {selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => handleTransfer(Array.from(selectedIds))}
                disabled={isTransferring}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-black uppercase tracking-wider hover:bg-blue-700 shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                Transferir em Lote <ArrowRightCircle size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="px-8 py-4 bg-slate-50 border-b border-gray-100 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 overflow-x-auto">
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
        <div className="relative flex-1 min-w-[200px] max-w-md">
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

      {/* Main Table */}
      <div className="flex-1 overflow-auto bg-white p-8 pt-4">
        <div className="rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-100">
                <th className="p-4 w-12">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 transition-all cursor-pointer accent-blue-600"
                    checked={filteredItems.length > 0 && selectedIds.size === filteredItems.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Status</th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Solicitante</th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">MO / Obra</th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Data</th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className={cn(
                    "group hover:bg-blue-50/20 transition-colors cursor-pointer",
                    selectedIds.has(item.id) && "bg-blue-50 border-l-2 border-l-blue-500"
                  )}
                  onClick={() => setSelectedItem(item)}
                >
                  <td className="p-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 transition-all cursor-pointer accent-blue-600"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </td>
                  <td className="p-4"><StatusBadge status={item.status} /></td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{item.requester_name}</span>
                      <span className="text-[10px] text-slate-500 truncate max-w-[150px]">{item.notes}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{item.mo_number}</span>
                      <span className="text-xs text-slate-500">{formatObraDisplayName(item.obra)}</span>
                    </div>
                  </td>
                  <td className="p-4 text-xs font-bold text-slate-600">{item.date_start}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleTransfer(item.id); }}
                      disabled={isTransferring}
                      className="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-xs font-bold transition-colors flex items-center gap-1 ml-auto disabled:opacity-50"
                    >
                      {isTransferring ? '...' : 'Transferir'} <ArrowRightCircle size={14} />
                    </button>
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
                <p className="font-bold text-slate-800">{selectedItem.requester_name}</p>
              </div>
              {selectedItem.notes && (
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                  <label className="text-[10px] font-black uppercase text-yellow-600">Observação</label>
                  <p className="text-sm text-yellow-800 mt-1 whitespace-pre-wrap">{selectedItem.notes}</p>
                </div>
              )}
              <div className="p-4 bg-slate-50 rounded-lg">
                <label className="text-[10px] font-black uppercase text-slate-400">Obra</label>
                <p className="font-bold text-slate-800">{formatObraDisplayName(selectedItem.obra)}</p>
              </div>
            </div>

            <div className="mt-auto">
              <button
                onClick={() => handleTransfer(selectedItem.id)}
                disabled={isTransferring}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isTransferring ? 'Processando...' : 'Confirmar Transferência para Fila Padrão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: StatusID }) {
  const styles: Record<string, string> = {
    Nova: 'bg-blue-100 text-blue-700',
    Triagem: 'bg-amber-100 text-amber-700',
    'Em Lote': 'bg-indigo-100 text-indigo-700',
    Bloqueada: 'bg-rose-100 text-rose-700',
    Concluída: 'bg-emerald-100 text-emerald-700',
  };
  return <span className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider", styles[status] || 'bg-gray-100 text-gray-500')}>{status}</span>;
}
