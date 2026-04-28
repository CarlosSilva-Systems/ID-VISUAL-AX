
import React, { useState, useEffect, useRef } from 'react';
import {
  X, Printer, Loader2, Tag, DoorOpen, Terminal, FileSpreadsheet,
  CheckCircle2, AlertCircle, Plus, Trash2, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Fabrication } from '../types';
import {
  fetchPrinters, PrinterInfo,
  fetchDeviceLabels, DeviceLabelItem,
  fetchTerminalLabels, TerminalLabelItem,
  importDevicesExcel, importTerminalsExcel,
  printDevices, printDoorInline, printTerminals,
  createDeviceManual, CreateDevicePayload,
  deleteDevice,
  EplanImportSummary,
} from '../../services/printQueueApi';

// Re-export PrintLabelDrawer content inline (aba Quadro)
import { PrintLabelDrawer } from './PrintLabelDrawer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'quadro' | 'devices' | 'door' | 'terminals';

interface LabelsDrawerProps {
  fabrication: Fabrication;
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1.5 px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[10px] font-bold leading-none">
      {count}
    </span>
  );
}

function PrinterSelect({
  printers,
  value,
  onChange,
  loading,
}: {
  printers: PrinterInfo[];
  value: number | null;
  onChange: (id: number | null) => void;
  loading: boolean;
}) {
  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={13} className="animate-spin" /> Carregando...</div>;
  if (printers.length === 0) return <p className="text-sm text-red-500">Nenhuma impressora ativa.</p>;
  const sel = printers.find(p => p.id === value);
  return (
    <div className="space-y-1">
      <select
        value={value ?? ''}
        onChange={e => onChange(Number(e.target.value) || null)}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      >
        <option value="">Selecione uma impressora...</option>
        {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {sel?.location && <p className="text-[11px] text-slate-400 pl-1">📍 {sel.location}</p>}
    </div>
  );
}

function ImportSummaryBanner({ summary }: { summary: EplanImportSummary }) {
  return (
    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm space-y-1">
      <p className="font-bold text-emerald-700">
        {summary.imported} importado(s) · {summary.updated} atualizado(s) · {summary.skipped} ignorado(s)
      </p>
      {summary.errors.length > 0 && (
        <ul className="text-xs text-red-600 space-y-0.5">
          {summary.errors.map((e, i) => <li key={i}>⚠ {e}</li>)}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Quadro (210-804) — reutiliza PrintLabelDrawer como conteúdo inline
// ---------------------------------------------------------------------------

function TabQuadro({ fabrication, printers, printersLoading }: {
  fabrication: Fabrication;
  printers: PrinterInfo[];
  printersLoading: boolean;
}) {
  // Renderiza o conteúdo do PrintLabelDrawer diretamente (sem o shell do drawer)
  // Para simplificar, abrimos o PrintLabelDrawer como sub-drawer
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Etiqueta técnica interna (210-804) com dados elétricos do quadro e etiqueta externa com QR code.
      </p>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all"
      >
        <Tag size={16} /> Abrir configuração de impressão
      </button>
      {open && (
        <PrintLabelDrawer
          fabrication={fabrication}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente: ManualDeviceForm
// ---------------------------------------------------------------------------

function ManualDeviceForm({ moId, onSuccess, onCancel }: {
  moId: number;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [deviceTag, setDeviceTag] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!deviceTag.trim()) {
      toast.error('Tag do dispositivo é obrigatória');
      return;
    }
    if (!description.trim()) {
      toast.error('Descrição é obrigatória');
      return;
    }

    setSaving(true);
    try {
      const payload: CreateDevicePayload = {
        device_tag: deviceTag.trim(),
        description: description.trim(),
        location: location.trim() || undefined,
      };
      await createDeviceManual(moId, payload);
      toast.success('Dispositivo adicionado com sucesso');
      onSuccess();
    } catch (err) {
      toast.error('Erro ao adicionar: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm text-blue-900">Adicionar Dispositivo Manualmente</h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          ✕ Cancelar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-600 mb-1">Tag *</label>
          <input
            type="text"
            value={deviceTag}
            onChange={e => setDeviceTag(e.target.value)}
            placeholder="ex: K1, DJ1"
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            required
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] font-bold text-slate-600 mb-1">Descrição *</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="ex: Contator principal bomba 1"
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-slate-600 mb-1">Localização (opcional)</label>
        <input
          type="text"
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="ex: QCC-01"
          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-all"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Salvar Dispositivo
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tab: Dispositivos (210-805)
// ---------------------------------------------------------------------------

function TabDevices({ moId, printers, printersLoading }: {
  moId: number;
  printers: PrinterInfo[];
  printersLoading: boolean;
}) {
  const [items, setItems] = useState<DeviceLabelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<EplanImportSummary | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [printer, setPrinter] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDevices();
  }, [moId]);

  async function loadDevices() {
    setLoading(true);
    try {
      const data = await fetchDeviceLabels(moId);
      setItems(data);
    } catch (err) {
      toast.error('Erro ao carregar dispositivos');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setSummary(null);
    try {
      const result = await importDevicesExcel(moId, file);
      setSummary(result);
      await loadDevices();
      setSelected(new Set());
      toast.success(`${result.imported} dispositivos importados`);
    } catch (err) {
      toast.error('Erro ao importar: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handlePrint() {
    if (!printer) { toast.error('Selecione uma impressora.'); return; }
    setPrinting(true);
    try {
      const ids = selected.size > 0 ? Array.from(selected) : undefined;
      const res = await printDevices(moId, printer, ids);
      toast.success(`${res.jobs_created} job(s) criado(s) na fila`);
    } catch (err) {
      toast.error('Erro ao imprimir: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setPrinting(false);
    }
  }

  async function handleDelete(deviceId: number) {
    if (!confirm('Remover este dispositivo?')) return;
    try {
      await deleteDevice(deviceId);
      await loadDevices();
      toast.success('Dispositivo removido');
    } catch (err) {
      toast.error('Erro ao remover: ' + (err instanceof Error ? err.message : 'Erro'));
    }
  }

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  return (
    <div className="space-y-4">
      {/* Botões de ação */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowManualForm(!showManualForm)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} />
          Adicionar Manualmente
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Importar Excel EPLAN
        </button>
      </div>

      {/* Formulário Manual */}
      {showManualForm && (
        <ManualDeviceForm
          moId={moId}
          onSuccess={() => {
            loadDevices();
            setShowManualForm(false);
          }}
          onCancel={() => setShowManualForm(false)}
        />
      )}

      {summary && <ImportSummaryBanner summary={summary} />}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={13} className="animate-spin" /> Carregando...</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nenhum dispositivo importado.</p>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 w-8">
                  <input type="checkbox" checked={selected.size === items.length} onChange={toggleAll} className="rounded" />
                </th>
                <th className="p-2 text-left font-bold text-slate-500">Tag</th>
                <th className="p-2 text-left font-bold text-slate-500">Descrição</th>
                <th className="p-2 text-left font-bold text-slate-500 hidden sm:table-cell">Local</th>
                <th className="p-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 group">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => {
                        const s = new Set(selected);
                        s.has(item.id) ? s.delete(item.id) : s.add(item.id);
                        setSelected(s);
                      }}
                      className="rounded"
                    />
                  </td>
                  <td className="p-2 font-mono font-bold text-slate-800">{item.device_tag}</td>
                  <td className="p-2 text-slate-600">{item.description}</td>
                  <td className="p-2 text-slate-400 hidden sm:table-cell">{item.location ?? '—'}</td>
                  <td className="p-2">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
                      title="Remover"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Impressora + botão */}
      {items.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <PrinterSelect printers={printers} value={printer} onChange={setPrinter} loading={printersLoading} />
          <button
            onClick={handlePrint}
            disabled={printing || !printer}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition-all"
          >
            {printing ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
            {selected.size > 0 ? `Imprimir ${selected.size} selecionado(s)` : 'Imprimir todos'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Porta (210-855)
// ---------------------------------------------------------------------------

function TabDoor({ moId, printers, printersLoading }: {
  moId: number;
  printers: PrinterInfo[];
  printersLoading: boolean;
}) {
  const [equipmentName, setEquipmentName] = useState('');
  const [columns, setColumns] = useState<string[]>(['']);
  const [printer, setPrinter] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);

  const addColumn = () => setColumns(c => [...c, '']);
  const removeColumn = (i: number) => setColumns(c => c.filter((_, idx) => idx !== i));
  const updateColumn = (i: number, v: string) => setColumns(c => c.map((x, idx) => idx === i ? v : x));

  async function handlePrint() {
    if (!printer) { toast.error('Selecione uma impressora.'); return; }
    if (!equipmentName.trim()) { toast.error('Informe o nome do equipamento.'); return; }
    const validCols = columns.filter(c => c.trim());
    if (validCols.length === 0) { toast.error('Adicione ao menos uma posição.'); return; }
    setPrinting(true);
    try {
      const res = await printDoorInline(moId, printer, equipmentName.trim(), validCols);
      toast.success(`Job #${res.job_id} criado na fila`);
    } catch (err) {
      toast.error('Erro ao imprimir: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setPrinting(false);
    }
  }

  const validCols = columns.filter(c => c.trim());

  return (
    <div className="space-y-4">
      {/* Nome do equipamento */}
      <div className="space-y-1">
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Nome do Equipamento</label>
        <input
          type="text"
          value={equipmentName}
          onChange={e => setEquipmentName(e.target.value)}
          placeholder="ex: Bomba 1"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {/* Posições */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Posições</label>
          <button onClick={addColumn} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
            <Plus size={12} /> Adicionar
          </button>
        </div>
        {columns.map((col, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={col}
              onChange={e => updateColumn(i, e.target.value)}
              placeholder={`Posição ${i + 1} (ex: Automático)`}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {columns.length > 1 && (
              <button onClick={() => removeColumn(i)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Preview visual */}
      {equipmentName.trim() && validCols.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-700 text-white text-center py-2 text-sm font-bold">{equipmentName}</div>
          <div className="flex divide-x divide-slate-200">
            {validCols.map((col, i) => (
              <div key={i} className="flex-1 text-center py-3 text-xs font-medium text-slate-700 bg-white">{col}</div>
            ))}
          </div>
        </div>
      )}

      {/* Impressora + botão */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <PrinterSelect printers={printers} value={printer} onChange={setPrinter} loading={printersLoading} />
        <button
          onClick={handlePrint}
          disabled={printing || !printer}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-all"
        >
          {printing ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
          Imprimir Etiqueta de Porta
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Bornes (2009-110)
// ---------------------------------------------------------------------------

function TabTerminals({ moId, printers, printersLoading }: {
  moId: number;
  printers: PrinterInfo[];
  printersLoading: boolean;
}) {
  const [items, setItems] = useState<TerminalLabelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<EplanImportSummary | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [printer, setPrinter] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    fetchTerminalLabels(moId)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [moId]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setSummary(null);
    try {
      const result = await importTerminalsExcel(moId, file);
      setSummary(result);
      const updated = await fetchTerminalLabels(moId);
      setItems(updated);
      setSelected(new Set());
      toast.success(`${result.imported} bornes importados`);
    } catch (err) {
      toast.error('Erro ao importar: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handlePrint() {
    if (!printer) { toast.error('Selecione uma impressora.'); return; }
    setPrinting(true);
    try {
      const ids = selected.size > 0 ? Array.from(selected) : undefined;
      const res = await printTerminals(moId, printer, ids);
      toast.success(`${res.jobs_created} job(s) criado(s) na fila`);
    } catch (err) {
      toast.error('Erro ao imprimir: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setPrinting(false);
    }
  }

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  return (
    <div className="space-y-4">
      {/* Aviso de material */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <AlertCircle size={14} className="shrink-0 mt-0.5" />
        <span>Verifique se o material Brady/Panduit está instalado na impressora antes de imprimir.</span>
      </div>

      {/* Import */}
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Importar Excel EPLAN
        </button>
      </div>

      {summary && <ImportSummaryBanner summary={summary} />}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={13} className="animate-spin" /> Carregando...</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nenhum borne importado.</p>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 w-8">
                  <input type="checkbox" checked={selected.size === items.length} onChange={toggleAll} className="rounded" />
                </th>
                <th className="p-2 text-left font-bold text-slate-500">Borne</th>
                <th className="p-2 text-left font-bold text-slate-500">Fio</th>
                <th className="p-2 text-left font-bold text-slate-500 hidden sm:table-cell">Grupo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => {
                        const s = new Set(selected);
                        s.has(item.id) ? s.delete(item.id) : s.add(item.id);
                        setSelected(s);
                      }}
                      className="rounded"
                    />
                  </td>
                  <td className="p-2 font-mono font-bold text-slate-800">{item.terminal_number}</td>
                  <td className="p-2 text-slate-600">{item.wire_number ?? '—'}</td>
                  <td className="p-2 text-slate-400 hidden sm:table-cell">{item.group_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Impressora + botão */}
      {items.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <PrinterSelect printers={printers} value={printer} onChange={setPrinter} loading={printersLoading} />
          <button
            onClick={handlePrint}
            disabled={printing || !printer}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-xl font-bold text-sm hover:bg-orange-700 disabled:opacity-50 transition-all"
          >
            {printing ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
            {selected.size > 0 ? `Imprimir ${selected.size} selecionado(s)` : 'Imprimir todos'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LabelsDrawer — shell principal com 4 abas
// ---------------------------------------------------------------------------

const TABS: { id: TabId; label: string; sublabel?: string; icon: React.ReactNode }[] = [
  { id: 'quadro',    label: 'Característica Técnica', sublabel: '210-804',  icon: <Tag size={13} /> },
  { id: 'devices',   label: 'Adesivo de Componente',  sublabel: '210-805',  icon: <FileSpreadsheet size={13} /> },
  { id: 'door',      label: 'Porta do Quadro',        sublabel: '210-855',  icon: <DoorOpen size={13} /> },
  { id: 'terminals', label: 'Régua de Borne',         sublabel: '2009-110', icon: <Terminal size={13} /> },
];

export function LabelsDrawer({ fabrication, open, onClose }: LabelsDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('quadro');
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [printersLoading, setPLoading] = useState(false);

  // Contadores para badges
  const [deviceCount, setDeviceCount] = useState(0);
  const [terminalCount, setTerminalCount] = useState(0);

  const moId = fabrication.odoo_mo_id ? Number(fabrication.odoo_mo_id) : 0;

  useEffect(() => {
    if (!open) return;

    // Carrega impressoras uma vez
    setPLoading(true);
    fetchPrinters()
      .then(setPrinters)
      .catch(() => {})
      .finally(() => setPLoading(false));

    // Carrega contadores para badges
    if (moId) {
      fetchDeviceLabels(moId).then(d => setDeviceCount(d.length)).catch(() => {});
      fetchTerminalLabels(moId).then(t => setTerminalCount(t.length)).catch(() => {});
    }
  }, [open, moId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="px-6 pt-5 pb-0 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                <Printer size={10} /> Impressão de Etiquetas
              </div>
              <h3 className="text-lg font-bold text-slate-900 truncate">{fabrication.mo_number}</h3>
              {fabrication.obra && <p className="text-xs text-slate-500 truncate">{fabrication.obra}</p>}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 ml-2 shrink-0">
              <X size={22} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 -mb-px">
            {TABS.map(tab => {
              const count = tab.id === 'devices' ? deviceCount : tab.id === 'terminals' ? terminalCount : 0;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.icon}
                  <div className="flex flex-col items-start">
                    <span className="text-xs font-bold leading-tight">{tab.label}</span>
                    {tab.sublabel && (
                      <span className="text-[10px] text-slate-400 font-medium leading-tight">{tab.sublabel}</span>
                    )}
                  </div>
                  <Badge count={count} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'quadro' && (
            <TabQuadro fabrication={fabrication} printers={printers} printersLoading={printersLoading} />
          )}
          {activeTab === 'devices' && moId > 0 && (
            <TabDevices moId={moId} printers={printers} printersLoading={printersLoading} />
          )}
          {activeTab === 'door' && moId > 0 && (
            <TabDoor moId={moId} printers={printers} printersLoading={printersLoading} />
          )}
          {activeTab === 'terminals' && moId > 0 && (
            <TabTerminals moId={moId} printers={printers} printersLoading={printersLoading} />
          )}
          {moId === 0 && activeTab !== 'quadro' && (
            <p className="text-sm text-slate-400 text-center py-8">MO sem ID Odoo — funcionalidade indisponível.</p>
          )}
        </div>
      </div>
    </div>
  );
}
