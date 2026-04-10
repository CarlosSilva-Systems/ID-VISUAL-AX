import React, { useState } from 'react';
import { X, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { AndonCall, RootCauseCategory, ROOT_CAUSE_CATEGORIES } from '../types';
import { BottomSheet } from './BottomSheet';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface JustificationModalProps {
  call: AndonCall;
  currentUser: string;
  onClose: () => void;
  onSuccess: (callId: number) => void;
}

export const JustificationModal: React.FC<JustificationModalProps> = ({
  call,
  currentUser,
  onClose,
  onSuccess,
}) => {
  const [rootCauseCategory, setRootCauseCategory] = useState<RootCauseCategory | ''>('');
  const [rootCauseDetail, setRootCauseDetail] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const isValid =
    rootCauseCategory !== '' &&
    rootCauseDetail.trim() !== '' &&
    actionTaken.trim() !== '';

  const formatDuration = (minutes?: number) => {
    if (minutes == null) return '—';
    if (minutes < 60) return `${minutes} minutos`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m > 0 ? ` ${m}min` : ''}`;
  };

  const formatPeriod = (created: string, updated: string) => {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${fmt(created)} → ${fmt(updated)}`;
  };

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.justifyCall(call.id, {
        root_cause_category: rootCauseCategory as RootCauseCategory,
        root_cause_detail: rootCauseDetail.trim(),
        action_taken: actionTaken.trim(),
        justified_by: currentUser,
      });
      toast.success('Justificativa registrada com sucesso');
      onSuccess(call.id);
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 409) {
        toast.info('Este chamado já foi justificado');
        onSuccess(call.id);
      } else {
        toast.error(apiErr?.message || 'Erro ao registrar justificativa');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <>
      {/* Info do chamado */}
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Motivo original:</span>
          <span className="font-medium text-slate-800">{call.reason}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Duração:</span>
          <span className={`font-bold flex items-center gap-1 ${(call.downtime_minutes ?? 0) > 60 ? 'text-red-600' : 'text-slate-800'}`}>
            <Clock className="w-3.5 h-3.5" />
            {formatDuration(call.downtime_minutes)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Período:</span>
          <span className="font-medium text-slate-800">{formatPeriod(call.created_at, call.updated_at)}</span>
        </div>
      </div>

      {/* Formulário */}
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Causa Raiz <span className="text-red-500">*</span>
          </label>
          <select
            value={rootCauseCategory}
            onChange={e => setRootCauseCategory(e.target.value as RootCauseCategory)}
            className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="">Selecione a categoria...</option>
            {ROOT_CAUSE_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Detalhe da causa <span className="text-red-500">*</span>
          </label>
          <textarea
            value={rootCauseDetail}
            onChange={e => setRootCauseDetail(e.target.value)}
            rows={3}
            placeholder="Descreva a causa raiz em detalhes..."
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Ação tomada <span className="text-red-500">*</span>
          </label>
          <textarea
            value={actionTaken}
            onChange={e => setActionTaken(e.target.value)}
            rows={3}
            placeholder="Descreva o que foi feito para resolver..."
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="px-4 py-2 min-h-[44px] text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className="px-5 py-2 min-h-[44px] bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </>
  );

  const headerContent = (
    <div className={`flex items-center justify-between px-6 py-4 border-b ${
      call.color === 'RED' ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'
    }`}>
      <div className="flex items-center gap-2">
        <AlertTriangle className={`w-5 h-5 ${call.color === 'RED' ? 'text-red-600' : 'text-yellow-600'}`} />
        <h2 className="font-bold text-slate-900 text-sm">
          {call.color === 'RED' ? '🔴' : '🟡'} Justificar Parada — {call.workcenter_name}
        </h2>
      </div>
      <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 transition-colors">
        <X className="w-4 h-4 text-slate-500" />
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet
        isOpen
        onClose={onClose}
        title={`${call.color === 'RED' ? '🔴' : '🟡'} Justificar — ${call.workcenter_name}`}
        maxHeight="95vh"
      >
        {formContent}
      </BottomSheet>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {headerContent}
        {formContent}
      </div>
    </div>
  );
};
