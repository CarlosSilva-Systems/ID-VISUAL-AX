import React, { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
// import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet" 

// Using standard divs/modal logic to be safe without full UI lib context
interface QADrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (note: string) => void;
    errorMessage?: string;
}

export const QADrawer: React.FC<QADrawerProps> = ({ isOpen, onClose, onConfirm, errorMessage }) => {
    const [note, setNote] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
            <div className="w-[400px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-red-50">
                    <div>
                        <h2 className="text-lg font-bold text-red-900 flex items-center gap-2">
                            <AlertTriangle size={20} />
                            Atenção: QA Final
                        </h2>
                        <p className="text-sm text-red-700 mt-1">
                            Documentos ainda não foram impressos.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-full transition-colors">
                        <X size={20} className="text-red-900" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 overflow-y-auto">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-6">
                        <span className="font-bold">Regra Poka-yoke:</span> Para aprovar o QA sem os documentos impressos (Verde), é
                        <strong> obrigatório </strong> fornecer uma justificativa.
                    </div>

                    <label className="block text-sm font-bold text-slate-700 mb-2">
                        Justificativa da Aprovação
                        <span className="text-red-500 ml-1">*</span>
                    </label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none text-slate-700"
                        placeholder="Descreva o motivo da liberação sem documentos..."
                        autoFocus
                    />
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => {
                            if (note.trim().length > 3) onConfirm(note);
                        }}
                        disabled={note.trim().length < 3}
                        className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        Confirmar e Aprovar
                    </button>
                </div>
            </div>
        </div>
    );
};
