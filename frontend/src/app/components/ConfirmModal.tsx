import React, { useEffect, useRef } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from './ui';
import { useBottomSheet } from '@/hooks/useBottomSheet';
import { useBreakpoint } from '@/hooks/useBreakpoint';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'warning' | 'success';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_CONFIG = {
  destructive: {
    icon: AlertTriangle,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    confirmBtn: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500',
  },
  warning: {
    icon: AlertCircle,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    confirmBtn: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500',
  },
  success: {
    icon: CheckCircle2,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500',
  },
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'destructive',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = React.useId();

  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const { handleTouchStart, handleTouchMove, handleTouchEnd, sheetStyle } = useBottomSheet({
    onClose: () => { if (!isLoading) onCancel(); },
  });

  // Focus trap: foco inicial no botão Cancelar ao abrir
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        cancelRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Fechar via Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
      if (e.key === 'Tab') {
        const focusable = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLButtonElement[];
        if (focusable.length < 2) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  // Bloquear scroll do body quando aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onCancel(); }}
        aria-hidden="false"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed bottom-0 left-0 right-0 w-full bg-white rounded-t-2xl rounded-b-none z-50 flex flex-col animate-in slide-in-from-bottom duration-300"
          style={sheetStyle}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          {/* Conteúdo */}
          <div className="p-6 text-center space-y-4">
            <div className={cn('w-14 h-14 rounded-full mx-auto flex items-center justify-center', config.iconBg)}>
              <Icon className={cn('w-7 h-7', config.iconColor)} />
            </div>
            <div>
              <h3 id={titleId} className="text-lg font-bold text-slate-800">{title}</h3>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">{description}</p>
            </div>
          </div>

          {/* Ações */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 pb-safe">
            <button
              ref={cancelRef}
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 min-h-[44px] font-bold text-sm text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              onClick={onConfirm}
              disabled={isLoading}
              className={cn(
                'flex-1 px-4 py-2.5 min-h-[44px] font-bold text-sm text-white rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed',
                config.confirmBtn
              )}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop: modal centralizado
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onCancel();
      }}
      aria-hidden="false"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Conteúdo */}
        <div className="p-6 text-center space-y-4">
          <div className={cn('w-14 h-14 rounded-full mx-auto flex items-center justify-center', config.iconBg)}>
            <Icon className={cn('w-7 h-7', config.iconColor)} />
          </div>
          <div>
            <h3 id={titleId} className="text-lg font-bold text-slate-800">
              {title}
            </h3>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Ações */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 min-h-[44px] font-bold text-sm text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'flex-1 px-4 py-2.5 min-h-[44px] font-bold text-sm text-white rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed',
              config.confirmBtn
            )}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
