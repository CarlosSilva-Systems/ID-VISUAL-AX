import React, { useState } from 'react';
import { X, Check, Box, ChevronRight, Settings2 } from 'lucide-react';
import { Fabrication, PackageType, PACKAGES_CONFIG } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BottomSheet } from './BottomSheet';
import { useBreakpoint } from '@/hooks/useBreakpoint';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ModalPacoteProps {
  fabrication: Fabrication;
  onClose: () => void;
  onSave: (packageType: PackageType) => void;
}

export function ModalPacote({ fabrication, onClose, onSave }: ModalPacoteProps) {
  const [selected, setSelected] = useState<PackageType>('COMANDO');
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const options: { id: PackageType; label: string; desc: string }[] = [
    { id: 'COMANDO', label: 'Quadro de Comando', desc: 'Pacote completo com 6 identificações' },
    { id: 'DISTRIBUIÇÃO', label: 'Quadro de Distribuição', desc: 'Identificações básicas para distribuição' },
    { id: 'APTO', label: 'Quadro de Apartamento', desc: 'Somente o essencial (Diagrama + EFZ + 210-805)' },
    { id: 'PERSONALIZADO', label: 'Personalizado', desc: 'Definir manualmente quais itens imprimir' },
  ];

  const content = (
    <>
      {/* Content */}
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 gap-3">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className={cn(
                "p-4 rounded-xl border-2 text-left transition-all flex items-center justify-between group",
                selected === opt.id
                  ? "border-blue-600 bg-blue-50/50"
                  : "border-gray-100 hover:border-gray-200"
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                  selected === opt.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                )}>
                  {opt.id === 'PERSONALIZADO' ? <Settings2 size={20} /> : <Box size={20} />}
                </div>
                <div>
                  <p className={cn("font-bold", selected === opt.id ? "text-blue-900" : "text-slate-700")}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-slate-500">{opt.desc}</p>
                </div>
              </div>
              {selected === opt.id && (
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-sm">
                  <Check size={14} />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Preview Section */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Itens Inclusos no Pacote:</h4>
          <div className="flex flex-wrap gap-2">
            {PACKAGES_CONFIG[selected].map((item, idx) => (
              <span
                key={idx}
                className={cn(
                  "px-2 py-1 rounded text-xs font-bold",
                  item === 'Diagrama+Legenda' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-white text-slate-600 border border-slate-200'
                )}
              >
                {item}
              </span>
            ))}
            {selected === 'PERSONALIZADO' && (
              <span className="text-xs text-slate-400 italic self-center ml-1">+ selecione no próximo passo</span>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 flex items-center justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 min-h-[44px] text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={() => onSave(selected)}
          className="px-6 py-2 min-h-[44px] bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-all shadow-md active:scale-95 flex items-center gap-2"
        >
          Salvar Pacote <ChevronRight size={16} />
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <BottomSheet isOpen onClose={onClose} title="Tipo de Quadro / Pacote" maxHeight="95vh">
        {content}
      </BottomSheet>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Tipo de Quadro / Pacote</h3>
            <p className="text-sm text-slate-500">{fabrication.mo_number} • {fabrication.obra}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
