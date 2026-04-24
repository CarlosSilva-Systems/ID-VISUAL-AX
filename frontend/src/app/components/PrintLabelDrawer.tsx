import React, { useState, useEffect } from 'react';
import {
  X, Printer, Loader2, Tag, QrCode, FileText, Layers,
  CheckCircle2, AlertCircle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Fabrication } from '../types';
import { api } from '../../services/api';
import {
  fetchPrinters,
  createPrintJob,
  PrinterInfo,
  CreatePrintJobRequest,
} from '../../services/printQueueApi';
import { usePrintJobStatus } from '../../hooks/usePrintJobStatus';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PrintLabelDrawerProps {
  fabrication: Fabrication;
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveFabCode(moNumber: string): string {
  const parts = moNumber.split('/');
  const last = parts[parts.length - 1]?.trim();
  if (!last || !/^\d+$/.test(last)) return '';
  return `FAB${last}`;
}

function buildPublicUrl(path: string): string {
  const apiUrl = (import.meta as any).env.VITE_API_URL as string | undefined;
  let origin = window.location.origin;
  if (apiUrl) {
    try { origin = new URL(apiUrl).origin; } catch { /* noop */ }
  }
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

// ---------------------------------------------------------------------------
// Field sub-component
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  value: string;
  readOnly?: boolean;
  placeholder?: string;
  onChange?: (v: string) => void;
  hint?: string;
  loading?: boolean;
}

function Field({ label, value, readOnly, placeholder, onChange, hint, loading }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
        {label}
      </label>
      {readOnly ? (
        <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 min-h-[38px]">
          {value || <span className="text-slate-400 font-normal">—</span>}
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors placeholder:text-slate-400 pr-8"
          />
          {loading && (
            <Loader2 size={13} className="animate-spin text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
          )}
        </div>
      )}
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JobStatusBanner — exibido após criar o job
// ---------------------------------------------------------------------------

function JobStatusBanner({
  jobId,
  onRetry,
}: {
  jobId: number;
  onRetry: () => void;
}) {
  const { status, isDone, isFailed, failedReason } = usePrintJobStatus(jobId);

  if (!status || status === 'pending' || status === 'processing') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
        <Loader2 size={16} className="animate-spin text-blue-500 shrink-0" />
        <span className="text-sm font-medium text-blue-700">Aguardando impressora...</span>
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
        <span className="text-sm font-bold text-emerald-700">Impresso com sucesso!</span>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-700">Falha na impressão</p>
            {failedReason && (
              <p className="text-xs text-red-600 mt-0.5 break-words">{failedReason}</p>
            )}
          </div>
        </div>
        <button
          onClick={onRetry}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-700 transition-colors"
        >
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrintLabelDrawer({ fabrication, open, onClose }: PrintLabelDrawerProps) {
  const axCode     = fabrication.ax_code      ?? '';
  const fabCode    = fabrication.fab_code     ?? deriveFabCode(fabrication.mo_number);
  const nomeQuadro = fabrication.product_name ?? '';

  // Impressoras
  const [printers, setPrinters]         = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelected]  = useState<number | null>(null);
  const [printersLoading, setPLoading]  = useState(false);

  // Dados técnicos
  const [correnteNominal,  setCorrenteNominal]  = useState('');
  const [frequencia,       setFrequencia]       = useState('60Hz');
  const [capCorte,         setCapCorte]         = useState('');
  const [tensao,           setTensao]           = useState('');
  const [curvaDisparo,     setCurvaDisparo]     = useState('');
  const [tensaoImpulso,    setTensaoImpulso]    = useState('');
  const [tensaoIsolamento, setTensaoIsolamento] = useState('');
  const [qrUrl,            setQrUrl]            = useState('');
  const [qrLoading,        setQrLoading]        = useState(false);

  // Job criado
  const [activeJobId,  setActiveJobId]  = useState<number | null>(null);
  const [submitting,   setSubmitting]   = useState<string | null>(null); // label_type em andamento

  // Ao abrir: carrega impressoras, limpa campos, busca PDF
  useEffect(() => {
    if (!open) return;

    setActiveJobId(null);
    setSubmitting(null);
    setCorrenteNominal('');
    setFrequencia('60Hz');
    setCapCorte('');
    setTensao('');
    setCurvaDisparo('');
    setTensaoImpulso('');
    setTensaoIsolamento('');
    setQrUrl('');

    // Carrega impressoras
    setPLoading(true);
    fetchPrinters()
      .then((list) => {
        setPrinters(list);
        if (list.length === 1) setSelected(list[0].id);
        else setSelected(null);
      })
      .catch(() => toast.error('Erro ao carregar impressoras.'))
      .finally(() => setPLoading(false));

    // Busca URL pública do primeiro PDF
    const odooMoId = fabrication.odoo_mo_id ? Number(fabrication.odoo_mo_id) : null;
    if (!odooMoId) return;

    let cancelled = false;
    setQrLoading(true);
    api.getMODocuments(odooMoId)
      .then((res: any) => {
        if (cancelled) return;
        const docs: any[] = res?.documents ?? [];
        const pdf = docs.find((d) => d.mimetype === 'application/pdf');
        if (pdf) {
          const url = pdf.odoo_public_url || (pdf.view_url ? buildPublicUrl(pdf.view_url) : '');
          if (url) setQrUrl(url);
        }
      })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancelled) setQrLoading(false); });

    return () => { cancelled = true; };
  }, [open, fabrication.id, fabrication.odoo_mo_id]);

  if (!open) return null;

  const idRequestId = fabrication.request_id ?? '';
  const selectedPrinterInfo = printers.find((p) => p.id === selectedPrinter);

  async function handlePrint(labelType: 'technical' | 'external' | 'both') {
    if (!idRequestId) {
      toast.error('IDRequest não encontrada para esta fabricação.');
      return;
    }
    if (!selectedPrinter) {
      toast.error('Selecione uma impressora.');
      return;
    }

    setSubmitting(labelType);
    setActiveJobId(null);

    const payload: CreatePrintJobRequest = {
      printer_id:        selectedPrinter,
      id_request_id:     idRequestId,
      label_type:        labelType,
      corrente_nominal:  correnteNominal  || undefined,
      frequencia:        frequencia       || '60Hz',
      cap_corte:         capCorte         || undefined,
      tensao:            tensao           || undefined,
      curva_disparo:     curvaDisparo     || undefined,
      tensao_impulso:    tensaoImpulso    || undefined,
      tensao_isolamento: tensaoIsolamento || undefined,
      qr_url:            qrUrl            || undefined,
    };

    try {
      const res = await createPrintJob(payload);
      setActiveJobId(res.job_id);
      toast.success(`Job #${res.job_id} enviado para ${res.printer_name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error(`Erro ao criar job: ${msg}`);
    } finally {
      setSubmitting(null);
    }
  }

  const isSubmitting = submitting !== null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              <Printer size={10} />
              <span>Impressão de Etiquetas</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 truncate">{fabrication.mo_number}</h3>
            {fabrication.obra && (
              <p className="text-xs text-slate-500 truncate mt-0.5">{fabrication.obra}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 ml-2 shrink-0">
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Seção 1 — Dados da MO */}
          <section>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              <FileText size={13} />
              Dados da Ordem
              <span className="text-[10px] font-normal text-emerald-600 normal-case tracking-normal bg-emerald-50 px-1.5 py-0.5 rounded">automático</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Field label="Nome da Obra"   value={fabrication.obra ?? ''} readOnly /></div>
              <div className="col-span-2"><Field label="Nome do Quadro" value={nomeQuadro}             readOnly /></div>
              <Field label="Código AX"  value={axCode}  readOnly />
              <Field label="Código FAB" value={fabCode} readOnly />
            </div>
          </section>

          {/* Seção 2 — Impressora */}
          <section>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              <Printer size={13} />
              Impressora
            </div>
            {printersLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 size={14} className="animate-spin" /> Carregando impressoras...
              </div>
            ) : printers.length === 0 ? (
              <p className="text-sm text-red-500">Nenhuma impressora ativa cadastrada.</p>
            ) : (
              <div className="space-y-2">
                <select
                  value={selectedPrinter ?? ''}
                  onChange={(e) => setSelected(Number(e.target.value) || null)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-white"
                >
                  <option value="">Selecione uma impressora...</option>
                  {printers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {selectedPrinterInfo?.location && (
                  <p className="text-[11px] text-slate-400 pl-1">📍 {selectedPrinterInfo.location}</p>
                )}
              </div>
            )}
          </section>

          {/* Seção 3 — Dados técnicos */}
          <section>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              <Tag size={13} />
              Dados Técnicos
              <span className="text-[10px] font-normal text-slate-400 normal-case tracking-normal">(etiqueta técnica)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Corrente Nominal (In)"      value={correnteNominal}  placeholder="ex: 40A"     onChange={setCorrenteNominal} />
              <Field label="Frequência"                 value={frequencia}       placeholder="ex: 60Hz"    onChange={setFrequencia} />
              <Field label="Cap. de Corte (Icu)"        value={capCorte}         placeholder="ex: 6kA"     onChange={setCapCorte} />
              <Field label="Tensão"                     value={tensao}           placeholder="ex: 380V"    onChange={setTensao} />
              <div className="col-span-2">
                <Field label="Curva de Disparo"         value={curvaDisparo}     placeholder="ex: Curva C" onChange={setCurvaDisparo} />
              </div>
              <Field label="Tensão de Impulso (Uimp)"  value={tensaoImpulso}    placeholder="ex: 4kV"     onChange={setTensaoImpulso} />
              <Field label="Tensão de Isolamento (Ui)" value={tensaoIsolamento} placeholder="ex: 415V"    onChange={setTensaoIsolamento} />
            </div>
          </section>

          {/* Seção 4 — QR code */}
          <section>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              <QrCode size={13} />
              QR Code
              <span className="text-[10px] font-normal text-slate-400 normal-case tracking-normal">(etiqueta externa)</span>
              {qrLoading && <Loader2 size={11} className="animate-spin text-slate-400" />}
              {!qrLoading && qrUrl && (
                <span className="text-[10px] font-normal text-emerald-600 normal-case tracking-normal bg-emerald-50 px-1.5 py-0.5 rounded">automático</span>
              )}
            </div>
            <Field
              label="URL do Documento"
              value={qrUrl}
              placeholder={qrLoading ? 'Buscando documento...' : 'https://odoo.ax.com.br/...'}
              onChange={setQrUrl}
              hint="Preenchido automaticamente com o primeiro PDF da MO."
              loading={qrLoading}
            />
          </section>

          {/* Seção 5 — Status do job */}
          {activeJobId !== null && (
            <section>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                Status da Impressão
              </div>
              <JobStatusBanner
                jobId={activeJobId}
                onRetry={() => setActiveJobId(null)}
              />
            </section>
          )}
        </div>

        {/* Footer — botões de ação */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex flex-col gap-2.5">
          <ActionButton label="Etiqueta Técnica" icon={<Tag size={16} />}    loading={submitting === 'technical'} disabled={isSubmitting || !selectedPrinter} onClick={() => handlePrint('technical')} variant="blue" />
          <ActionButton label="Etiqueta Externa" icon={<QrCode size={16} />} loading={submitting === 'external'}  disabled={isSubmitting || !selectedPrinter} onClick={() => handlePrint('external')}  variant="violet" />
          <ActionButton label="Ambas"            icon={<Layers size={16} />} loading={submitting === 'both'}      disabled={isSubmitting || !selectedPrinter} onClick={() => handlePrint('both')}      variant="emerald" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActionButton
// ---------------------------------------------------------------------------

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  variant: 'blue' | 'violet' | 'emerald';
}

const VARIANT: Record<ActionButtonProps['variant'], string> = {
  blue:    'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20',
  violet:  'bg-violet-600 hover:bg-violet-700 shadow-violet-600/20',
  emerald: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20',
};

function ActionButton({ label, icon, loading, disabled, onClick, variant }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-bold text-sm shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANT[variant]}`}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
