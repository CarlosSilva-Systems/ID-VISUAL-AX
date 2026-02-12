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
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SolicitacoesProps {
  onCreateBatch: (items: Fabrication[]) => void;
}

export function Solicitacoes({ onCreateBatch }: SolicitacoesProps) {
  const [items, setItems] = useState<Fabrication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getManualRequests();

      const mapped: Fabrication[] = data.map((req: any) => {
        return {
          id: req.request_id, // Use request_id as primary key here
          mo_number: req.mo_number,
          obra: req.obra_nome || 'Sem Obra',
          product_qty: req.product_qty,
          date_start: req.date_start ? String(req.date_start).split('T')[0] : '',
          sla: 'Urgente', // Manual requests are urgent
          priority: req.priority,
          status: req.status.charAt(0).toUpperCase() + req.status.slice(1), // Capitalize
          mrp_state: 'Em Produção', // Mock or fetch?
          tasks: [],
          docs: { diagrama: true, legenda: true },
          requester_name: req.requester_name,
          notes: req.notes,
          request_id: req.request_id
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

  const handleTransfer = async (item: Fabrication) => {
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

  const [filter, setFilter] = useState<StatusID | 'Hoje' | 'Esta Semana' | 'Atrasadas' | 'Tudo'>('Tudo');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<Fabrication | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.mo_number.toLowerCase().includes(search.toLowerCase()) ||
        item.obra.toLowerCase().includes(search.toLowerCase());

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
    const batchItems = items.filter(item => selectedIds.has(item.id));
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
          {/* Batch actions can remain if still valid for manual flow */}
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
                <th className="p-4 w-12"><input type="checkbox" disabled className="w-4 h-4 rounded border-gray-300" /></th>
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
                  className="group hover:bg-blue-50/20 transition-colors cursor-pointer"
                  onClick={() => setSelectedItem(item)}
                >
                  <td className="p-4"><input type="checkbox" disabled className="w-4 h-4 rounded border-gray-300" /></td>
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
                      <span className="text-xs text-slate-500">{item.obra}</span>
                    </div>
                  </td>
                  <td className="p-4 text-xs font-bold text-slate-600">{new Date(item.date_start).toLocaleDateString()}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleTransfer(item); }}
                      className="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-xs font-bold transition-colors flex items-center gap-1 ml-auto"
                    >
                      Transferir <ArrowRightCircle size={14} />
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
                <p className="font-bold text-slate-800">{selectedItem.obra}</p>
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
