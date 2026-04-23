import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  Loader2,
  Tag,
  QrCode,
  FileText,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { Fabrication } from '../types';
import { printLabels } from '../../services/printApi';
import { LabelType } from '../../types/print';

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

/** Extrai o código FAB do mo_number: "WH/FAB/01015" → "FAB01015" */
function deriveFabCode(moNumber: string): string {
  const parts = moNumber.split('/');
  const last = parts[parts.length - 1]?.trim();
  if (!last || !/^\d+$/.test(last)) return '';
  return `FAB${last}`;
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
}

function Field({ label, value, readOnly, placeholder, onChange, hint }: FieldProps) {
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
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors placeholder:text-slate-400"
        />
      )}
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrintLabelDrawer({ fabrication, open, onClose }: PrintLabelDrawerProps) {
  // Campos derivados automaticamente da MO
  const axCode   = fabrication.ax_code  ?? '';
  const fabCode  = fabrication.fab_code ?? deriveFabCode(fabrication.mo_number);
  // Nome do quadro = product_name (campo do produto no Odoo)
  const nomeQuadro = fabrication.product_name ?? '';

  // Dados técnicos editáveis — todos opcionais
  const [correnteNominal, setCorrenteNominal] = useState('');
  const [frequencia,      setFrequencia]      = useState('60Hz');
  const [capCorte,        setCapCorte]        = useState('');
  const [tensao,          setTensao]          = useState('');
  const [curvaDisparo,    setCurvaDisparo]    = useState('');
  const [tensaoImpulso,   setTensaoImpulso]   = useState('');
  const [tensaoIsolamento,setTensaoIsolamento]= useState('');
  const [qrUrl,           setQrUrl]           = useState('');

  // Limpa os campos editáveis sempre que o drawer abre para uma nova MO
  useEffect(() => {
    if (open) {
      setCorrenteNominal('');
      setFrequencia('60Hz');
      setCapCorte('');
      setTensao('');
      setCurvaDisparo('');
      setTensaoImpulso('');
      setTensaoIsolamento('');
      setQrUrl('');
    }
  }, [open, fabrication.id]);

  const [loading, setLoading] = useState<LabelType | null>(null);

  if (!open) return null;

  const idRequestId = fabrication.request_id ?? '';

  async function handlePrint(labelType: LabelType) {
    if (!idRequestId) {
      toast.error('IDRequest não encontrada para esta fabricação.');
      return;
    }
    setLoading(labelType);
    try {
      await printLabels({
        id_request_id: idRequestId,
        label_type:    labelType,
        corrente_nominal:   correnteNominal  || undefined,
        frequencia:         frequencia       || '60Hz',
        cap_corte:          capCorte         || undefined,
        tensao:             tensao           || undefined,
        curva_disparo:      curvaDisparo     || undefined,
        tensao_impulso:     tensaoImpulso    || undefined,
        tensao_isolamento:  tensaoIsolamento || undefined,
        qr_url:             qrUrl            || undefined,
      });
      toast.success('Etiqueta enviada para impressão!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error(`Erro ao imprimir: ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Drawer */}
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
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 ml-2 shrink-0"
          >
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Dados da MO — preenchidos automaticamente, read-only */}
          <section>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              <FileText size={13} />
              Dados da Ordem
              <span className="text-[10px] font-normal text-emerald-600 normal-case tracking-normal bg-emerald-50 px-1.5 py-0.5 rounded">
                preenchido automaticamente
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Nome da Obra"   value={fabrication.obra ?? ''} readOnly />
              </div>
              <div className="col-span-2">
                <Field label="Nome do Quadro" value={nomeQuadro}             readOnly />
              </div>
              <Field label="Código AX"  value={axCode}  readOnly />
              <Field label="Código FAB" value={fabCode} readOnly />
            </div>
          </section>

          {/* Dados técnicos — editáveis pelo operador */}
          <section>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              <Tag size={13} />
              Dados Técnicos
              <span className="text-[10px] font-normal text-slate-400 normal-case tracking-normal">
                (etiqueta técnica interna)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Corrente Nominal (In)" value={correnteNominal} placeholder="ex: 40A"     onChange={setCorrenteNominal} />
              <Field label="Frequência"             value={frequencia}      placeholder="ex: 60Hz"    onChange={setFrequencia} />
              <Field label="Cap. de Corte (Icu)"    value={capCorte}        placeholder="ex: 6kA"     onChange={setCapCorte} />
              <Field label="Tensão"                 value={tensao}          placeholder="ex: 380V"    onChange={setTensao} />
              <div className="col-span-2">
                <Field label="Curva de Disparo"     value={curvaDisparo}    placeholder="ex: Curva C" onChange={setCurvaDisparo} />
              </div>
              <Field label="Tensão de Impulso (Uimp)"    value={tensaoImpulso}    placeholder="ex: 4kV"   onChange={setTensaoImpulso} />
              <Field label="Tensão de Isolamento (Ui)"   value={tensaoIsolamento} placeholder="ex: 415V"  onChange={setTensaoIsolamento} />
            </div>
          </section>

          {/* QR code URL */}
          <section>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              <QrCode size={13} />
              QR Code
              <span className="text-[10px] font-normal text-slate-400 normal-case tracking-normal">
                (etiqueta externa)
              </span>
            </div>
            <Field
              label="URL do Documento"
              value={qrUrl}
              placeholder="https://odoo.ax.com.br/..."
              onChange={setQrUrl}
              hint="Preencha com o link do documento para o QR code."
            />
          </section>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex flex-col gap-2.5">
          <PrintButton label="Imprimir Etiqueta Técnica" icon={<Tag size={16} />}    loading={loading === 'technical'} disabled={loading !== null} onClick={() => handlePrint('technical')} variant="blue" />
          <PrintButton label="Imprimir Etiqueta Externa" icon={<QrCode size={16} />} loading={loading === 'external'}  disabled={loading !== null} onClick={() => handlePrint('external')}  variant="violet" />
          <PrintButton label="Imprimir Ambas"            icon={<Layers size={16} />} loading={loading === 'both'}      disabled={loading !== null} onClick={() => handlePrint('both')}      variant="emerald" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PrintButton
// ---------------------------------------------------------------------------

interface PrintButtonProps {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  variant: 'blue' | 'violet' | 'emerald';
}

const VARIANT_CLASSES: Record<PrintButtonProps['variant'], string> = {
  blue:    'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20',
  violet:  'bg-violet-600 hover:bg-violet-700 shadow-violet-600/20',
  emerald: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20',
};

function PrintButton({ label, icon, loading, disabled, onClick, variant }: PrintButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-bold text-sm shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANT_CLASSES[variant]}`}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
