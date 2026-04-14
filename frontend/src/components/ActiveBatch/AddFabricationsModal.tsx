import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Package, CheckCircle2, Plus, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface MO {
  id: string;       // Odoo ID como string (para compatibilidade com Fabrication)
  mo_number: string;
  obra: string;
  status: string;
  source: string;
}

interface Props {
  batchId: string;
  onClose: () => void;
  onAdded: () => void;
}

export const AddFabricationsModal: React.FC<Props> = ({ batchId, onClose, onAdded }) => {
  const [mos, setMos] = useState<MO[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.getOdooMOs()
      .then((data: MO[]) => setMos(data))
      .catch(() => toast.error('Erro ao carregar fabricações'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return mos.filter(
      m =>
        m.mo_number.toLowerCase().includes(q) ||
        (m.obra || '').toLowerCase().includes(q)
    );
  }, [mos, search]);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selectedIds.size === 0) return;
    setAdding(true);
    try {
      const moIds = Array.from(selectedIds).map(id => parseInt(id));
      const res = await api.addItemsToBatch(batchId, moIds);
      toast.success(res.message || `${res.added_count} fabricação(ões) adicionada(s)`);
      onAdded();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao adicionar fabricações';
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
              <Plus className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-sm">Adicionar Fabricações</h2>
              <p className="text-xs text-slate-500">Selecione as MOs para incluir neste lote</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar por MO ou Obra..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Package className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma fabricação encontrada</p>
            </div>
          ) : (
            filtered.map(mo => {
              const selected = selectedIds.has(mo.id);
              return (
                <button
                  key={mo.id}
                  onClick={() => toggle(mo.id)}
                  className={`w-full flex items-center gap-4 px-6 py-3.5 text-left transition-colors hover:bg-slate-50 active:bg-blue-50/40 ${
                    selected ? 'bg-blue-50/60' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      selected
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-slate-300'
                    }`}
                  >
                    {selected && <CheckCircle2 className="w-3 h-3" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-slate-900 text-sm">{mo.mo_number}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-widest ${
                          mo.source === 'producao'
                            ? 'bg-purple-600 text-white'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        {mo.source === 'producao' ? 'PROD' : 'ODOO'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{mo.obra || '—'}</p>
                  </div>

                  {/* Status */}
                  <span className="text-xs text-slate-400 flex-shrink-0">{mo.status}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <span className="text-sm text-slate-500">
            {selectedIds.size > 0 ? (
              <span className="font-bold text-blue-600">{selectedIds.size} selecionada(s)</span>
            ) : (
              'Nenhuma selecionada'
            )}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={selectedIds.size === 0 || adding}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Adicionar ao Lote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
