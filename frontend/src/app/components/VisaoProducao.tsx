import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { ProductionViewUI } from './ProductionViewUI';

// ── Types (Internal to Container) ────────────────────────────────
interface MOResult {
  odoo_mo_id: number;
  mo_number: string;
  obra: string | null;
  product_qty: number;
  date_start: string | null;
  state: string;
  has_id_activity: boolean;
}

interface WorkcenterOption {
  id: number;
  name: string;
}

interface TaskOption {
  code: string;
  label: string;
}

interface Blueprints {
  panel_types: Record<string, TaskOption[]>;
  task_labels: Record<string, string>;
}

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

  // Workcenters (mesas do chão de fábrica)
  const [workcenters, setWorkcenters] = useState<WorkcenterOption[]>([]);

  // Blueprints
  const [blueprints, setBluePrints] = useState<Blueprints | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref para cancelar requisições antigas (evita race condition)
  const searchAbortRef = useRef<AbortController | null>(null);

  // History
  const [history, setHistory] = useState<any[]>([]);

  // Load blueprints on mount
  useEffect(() => {
    api.getBlueprints().then(setBluePrints).catch(console.error);
    fetchHistory();

    // Carrega mesas do chão de fábrica (workcenters)
    api.getAndonWorkcenters()
      .then((data: any[]) => setWorkcenters(data.map((wc: any) => ({ id: wc.id, name: wc.name }))))
      .catch(console.error);

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

    // Cancela requisição anterior se ainda estiver em andamento
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearching(true);
    try {
      const data = await api.searchMOs(q, controller.signal);
      // Só atualiza se esta requisição não foi cancelada
      if (!controller.signal.aborted) {
        setResults(data);
        setHasSearched(true);
      }
    } catch (err: any) {
      // Ignora erros de abort (requisição cancelada intencionalmente)
      if (err?.name !== 'AbortError') {
        toast.error('Erro ao buscar fabricações');
      }
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }, []);

  const handleSearchInput = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Debounce maior (500ms) para esperar o usuário terminar de digitar
    debounceRef.current = setTimeout(() => doSearch(val), 500);
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

  // ── Não Consta ──
  const handleNaoConsta = async (requestId: string, items: string[], registradoPor: string) => {
    try {
      await api.reportNaoConsta(requestId, items, registradoPor);
      toast.success('Não Consta registrado com sucesso.', {
        description: `${items.length} item(ns) registrado(s).`,
        duration: 4000,
      });
      // Atualiza o histórico para refletir o badge "Não Consta"
      await fetchHistory();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar Não Consta');
      throw err; // Propaga para o modal não fechar em caso de erro
    }
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
      setRequesterName('');
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

  return (
    <ProductionViewUI
      searchTerm={search}
      setSearchTerm={handleSearchInput}
      onSearch={handleSearchSubmit}
      results={results}
      searching={searching}
      hasSearched={hasSearched}
      selectedMO={selectedMO}
      setSelectedMO={setSelectedMO}
      workcenters={workcenters}
      requesterName={requesterName}
      setRequesterName={setRequesterName}
      panelType={panelType}
      handleSelectPanel={handleSelectPanel}
      selectedTypes={selectedTypes}
      toggleType={toggleType}
      notes={notes}
      setNotes={setNotes}
      handleSubmit={handleSubmit}
      submitting={submitting}
      blueprints={blueprints}
      history={history}
      onNaoConsta={handleNaoConsta}
    />
  );
}
