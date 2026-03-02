import React, { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Play, ChevronRight, Info, ClipboardCheck, Ban } from 'lucide-react';
import { Fabrication, Caixinha } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DrawerCaixinhaProps {
  fabrication: Fabrication;
  task: Caixinha;
  onClose: () => void;
  onUpdateStatus: (status: Caixinha['status'], reason?: string) => void;
}

export function DrawerCaixinha({ fabrication, task, onClose, onUpdateStatus }: DrawerCaixinhaProps) {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const toggleCheck = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const epsonChecklist = [
    { id: 'diag', label: 'Diagrama enviado para impressão' },
    { id: 'legend', label: 'Legenda enviada para impressão' },
  ];

  const standardChecklist = [
    { id: 'diag_conf', label: 'Conferi diagrama/legenda para esse item' },
    { id: 'nomenc', label: 'Montei texto seguindo padrão (nomenclatura)' },
    { id: 'revise', label: 'Revisei antes de imprimir' },
  ];

  const qaChecklist = [
    { id: 'docs', label: 'Documentos estão "Impresso"' },
    { id: 'all_done', label: 'Todas caixinhas concluídas/justificadas' },
    { id: 'delivery', label: 'Entregue para produção' },
  ];

  const currentChecklist = task.type === 'Epson' ? epsonChecklist : task.type === 'QA' ? qaChecklist : standardChecklist;
  const isAllChecked = currentChecklist.every(item => checklist[item.id]);

  const blockReasons = [
    'Sem diagrama', 'Sem legenda', 'Arquivo errado', 'Versão divergente', 'Faltou dado', 'Dúvida', 'Alteração projeto', 'Outro'
  ];

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
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              <span>{fabrication.mo_number}</span> <ChevronRight size={10} /> <span>{task.label}</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 truncate">
              {task.label}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Context Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Obra:</span>
              <span className="font-bold text-slate-800 text-right">{fabrication.obra}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Data / SLA:</span>
              <span className="font-bold text-slate-800">{fabrication.date_start} • {fabrication.sla}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Quantidade:</span>
              <span className="font-bold text-slate-800">{fabrication.product_qty} un</span>
            </div>
          </div>

          {/* Status Display */}
          <div className="flex items-center gap-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Status Atual:</div>
            <div className={cn(
              "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider",
              task.status === 'Neutro' && "bg-slate-100 text-slate-500",
              task.status === 'Em Andamento' && "bg-blue-100 text-blue-700",
              task.status === 'Concluído' && "bg-emerald-100 text-emerald-700",
              task.status === 'Bloqueado' && "bg-rose-100 text-rose-700"
            )}>
              {task.status}
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <ClipboardCheck size={18} className="text-blue-600" />
              Padronização de Trabalho (5S)
            </div>
            <div className="space-y-2">
              {currentChecklist.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleCheck(item.id)}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                    checklist[item.id]
                      ? "bg-emerald-50 border-emerald-500 text-emerald-900"
                      : "bg-white border-slate-100 hover:border-slate-200 text-slate-600"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors",
                    checklist[item.id] ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-200"
                  )}>
                    {checklist[item.id] && <CheckCircle2 size={16} />}
                  </div>
                  <span className="text-sm font-bold">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Blocking Section */}
          {isBlocking ? (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-200">
              <div className="flex items-center gap-2 text-sm font-bold text-rose-600">
                <AlertTriangle size={18} />
                Justificar Bloqueio
              </div>
              <div className="grid grid-cols-2 gap-2">
                {blockReasons.map(reason => (
                  <button
                    key={reason}
                    onClick={() => setBlockReason(reason)}
                    className={cn(
                      "px-3 py-2 rounded-lg border text-xs font-bold transition-all",
                      blockReason === reason
                        ? "bg-rose-600 border-rose-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:border-rose-300"
                    )}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <textarea
                placeholder="Observações adicionais..."
                className="w-full p-3 rounded-lg border border-slate-200 text-sm h-24 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setIsBlocking(false)}
                  className="flex-1 px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  disabled={!blockReason}
                  onClick={() => {
                    onUpdateStatus('Bloqueado', blockReason);
                    onClose();
                  }}
                  className="flex-[2] px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 transition-all disabled:opacity-50"
                >
                  Confirmar Bloqueio
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsBlocking(true)}
              className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold hover:border-rose-300 hover:text-rose-500 transition-all flex items-center justify-center gap-2"
            >
              <Ban size={16} /> Tem algum problema? Bloquear Etapa
            </button>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-100 bg-slate-50 flex flex-col gap-3">
          {task.type === 'Epson' ? (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onUpdateStatus('Concluído');
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
              >
                <CheckCircle2 size={18} /> Marcar como Já Impresso
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                disabled={task.status === 'Em Andamento'}
                onClick={() => onUpdateStatus('Em Andamento')}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 border-2",
                  task.status === 'Em Andamento'
                    ? "bg-blue-50 border-blue-200 text-blue-400 cursor-default"
                    : "bg-white border-blue-600 text-blue-600 hover:bg-blue-50"
                )}
              >
                <Play size={18} fill="currentColor" /> Iniciar Trabalho
              </button>
              <button
                disabled={!isAllChecked}
                onClick={() => {
                  onUpdateStatus('Concluído');
                  onClose();
                }}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl font-bold text-base shadow-lg transition-all active:scale-95",
                  isAllChecked
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                )}
              >
                <CheckCircle2 size={20} /> Concluir Etapa
              </button>
              {!isAllChecked && (
                <p className="text-[10px] text-center text-slate-400 font-medium">
                  Complete o checklist 5S para habilitar a conclusão.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
