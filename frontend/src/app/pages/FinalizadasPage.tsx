import React, { useEffect, useState } from "react";
import {
    CheckCircle,
    Package,
    Calendar,
    Hash,
    Loader2,
    InboxIcon,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { api } from "../../services/api";

interface FinishedItem {
    request_id: string;
    mo_name: string;
    obra_nome: string;
    id_name: string;
    quantity: number;
    date_start: string | null;
}

interface FinishedBatch {
    batch_id: string;
    batch_name: string;
    finished_at: string | null;
    items_count: number;
    items: FinishedItem[];
}

export const FinalizadasPage = () => {
    const [batches, setBatches] = useState<FinishedBatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

    useEffect(() => {
        loadFinished();
    }, []);

    const loadFinished = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await api.getFinishedBatches();
            setBatches(data);
        } catch (err: any) {
            setError(err.message || "Erro ao carregar finalizadas");
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (iso: string | null) => {
        if (!iso) return "—";
        try {
            const d = new Date(iso);
            return d.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return iso;
        }
    };

    const totalItems = batches.reduce((sum, b) => sum + b.items_count, 0);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm font-medium">Carregando finalizadas…</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-red-500">
                <span className="text-sm font-medium">{error}</span>
                <button
                    onClick={loadFinished}
                    className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors"
                >
                    Tentar novamente
                </button>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">ID Visuais Finalizadas</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Lotes concluídos e prontos para entrega
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-bold">{batches.length} lotes</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
                        <Package className="w-4 h-4" />
                        <span className="text-sm font-bold">{totalItems} IDs</span>
                    </div>
                </div>
            </div>

            {/* Empty State */}
            {batches.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4">
                    <InboxIcon className="w-12 h-12 text-slate-300" />
                    <p className="text-sm font-medium">Nenhum lote finalizado ainda</p>
                    <p className="text-xs text-slate-400">
                        Quando um lote for concluído, ele aparecerá aqui.
                    </p>
                </div>
            )}

            {/* Batch List */}
            <div className="space-y-3">
                {batches.map((batch) => {
                    const isExpanded = expandedBatch === batch.batch_id;
                    return (
                        <div
                            key={batch.batch_id}
                            className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
                        >
                            {/* Batch Header */}
                            <button
                                onClick={() =>
                                    setExpandedBatch(isExpanded ? null : batch.batch_id)
                                }
                                className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2.5 bg-emerald-50 rounded-xl">
                                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">{batch.batch_name}</h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                Finalizado: {formatDate(batch.finished_at)}
                                            </span>
                                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                                <Hash className="w-3 h-3" />
                                                {batch.items_count} {batch.items_count === 1 ? "ID" : "IDs"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {isExpanded ? (
                                    <ChevronDown className="w-5 h-5 text-slate-400" />
                                ) : (
                                    <ChevronRight className="w-5 h-5 text-slate-400" />
                                )}
                            </button>

                            {/* Items Table (expanded) */}
                            {isExpanded && batch.items.length > 0 && (
                                <div className="border-t border-slate-100">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                <th className="text-left px-5 py-3">ID Visual</th>
                                                <th className="text-left px-5 py-3">Fabricação</th>
                                                <th className="text-center px-5 py-3">Qtd</th>
                                                <th className="text-right px-5 py-3">Data Fabricação</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {batch.items.map((item) => (
                                                <tr
                                                    key={item.request_id}
                                                    className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors"
                                                >
                                                    <td className="px-5 py-3.5">
                                                        <span className="text-sm font-bold text-slate-800">
                                                            {item.id_name}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <span className="text-sm text-slate-600">
                                                            {item.mo_name}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-center">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
                                                            {item.quantity}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-right">
                                                        <span className="text-xs text-slate-500">
                                                            {formatDate(item.date_start)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {isExpanded && batch.items.length === 0 && (
                                <div className="border-t border-slate-100 p-5 text-center text-sm text-slate-400">
                                    Nenhum item associado a este lote
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
