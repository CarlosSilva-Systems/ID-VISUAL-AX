import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Scan,
  Send,
  AlertTriangle,
  Clock,
  CheckCircle2,
  X,
  ArrowRight,
  ChevronRight,
  Loader2,
  Factory,
  ShieldCheck,
  Info,
  Wrench,
} from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────
interface MOResult {
  odoo_mo_id: number;
  mo_number: string;
  obra: string | null;
  product_qty: number;
  date_start: string | null;
  state: string;
  has_id_activity: boolean;
}

interface TaskOption {
  code: string;
  label: string;
}

interface Blueprints {
  panel_types: Record<string, TaskOption[]>;
  task_labels: Record<string, string>;
}

const PANEL_LABELS: Record<string, string> = {
  comando: 'Comando',
  distribuicao: 'Distribuição',
  apartamento: 'Apartamento',
  custom: 'Personalizado',
};

const STATE_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  confirmed: 'Confirmado',
  progress: 'Em Produção',
  to_close: 'A Fechar',
};

// ── Component ────────────────────────────────────────────────────
export function VisaoProducao() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<MOResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Modal state
  const [selectedMO, setSelectedMO] = useState<MOResult | null>(null);
  const [panelType, setPanelType] = useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [requesterName, setRequesterName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Blueprints
  const [blueprints, setBluePrints] = useState<Blueprints | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // History
  const [history, setHistory] = useState<any[]>([]);

  // Load blueprints on mount
  useEffect(() => {
    api.getBlueprints().then(setBluePrints).catch(console.error);
    fetchHistory();

    // Poll history every 30s
    const interval = setInterval(fetchHistory, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchHistory = async () => {
    try {
      const data = await api.getProductionRequests(10, 0); // Limit 10 for compact view
      setHistory(data);
    } catch (err) {
      console.error('Failed to fetch history', err);
    }
  };

  // Listen for updates
  useEffect(() => {
    const handleUpdate = () => fetchHistory();
    window.addEventListener('manual-request-updated', handleUpdate);
    return () => window.removeEventListener('manual-request-updated', handleUpdate);
  }, []);

  // ── Search with debounce ──
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    try {
      const data = await api.searchMOs(q);
      setResults(data);
      setHasSearched(true);
    } catch {
      toast.error('Erro ao buscar fabricações');
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchInput = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(search);
  };

  // ── Panel type selection → pre-fill checkboxes ──
  const handleSelectPanel = (type: string) => {
    setPanelType(type);
    if (!blueprints) return;
    const codes = blueprints.panel_types[type] || [];
    // Pre-select all allowed tasks EXCEPT QA_FINAL (auto-added by backend)
    setSelectedTypes(new Set(codes.map(c => c.code).filter(c => c !== 'QA_FINAL')));
  };

  const toggleType = (code: string) => {

    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // ── Submit request ──
  const handleSubmit = async () => {
    if (!selectedMO || !panelType || !requesterName.trim()) return;

    setSubmitting(true);
    try {
      const result = await api.createManualRequest({
        odoo_mo_id: selectedMO.odoo_mo_id,
        panel_type: panelType,
        id_types: Array.from(selectedTypes),
        requester_name: requesterName.trim(),
        notes: notes.trim() || undefined,
      });

      if (result.is_duplicate) {
        toast.warning('Solicitação já existe — nota adicionada', {
          description: `MO ${result.mo_number} já tem pedido aberto.`,
          duration: 5000,
        });
      } else {
        toast.success('Solicitação enviada para ID Visual!', {
          description: `${result.mo_number} — Urgente`,
          duration: 4000,
        });
      }

      // Trigger badge update
      window.dispatchEvent(new Event('manual-request-updated'));

      // Reset
      setSelectedMO(null);
      setPanelType(null);
      setSelectedTypes(new Set());
      setNotes('');
      setSearch('');
      setResults([]);
      setHasSearched(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar solicitação');
    } finally {
      setSubmitting(false);
    }
  };

  const closeModal = () => {
    setSelectedMO(null);
    setPanelType(null);
    setSelectedTypes(new Set());
    setNotes('');
  };

  // Current tasks for selected panel
  const currentTasks: TaskOption[] = panelType && blueprints
    ? (blueprints.panel_types[panelType] || []).filter(t => t.code !== 'QA_FINAL')
    : [];

  const canSubmit = !!selectedMO && !!panelType && requesterName.trim().length >= 2 && selectedTypes.size > 0;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Search Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-50 text-amber-700 rounded-full text-xs font-bold border border-amber-100 mb-2">
          <Factory size={14} /> Visão Produção
        </div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Solicitar ID Visual</h2>
        <p className="text-slate-500 font-medium">Digite o número da fabricação para solicitar identificação.</p>

        <form onSubmit={handleSearchSubmit} className="relative max-w-lg mx-auto mt-8">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Search size={24} />
          </div>
          <input
            type="text"
            placeholder="Número da fabricação (ex: 1598)..."
            value={search}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="w-full pl-14 pr-32 py-5 bg-white rounded-2xl border-2 border-slate-200 text-xl font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all shadow-xl shadow-slate-200/50"
            autoFocus
          />
          <button
            type="submit"
            disabled={searching}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white px-5 py-3 rounded-xl hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-2 font-bold disabled:opacity-60"
          >
            {searching ? <Loader2 size={20} className="animate-spin" /> : <Scan size={20} />}
            Procurar
          </button>
        </form>
      </div>

      {/* Search Results */}
      {searching && (
        <div className="py-12 flex flex-col items-center text-slate-400">
          <Loader2 size={40} className="animate-spin mb-3" />
          <p className="font-medium">Buscando no Odoo...</p>
        </div>
      )}

      {!searching && hasSearched && results.length === 0 && (
        <div className="py-12 flex flex-col items-center text-slate-400">
          <Search size={48} className="mb-3 opacity-30" />
          <p className="font-bold text-lg">Nenhuma fabricação encontrada</p>
          <p className="text-sm">Verifique o número e tente novamente</p>
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle2 size={14} /> {results.length} resultado(s)
          </h3>
          {results.map((mo) => (
            <button
              key={mo.odoo_mo_id}
              onClick={() => setSelectedMO(mo)}
              className="w-full bg-white p-5 rounded-2xl border-2 border-slate-100 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-50 transition-all text-left group flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                  <Factory size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg font-black text-slate-900">{mo.mo_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${mo.state === 'progress' ? 'bg-blue-50 text-blue-600' :
                      mo.state === 'confirmed' ? 'bg-amber-50 text-amber-600' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                      {STATE_LABELS[mo.state] || mo.state}
                    </span>
                    {mo.has_id_activity ? (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold flex items-center gap-1">
                        <ShieldCheck size={10} /> Na fila ID
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-orange-50 text-orange-500 rounded-full text-[10px] font-bold flex items-center gap-1">
                        <AlertTriangle size={10} /> Fora da fila
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 font-medium">{mo.obra || 'Sem obra definida'}</p>
                  <div className="flex items-center gap-4 mt-1 text-[11px] text-slate-400 font-medium">
                    <span>Qtd: {mo.product_qty}</span>
                    <span>Início: {mo.date_start || 'Sem data'}</span>
                  </div>
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
            </button>
          ))}
        </div>
      )}

      {/* Idle State */}
      {!searching && !hasSearched && (
        <div className="py-20 flex flex-col items-center justify-center text-slate-300">
          <Scan size={80} className="mb-4 opacity-20" />
          <p className="text-xl font-bold">Aguardando busca...</p>
        </div>
      )}

      {/* ── Request Modal ── */}
      {selectedMO && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200 max-h-[90vh] flex flex-col">
            <div className="p-8 space-y-6 overflow-y-auto flex-1">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">Solicitar ID Visual</h3>
                  <p className="text-sm text-slate-500 font-medium mt-1">
                    {selectedMO.mo_number} — {selectedMO.obra || 'Sem obra'}
                  </p>
                </div>
                <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                  <X size={28} />
                </button>
              </div>

              {/* Warning for MOs outside queue */}
              {!selectedMO.has_id_activity && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <Info size={20} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">Fora da fila padrão</p>
                    <p className="text-xs text-amber-600 mt-0.5">Essa MO não tem atividade "Imprimir ID Visual" ativa no Odoo.</p>
                  </div>
                </div>
              )}

              {/* 1. Requester Name */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nome do Solicitante *</label>
                <input
                  type="text"
                  placeholder="Seu nome completo"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  className="w-full p-4 rounded-xl bg-slate-50 border-2 border-slate-100 font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              {/* 2. Panel Type */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Tipo do Quadro *</label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(PANEL_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => handleSelectPanel(key)}
                      className={`p-4 rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between group ${panelType === key
                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                        : 'border-slate-100 text-slate-700 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <Wrench size={16} className={panelType === key ? 'text-blue-500' : 'text-slate-400'} />
                        {label}
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${panelType === key ? 'border-blue-600 bg-blue-600' : 'border-slate-200'
                        }`}>
                        {panelType === key && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. ID Types (shown after panel selection) */}
              {panelType && currentTasks.length > 0 && (
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    IDs Visuais ({selectedTypes.size} selecionadas)
                  </label>
                  <div className="space-y-2">
                    {currentTasks.map((task) => {
                      const isLocked = false;
                      const isChecked = selectedTypes.has(task.code);
                      return (
                        <button
                          key={task.code}
                          onClick={() => toggleType(task.code)}
                          disabled={isLocked}
                          className={`w-full p-3 rounded-xl border-2 text-left font-medium text-sm flex items-center justify-between transition-all ${isChecked
                            ? 'border-blue-400 bg-blue-50 text-blue-700'
                            : 'border-slate-100 text-slate-600 hover:border-slate-200'
                            } ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isChecked ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                              }`}>
                              {isChecked && (
                                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12">
                                  <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                            <span>{task.label}</span>
                          </div>
                          {isLocked && (
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Obrigatório</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <ShieldCheck size={12} /> QA Final será adicionado automaticamente
                  </p>
                </div>
              )}

              {/* 4. Notes */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Descrição / Observação (Opcional)</label>
                <input
                  type="text"
                  placeholder="Algum detalhe extra? (ex: urgente, s/ porta)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-4 rounded-xl bg-slate-50 border border-slate-100 font-medium focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                />
              </div>

              {/* Urgency banner */}
              <div className="flex items-center gap-3 p-4 bg-rose-50 rounded-2xl border border-rose-100">
                <AlertTriangle className="text-rose-500 shrink-0" size={20} />
                <div>
                  <p className="text-sm font-black text-rose-900">Solicitação Urgente</p>
                  <p className="text-[11px] text-rose-600 font-medium">Aparece com prioridade no painel do operador ID Visual</p>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="p-8 pt-0">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="w-full py-5 bg-blue-600 text-white rounded-[1.5rem] text-xl font-black uppercase tracking-tight shadow-xl shadow-blue-600/30 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {submitting ? (
                  <><Loader2 size={24} className="animate-spin" /> Enviando...</>
                ) : (
                  <>Solicitar (Urgente) <ArrowRight size={24} /></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Search Results ── */}
      {/* ... existing code ... */}

      {/* ── History Section ── */}
      {!searching && !hasSearched && history.length > 0 && (
        <div className="pt-8 border-t border-slate-100 animate-in slide-in-from-bottom-4 duration-700">
          <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
            <Clock size={24} className="text-blue-600" />
            Meus Pedidos Recentes
          </h3>
          <div className="grid gap-3">
            {history.map((req) => (
              <div key={req.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between hover:border-blue-200 transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-slate-800 text-lg">{req.mo_number}</span>
                    {req.production_status === 'done' ? (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold uppercase tracking-wider">Concluído</span>
                    ) : req.production_status === 'in_progress' ? (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold uppercase tracking-wider">Em Produção</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-bold uppercase tracking-wider">Aguardando</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
                    <span>{new Date(req.created_at).toLocaleString('pt-BR')}</span>
                    <span>•</span>
                    <span className="uppercase">{PANEL_LABELS[req.package_code] || req.package_code}</span>
                  </div>
                  {req.notes && <div className="text-xs text-slate-400 mt-1 italic">"{req.notes}"</div>}
                </div>
                {req.production_status === 'done' ? (
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 size={20} />
                  </div>
                ) : (
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${req.production_status === 'in_progress' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                    <Clock size={20} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
