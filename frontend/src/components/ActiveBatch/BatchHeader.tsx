import React from 'react';
import { ArrowLeft, Plus, CheckCircle, BarChart2, Loader2 } from 'lucide-react';

interface BatchHeaderProps {
    batchName: string;
    batchId?: string;
    status: string;
    onBack: () => void;
    onAddFabrications: () => void;
    onFinishBatch: () => void;
    isFinishing?: boolean;
}

export const BatchHeader: React.FC<BatchHeaderProps> = ({
    batchName,
    batchId,
    status,
    onBack,
    onAddFabrications,
    onFinishBatch,
    isFinishing = false
}) => {
    return (
        <header className="bg-white border-b border-slate-200 px-8 py-4 mb-6 shadow-sm sticky top-0 z-40">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-2 font-medium">
                <span onClick={onBack} className="hover:text-blue-600 cursor-pointer transition-colors">Dashboard</span>
                <span>/</span>
                <span onClick={onBack} className="hover:text-blue-600 cursor-pointer transition-colors">Lotes</span>
                <span>/</span>
                <span className="text-slate-800 font-bold">Lote do Dia</span>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
                    >
                        <ArrowLeft size={24} />
                    </button>

                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                            Lote: {batchName}
                            <span className={`text-xs px-2 py-1 rounded-md uppercase font-bold tracking-widest border ${status === 'done' || status === 'finalizado' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                status === 'draft' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                                    'bg-blue-100 text-blue-700 border-blue-200'
                                }`}>
                                {status}
                            </span>
                        </h1>
                        {batchId && <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {batchId}</p>}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2 border border-slate-200">
                        <BarChart2 size={18} />
                        Relatório
                    </button>

                    <button
                        onClick={onAddFabrications}
                        className="px-4 py-2 text-blue-600 font-bold hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2 border border-blue-200"
                    >
                        <Plus size={18} />
                        Adicionar Fabricações
                    </button>

                    <button
                        onClick={onFinishBatch}
                        disabled={isFinishing}
                        className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200 transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                        {isFinishing ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Finalizando...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={18} />
                                Finalizar Lote
                            </>
                        )}
                    </button>
                </div>
            </div>
        </header>
    );
};

