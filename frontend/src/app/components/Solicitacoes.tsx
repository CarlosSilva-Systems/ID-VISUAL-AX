import React, { useState, useMemo } from 'react';
import {
  Search,
  Ban,
  ArrowRightCircle,
  Package
} from 'lucide-react';
import { Fabrication, StatusID } from '../types';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { useData } from '../contexts/DataContext';
import { formatObraDisplayName } from '../../lib/utils';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { BottomSheet } from '@/app/components/BottomSheet';

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
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'mobile' || breakpoint === 'sm';

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error(`Erro ao transferir: ${message}`, { id: loadingToast });
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

  // Conteúdo do drawer de detalhes (compartilhado entre bottom sheet e drawer lateral)
  const drawerContent = selectedItem ? (
    <>
      <div className="space-y-4 flex-1 p-6">
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
        <div className="p-4 bg-slate-50 rounded-lg">
          <label className="text-[10px] font-black uppercase text-slate-400">Status</label>
          <div className="mt-1"><StatusBadge status={selectedItem.status} /></div>
        </div>
      </div>
      <div className="px-6 pb-6 pt-2 flex-shrink-0">
        <button
          onClick={() => handleTransfer(selectedItem.id)}
          disabled={isTransferring}
          className="w-full py-3 min-h-[44px] bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:bg-blue-800 shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isTransferring ? 'Processando...' : 'Confirmar Transferência para Fila Padrão'}
        </button>
      </div>
    </>
  ) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page Header — flex-col em mobile, flex-row em sm+ */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 bg-white border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Solicitações Manuais (Produção)</h2>
          <p className="text-sm text-slate-500">Pedidos manuais via tablet aguardando processamento.</p>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
            <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
              {selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => handleTransfer(Array.from(selectedIds))}
              disabled={isTransferring}
              className="w-full sm:w-auto px-6 py-2 min-h-[44px] bg-blue-600 text-white rounded-xl text-sm font-black uppercase tracking-wider hover:bg-blue-700 active:bg-blue-800 shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Transferir em Lote <ArrowRightCircle size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Filters Bar — empilhado verticalmente em mobile */}
      <div className="px-4 sm:px-8 py-3 sm:py-4 bg-slate-50 border-b border-gray-100 flex flex-col gap-3">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {(['Tudo', 'Nova', 'Triagem', 'Em Lote'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as typeof filter)}
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
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por MO / Obra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 min-h-[44px] bg-white rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Conteúdo principal: Card View em mobile, tabela em md+ */}
      <div className="flex-1 overflow-auto bg-white">
        {/* ── MOBILE: Card View (< md) ── */}
        {isMobile ? (
          <div className="p-4 space-y-3">
            {/* Checkbox "selecionar todos" em mobile */}
            {filteredItems.length > 0 && (
              <div className="flex items-center gap-3 px-1">
                <div className="flex items-center justify-center min-w-[44px] min-h-[44px]">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-blue-600"
                    checked={selectedIds.size === filteredItems.length}
                    onChange={toggleSelectAll}
                    aria-label="Selecionar todos"
                  />
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} de ${filteredItems.length} selecionada${selectedIds.size !== 1 ? 's' : ''}`
                    : `${filteredItems.length} solicitaç${filteredItems.length !== 1 ? 'ões' : 'ão'}`}
                </span>
              </div>
            )}

            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={cn(
                  "rounded-xl border bg-white shadow-sm p-4 cursor-pointer transition-colors active:bg-blue-50/40",
                  selectedIds.has(item.id)
                    ? "border-blue-400 border-l-4 bg-blue-50/30"
                    : "border-gray-200"
                )}
              >
                {/* Linha 1: Checkbox + Status badge */}
                <div className="flex items-center justify-between mb-2">
                  <div
                    className="flex items-center justify-center min-w-[44px] min-h-[44px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-blue-600"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      aria-label={`Selecionar ${item.mo_number}`}
                    />
                  </div>
                  <StatusBadge status={item.status} />
                </div>

                {/* Linha 2: Solicitante + MO (principal) */}
                <div className="mb-1">
                  <span className="text-sm font-bold text-slate-800">{item.requester_name}</span>
                  <span className="text-xs text-slate-500 ml-2 font-medium">{item.mo_number}</span>
                </div>

                {/* Linha 3: Obra (secundária) */}
                <div className="mb-3">
                  <span className="text-xs text-slate-500">{formatObraDisplayName(item.obra)}</span>
                </div>

                {/* Rodapé: Botão de ação */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleTransfer(item.id); }}
                  disabled={isTransferring}
                  className="w-full min-h-[44px] px-4 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 active:bg-blue-300 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isTransferring ? '...' : 'Transferir'} <ArrowRightCircle size={16} />
                </button>
              </div>
            ))}

            {filteredItems.length === 0 && (
              <div className="py-16 text-center text-slate-400">
                <Package className="mx-auto mb-2 opacity-20" size={48} />
                <p className="font-medium text-lg">Nenhuma solicitação manual pendente.</p>
              </div>
            )}
          </div>
        ) : (
          /* ── DESKTOP: Tabela (>= md) ── */
          <div className="p-8 pt-4">
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
        )}
      </div>

      {/* Details — BottomSheet em mobile, drawer lateral em desktop */}
      {isMobile ? (
        <BottomSheet
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          title={selectedItem?.mo_number}
          maxHeight="85vh"
        >
          {drawerContent}
        </BottomSheet>
      ) : (
        selectedItem && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
              onClick={() => setSelectedItem(null)}
            />
            <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
              <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
                <h3 className="text-xl font-bold">{selectedItem.mo_number}</h3>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  aria-label="Fechar"
                >
                  <Ban size={20} />
                </button>
              </div>
              {drawerContent}
            </div>
          </div>
        )
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
  return (
    <span className={cn(
      "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
      styles[status] || 'bg-gray-100 text-gray-500'
    )}>
      {status}
    </span>
  );
}
