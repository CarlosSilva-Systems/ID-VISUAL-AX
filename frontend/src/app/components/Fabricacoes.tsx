import React, { useState, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  Plus,
  ChevronRight,
  ExternalLink,
  FileText,
  CheckCircle2,
  AlertCircle,
  History,
  Database,
  ArrowRight,
  Package,
  Layers
} from 'lucide-react';
import { Fabrication, MOCK_FABRICATIONS, MRPState, StatusID } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Fabricacoes() {
  const [items, setItems] = useState<Fabrication[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'Esta Semana' | 'Hoje' | 'Sem Data' | 'Atrasadas' | 'Tudo'>('Esta Semana');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<Fabrication | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.mo_number.toLowerCase().includes(search.toLowerCase()) ||
        item.obra.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      return true;
    });
  }, [items, search]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page Header */}
      <div className="px-8 py-6 bg-white border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Fabricações (MRP)</h2>
          <p className="text-sm text-slate-500">Gestão de ordens de fabricação sincronizadas do Odoo.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2">
            <RefreshCw size={18} /> Sincronizar
          </button>
          <button
            disabled={selectedIds.size === 0}
            className={cn(
              "px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all shadow-md active:scale-95",
              selectedIds.size > 0
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
            )}
          >
            Adicionar ao Lote <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="px-8 py-4 bg-slate-50 border-b border-gray-100 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {['Esta Semana', 'Hoje', 'Sem Data', 'Atrasadas', 'Tudo'].map((f) => (
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

      {/* Table Section */}
      <div className="flex-1 overflow-auto bg-white p-8 pt-4">
        <div className="rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-100">
                <th className="p-4 w-12 text-center">
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                </th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">MO (Fabricação)</th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Obra / Cliente</th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Qtd</th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Agendado</th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Estado MRP</th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">ID Visual</th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Docs</th>
                <th className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                  </td>
                  <td className="p-4">
                    <div>
                      <span className="font-bold text-slate-900">{item.mo_number}</span>
                      {item.product_name && (
                        <div className="text-xs text-slate-600 mt-0.5">{item.product_name}</div>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm font-bold text-slate-700 truncate max-w-[180px]">{item.obra}</div>
                  </td>
                  <td className="p-4 text-center">
                    <span className="text-sm font-bold text-slate-600">{item.product_qty}</span>
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-800">{item.date_start}</span>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{item.sla}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <MRPBadge state={item.mrp_state} />
                  </td>
                  <td className="p-4 text-center">
                    <IDStatusChip status={item.status} />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className={cn("w-2 h-2 rounded-full", item.docs.diagrama ? 'bg-emerald-500' : 'bg-rose-500')} title="Diagrama" />
                      <div className={cn("w-2 h-2 rounded-full", item.docs.legenda ? 'bg-emerald-500' : 'bg-rose-500')} title="Legenda" />
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setSelectedItem(item)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Abrir Detalhe"
                      >
                        <ExternalLink size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalhe Fabricação View */}
      {selectedItem && (
        <FabricacaoDetalhe item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}

function FabricacaoDetalhe({ item, onClose }: { item: Fabrication, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-[#F1F5F9] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronRight size={24} className="rotate-180" />
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">Detalhe da Fabricação: {item.mo_number}</h2>
            <MRPBadge state={item.mrp_state} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            Sincronizar
          </button>
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md">
            Adicionar ao Lote
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column (60%) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Card Resumo */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-6">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 border-b border-gray-50 pb-4">
                <Database size={18} className="text-blue-500" /> Resumo da Ordem (Odoo)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <DataField label="Nº Fabricação" value={item.mo_number} />
                <DataField label="Obra / Cliente" value={item.obra} />
                <DataField label="Quantidade" value={`${item.product_qty} un`} />
                <DataField label="Estado MRP" value={item.mrp_state} />
                <DataField label="Data Agendada" value={item.date_start} />
                <DataField label="SLA Produção" value={item.sla} />
              </div>
            </div>

            {/* Card Solicitação ID */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <Tag size={18} className="text-indigo-500" /> Solicitação de Identificação
                </div>
                <IDStatusChip status={item.status} />
              </div>

              {item.status === 'Sem Solicitação' ? (
                <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                    <Plus size={32} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-700">Nenhuma solicitação encontrada</p>
                    <p className="text-xs text-slate-400 max-w-xs">A produção ainda não solicitou identificação para esta fabricação.</p>
                  </div>
                  <button className="px-8 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-600/20">
                    Criar Solicitação de ID
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-black">
                        {item.packageType?.charAt(0) || 'P'}
                      </div>
                      <div>
                        <p className="text-sm font-black text-indigo-700">{item.packageType || 'Personalizado'}</p>
                        <p className="text-[10px] text-indigo-500 font-medium">Pacote configurado pelo operador</p>
                      </div>
                    </div>
                    <button className="text-[10px] font-black text-indigo-600 uppercase border-b border-indigo-200">Alterar Pacote</button>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Caixinhas (Checklist do quadro)</p>
                    <div className="flex flex-wrap gap-2">
                      {['Diagrama+Legenda', '210-804', '210-805', 'EFZ Tag Cabo', 'QA Final'].map((label, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg">
                          <div className={cn("w-2 h-2 rounded-full", label === 'Diagrama+Legenda' ? 'bg-emerald-500' : 'bg-slate-200')} />
                          <span className="text-xs font-bold text-slate-600">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (40%) */}
          <div className="space-y-8">
            {/* Card Documentos */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
                <FileText size={18} className="text-amber-500" /> Documentos Prontidão
              </div>
              <DocRow label="Diagrama Elétrico" status={item.docs.diagrama} />
              <DocRow label="Legenda de Componentes" status={item.docs.legenda} />
              <button className="w-full mt-4 py-2 border-2 border-dashed border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:border-rose-200 hover:text-rose-500 transition-all">
                Reportar Prontidão Incompleta
              </button>
            </div>

            {/* Card Histórico */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
                <History size={18} className="text-slate-400" /> Histórico Operacional
              </div>
              <div className="space-y-4">
                {item.history?.map((log, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 leading-tight">{log.action}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{log.date} • {log.user}</p>
                    </div>
                  </div>
                ))}
                {!item.history && <p className="text-xs text-slate-400 italic text-center py-4">Sem eventos registrados.</p>}
              </div>
            </div>

            {/* Card Ações Rápidas */}
            <div className="bg-slate-800 rounded-2xl p-6 shadow-lg shadow-slate-900/20 text-white space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ações de Produção</p>
              <button className="w-full py-3 bg-white text-slate-900 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-95">
                <Plus size={18} /> Adicionar ao Lote
              </button>
              <button className="w-full py-3 bg-slate-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-600 transition-all active:scale-95">
                <AlertCircle size={18} /> Reportar Bloqueio
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MRPBadge({ state }: { state: MRPState }) {
  const styles = {
    Confirmado: 'bg-blue-100 text-blue-700',
    'Em Produção': 'bg-amber-100 text-amber-700',
    Pronto: 'bg-emerald-100 text-emerald-700',
    Concluído: 'bg-slate-100 text-slate-500',
    Cancelado: 'bg-rose-100 text-rose-700',
  };
  return <span className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider whitespace-nowrap", styles[state])}>{state}</span>;
}

function IDStatusChip({ status }: { status: StatusID }) {
  const styles: Record<string, string> = {
    Nova: 'text-blue-600 bg-blue-50 border-blue-100',
    Triagem: 'text-amber-600 bg-amber-50 border-amber-100',
    'Em Lote': 'text-indigo-600 bg-indigo-50 border-indigo-100',
    Bloqueada: 'text-rose-600 bg-rose-50 border-rose-100',
    Concluída: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    'Sem Solicitação': 'text-slate-400 bg-slate-50 border-slate-100',
  };
  const currentStyle = styles[status] || 'text-slate-400 bg-slate-50 border-slate-100';
  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-tighter", currentStyle)}>
      <div className={cn("w-1.5 h-1.5 rounded-full", status === 'Sem Solicitação' ? 'bg-slate-300' : currentStyle.replace('text-', 'bg-').split(' ')[0])} />
      {status === 'Sem Solicitação' ? 'SEM SOLIC.' : status}
    </div>
  );
}

function DataField({ label, value }: { label: string, value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{label}</p>
      <p className="text-sm font-bold text-slate-800 truncate">{value}</p>
    </div>
  );
}

function DocRow({ label, status }: { label: string, status: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
      <div className="flex items-center gap-3">
        <div className={cn("w-2 h-2 rounded-full", status ? 'bg-emerald-500' : 'bg-rose-500')} />
        <span className="text-xs font-bold text-slate-700">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("text-[9px] font-black uppercase tracking-widest", status ? 'text-emerald-600' : 'text-rose-600')}>
          {status ? 'OK' : 'FALTA'}
        </span>
        <button className="p-1 hover:bg-white rounded transition-colors text-slate-300 hover:text-blue-500">
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  );
}
