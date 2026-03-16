import React from 'react';
import { X, Calendar, Clock, Package } from 'lucide-react';

interface PlannedMO {
    obra?: string;
    fabrication?: string;
    mo_name: string;
    date_start: string | null;
    user_name: string;
}

interface PlanningModalProps {
    wcName: string;
    plannedMos: PlannedMO[];
    onClose: () => void;
}

export const PlanningModal: React.FC<PlanningModalProps> = ({ wcName, plannedMos, onClose }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">Ordens Planejadas</h2>
                        <p className="text-sm text-slate-500">{wcName}</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-3 hover:bg-slate-100 rounded-2xl transition-all text-slate-400 hover:text-slate-600 active:scale-90"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="p-8 max-h-[60vh] overflow-y-auto">
                    {plannedMos.length === 0 ? (
                        <div className="text-center py-12 space-y-3">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                                <Calendar className="text-slate-300" size={32} />
                            </div>
                            <p className="text-slate-400 font-bold">Sem ordens no momento.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {plannedMos.map((mo, idx) => (
                                <div 
                                    key={idx}
                                    className="p-5 bg-slate-50 rounded-[1.5rem] border border-slate-100 space-y-3"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-2 text-blue-600">
                                                <Package size={16} />
                                                <span className="font-black text-sm">{mo.obra || mo.mo_name}</span>
                                            </div>
                                            {mo.fabrication && (
                                                <span className="text-[11px] font-bold text-slate-500 ml-6">
                                                    Ref: {mo.fabrication}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-100 h-fit">
                                            Fila
                                        </span>
                                    </div>
                                    
                                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                                        <div className="flex items-center gap-1.5 ml-6">
                                            <Clock size={14} />
                                            <span>{mo.date_start ? new Date(mo.date_start).toLocaleString('pt-BR') : 'Data não planejada'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-8 bg-slate-50 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-900/10"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};
