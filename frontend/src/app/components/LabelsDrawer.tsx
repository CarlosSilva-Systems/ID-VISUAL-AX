
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
import {
  fetchPresets,
  createPreset,
  deletePreset,
  toggleFavorite,
  incrementUsage,
  DoorLabelPreset,
  CreatePresetPayload,
  PresetFilterType,
} from '../../services/doorPresetsApi';

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
  moId: string;  // UUID como string
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [deviceTag, setDeviceTag] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus no input ao abrir
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!deviceTag.trim()) {
      toast.error('Tag do dispositivo é obrigatória');
      return;
    }

    setSaving(true);
    try {
      const payload: CreateDevicePayload = {
        device_tag: deviceTag.trim().toUpperCase(), // Normaliza para maiúsculas
      };
      await createDeviceManual(moId, payload);
      toast.success(`Tag ${deviceTag.trim().toUpperCase()} adicionada`);
      setDeviceTag(''); // Limpa para próxima entrada
      inputRef.current?.focus(); // Mantém foco para entrada rápida
      onSuccess();
    } catch (err) {
      toast.error('Erro ao adicionar: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-blue-200 rounded-lg p-4 bg-blue-50">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-[10px] font-bold text-slate-600 mb-1.5">Tag do Dispositivo</label>
          <input
            ref={inputRef}
            type="text"
            value={deviceTag}
            onChange={e => setDeviceTag(e.target.value)}
            placeholder="ex: K1, DJ1, KA1..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
            disabled={saving}
          />
          <p className="text-[10px] text-slate-500 mt-1">Pressione Enter para adicionar rapidamente</p>
        </div>
        <div className="flex gap-2 pt-5">
          <button
            type="submit"
            disabled={saving || !deviceTag.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Adicionar
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-600 hover:bg-white transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tab: Dispositivos (210-805)
// ---------------------------------------------------------------------------

function TabDevices({ moId, printers, printersLoading }: {
  moId: string;  // UUID como string
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
// Componente: PresetCard
// ---------------------------------------------------------------------------

function PresetCard({ preset, isSelected, onSelect, onToggleFavorite }: {
  preset: DoorLabelPreset;
  isSelected: boolean;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  const getCategoryIcon = () => {
    switch (preset.category) {
      case 'sinaleira': return '💡';
      case 'botoeira-3pos': return '🎛️';
      case 'botoeira-2pos': return '🔘';
      default: return '📋';
    }
  };

  const getCategoryLabel = () => {
    switch (preset.category) {
      case 'sinaleira': return 'Sinaleira';
      case 'botoeira-3pos': return 'Botoeira 3P';
      case 'botoeira-2pos': return 'Botoeira 2P';
      default: return 'Personalizado';
    }
  };

  return (
    <button
      onClick={onSelect}
      className={`relative p-3 rounded-lg border-2 transition-all text-left ${
        isSelected
          ? 'border-blue-600 bg-blue-50'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      {/* Badge de favorito */}
      <button
        onClick={onToggleFavorite}
        className={`absolute top-2 right-2 p-1 rounded transition-colors ${
          preset.is_favorite
            ? 'text-yellow-500 hover:text-yellow-600'
            : 'text-slate-300 hover:text-slate-400'
        }`}
      >
        {preset.is_favorite ? '⭐' : '☆'}
      </button>

      {/* Ícone e categoria */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{getCategoryIcon()}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            {getCategoryLabel()}
          </div>
          <div className="text-xs font-bold text-slate-800 truncate pr-6">
            {preset.name}
          </div>
        </div>
      </div>

      {/* Preview de colunas */}
      {preset.columns.length > 0 && (
        <div className="flex gap-1 mb-2">
          {preset.columns.map((col, i) => (
            <div
              key={i}
              className="flex-1 text-center py-1 px-1 bg-slate-100 rounded text-[9px] font-bold text-slate-600 truncate"
            >
              {col}
            </div>
          ))}
        </div>
      )}

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {preset.is_system && (
          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[9px] font-bold">
            Sistema
          </span>
        )}
        {preset.is_shared && !preset.is_system && (
          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-bold">
            Compartilhado
          </span>
        )}
        {preset.usage_count > 0 && (
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">
            {preset.usage_count} uso{preset.usage_count > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Componente: PresetCreatorModal
// ---------------------------------------------------------------------------

function PresetCreatorModal({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'sinaleira' | 'botoeira-3pos' | 'botoeira-2pos' | 'custom'>('botoeira-3pos');
  const [equipmentName, setEquipmentName] = useState('');
  const [columns, setColumns] = useState<string[]>(['MAN', 'O', 'AUT']);
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);

  const addColumn = () => setColumns(c => [...c, '']);
  const removeColumn = (i: number) => setColumns(c => c.filter((_, idx) => idx !== i));
  const updateColumn = (i: number, v: string) => setColumns(c => c.map((x, idx) => idx === i ? v : x));

  useEffect(() => {
    // Atualiza colunas padrão ao mudar categoria
    if (category === 'botoeira-3pos') {
      setColumns(['MAN', 'O', 'AUT']);
    } else if (category === 'botoeira-2pos') {
      setColumns(['MAN', 'AUT']);
    } else if (category === 'sinaleira') {
      setColumns([]);
    }
  }, [category]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Nome do preset é obrigatório');
      return;
    }

    setSaving(true);
    try {
      const payload: CreatePresetPayload = {
        name: name.trim(),
        category,
        equipment_name: equipmentName.trim(),
        columns: columns.filter(c => c.trim()).map(c => c.trim()),
        rows: 1,
        is_shared: isShared,
      };
      await createPreset(payload);
      toast.success('Preset criado com sucesso');
      onSuccess();
    } catch (err) {
      toast.error('Erro ao criar preset: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-800">Criar Novo Preset</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Nome do Preset *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex: Bomba Recalque 3P"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Categoria *
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="sinaleira">💡 Sinaleira</option>
              <option value="botoeira-3pos">🎛️ Botoeira 3 Posições</option>
              <option value="botoeira-2pos">🔘 Botoeira 2 Posições</option>
              <option value="custom">📋 Personalizado</option>
            </select>
          </div>

          {/* Nome do Equipamento */}
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Nome do Equipamento {category !== 'sinaleira' && '(opcional)'}
            </label>
            <input
              type="text"
              value={equipmentName}
              onChange={e => setEquipmentName(e.target.value)}
              placeholder={category === 'sinaleira' ? 'ex: COMANDO ENERGIZADO' : 'Deixe vazio para customizar ao usar'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              {category === 'sinaleira'
                ? 'Nome fixo da sinaleira'
                : 'Se vazio, será solicitado ao usar o preset'}
            </p>
          </div>

          {/* Colunas/Posições */}
          {category !== 'sinaleira' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                  Posições/Colunas
                </label>
                <button
                  type="button"
                  onClick={addColumn}
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  <Plus size={12} /> Adicionar
                </button>
              </div>
              <div className="space-y-2">
                {columns.map((col, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={col}
                      onChange={e => updateColumn(i, e.target.value)}
                      placeholder={`Posição ${i + 1}`}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {columns.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeColumn(i)}
                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compartilhar */}
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
            <input
              type="checkbox"
              id="share-preset"
              checked={isShared}
              onChange={e => setIsShared(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="share-preset" className="text-sm text-slate-700 cursor-pointer">
              <span className="font-bold">Compartilhar com equipe</span>
              <p className="text-xs text-slate-500">Outros usuários poderão ver e usar este preset</p>
            </label>
          </div>

          {/* Preview */}
          {(equipmentName.trim() || columns.some(c => c.trim())) && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-700 text-white text-center py-2 text-sm font-bold">
                {equipmentName.trim() || 'EQUIPAMENTO'}
              </div>
              {columns.filter(c => c.trim()).length > 0 && (
                <div className="flex divide-x divide-slate-200">
                  {columns.filter(c => c.trim()).map((col, i) => (
                    <div key={i} className="flex-1 text-center py-2 text-xs font-medium text-slate-700 bg-white">
                      {col}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3 pt-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Criar Preset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-300 rounded-lg font-bold text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Porta (210-855) - Sistema de Presets
// ---------------------------------------------------------------------------

function TabDoor({ moId, printers, printersLoading }: {
  moId: string;  // UUID como string
  printers: PrinterInfo[];
  printersLoading: boolean;
}) {
  const [presets, setPresets] = useState<DoorLabelPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<PresetFilterType>('all');
  const [selectedPreset, setSelectedPreset] = useState<DoorLabelPreset | null>(null);
  const [customEquipmentName, setCustomEquipmentName] = useState('');
  const [printer, setPrinter] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const [showCreator, setShowCreator] = useState(false);

  useEffect(() => {
    loadPresets();
  }, [filterType]);

  async function loadPresets() {
    setLoading(true);
    try {
      const data = await fetchPresets(filterType);
      setPresets(data);
    } catch (err) {
      toast.error('Erro ao carregar presets');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPreset(preset: DoorLabelPreset) {
    setSelectedPreset(preset);
    setCustomEquipmentName(preset.equipment_name);
  }

  async function handleToggleFavorite(presetId: number, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const result = await toggleFavorite(presetId);
      setPresets(prev => prev.map(p =>
        p.id === presetId ? { ...p, is_favorite: result.is_favorite } : p
      ));
      toast.success(result.is_favorite ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
    } catch (err) {
      toast.error('Erro ao atualizar favorito');
    }
  }

  async function handlePrint() {
    if (!printer) { toast.error('Selecione uma impressora.'); return; }
    if (!selectedPreset) { toast.error('Selecione um preset.'); return; }

    const equipmentName = customEquipmentName.trim() || selectedPreset.equipment_name;
    if (!equipmentName && selectedPreset.category !== 'sinaleira') {
      toast.error('Informe o nome do equipamento.');
      return;
    }

    setPrinting(true);
    try {
      // Incrementa contador de uso
      await incrementUsage(selectedPreset.id);

      // Enfileira impressão
      const res = await printDoorInline(moId, printer, equipmentName, selectedPreset.columns);
      toast.success(`Job #${res.job_id} criado na fila`);

      // Atualiza contador local
      setPresets(prev => prev.map(p =>
        p.id === selectedPreset.id ? { ...p, usage_count: p.usage_count + 1 } : p
      ));
    } catch (err) {
      toast.error('Erro ao imprimir: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setPrinting(false);
    }
  }

  const filteredPresets = presets;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'system', 'mine', 'team', 'favorites'] as PresetFilterType[]).map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === type
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {type === 'all' && 'Todos'}
            {type === 'system' && '🏢 Sistema'}
            {type === 'mine' && '👤 Meus'}
            {type === 'team' && '👥 Equipe'}
            {type === 'favorites' && '⭐ Favoritos'}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setShowCreator(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
        >
          <Plus size={12} />
          Criar Preset
        </button>
      </div>

      {/* Grid de Presets */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-8">
          <Loader2 size={16} className="animate-spin" /> Carregando presets...
        </div>
      ) : filteredPresets.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-slate-400 mb-3">Nenhum preset encontrado</p>
          {filterType !== 'all' && (
            <button
              onClick={() => setFilterType('all')}
              className="text-xs text-blue-600 hover:text-blue-700 font-bold"
            >
              Ver todos os presets
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredPresets.map(preset => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isSelected={selectedPreset?.id === preset.id}
              onSelect={() => handleSelectPreset(preset)}
              onToggleFavorite={(e) => handleToggleFavorite(preset.id, e)}
            />
          ))}
        </div>
      )}

      {/* Formulário de Customização */}
      {selectedPreset && selectedPreset.equipment_name === '' && (
        <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-2">
          <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
            Nome do Equipamento *
          </label>
          <input
            type="text"
            value={customEquipmentName}
            onChange={e => setCustomEquipmentName(e.target.value)}
            placeholder="ex: RECALQUE, BOMBA 1"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-[10px] text-slate-500">
            Este preset requer um nome personalizado
          </p>
        </div>
      )}

      {/* Preview */}
      {selectedPreset && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-700 text-white text-center py-2 text-sm font-bold">
            {customEquipmentName || selectedPreset.equipment_name || 'EQUIPAMENTO'}
          </div>
          {selectedPreset.columns.length > 0 && (
            <div className="flex divide-x divide-slate-200">
              {selectedPreset.columns.map((col, i) => (
                <div key={i} className="flex-1 text-center py-3 text-xs font-medium text-slate-700 bg-white">
                  {col}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Impressora + botão */}
      {selectedPreset && (
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
      )}

      {/* Modal de Criação */}
      {showCreator && (
        <PresetCreatorModal
          onClose={() => setShowCreator(false)}
          onSuccess={() => {
            loadPresets();
            setShowCreator(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Bornes (2009-110)
// ---------------------------------------------------------------------------

function TabTerminals({ moId, printers, printersLoading }: {
  moId: string;  // UUID como string
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

  const moId = fabrication.odoo_mo_id || '';  // UUID como string

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
            <TabQuadro 
              fabrication={fabrication} 
              printers={printers} 
              printersLoading={printersLoading} 
            />
          )}
          {activeTab === 'devices' && moId && (
            <TabDevices 
              moId={moId} 
              printers={printers} 
              printersLoading={printersLoading} 
            />
          )}
          {activeTab === 'door' && moId && (
            <TabDoor moId={moId} printers={printers} printersLoading={printersLoading} />
          )}
          {activeTab === 'terminals' && moId && (
            <TabTerminals moId={moId} printers={printers} printersLoading={printersLoading} />
          )}
          {!moId && activeTab !== 'quadro' && (
            <p className="text-sm text-slate-400 text-center py-8">MO sem ID Odoo — funcionalidade indisponível.</p>
          )}
        </div>
      </div>
    </div>
  );
}
