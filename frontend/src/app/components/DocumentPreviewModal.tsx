import React, { useEffect, useState, useRef } from 'react';
import { X, FileText, Download, Printer, Loader2, AlertTriangle, Eye, ChevronDown } from 'lucide-react';
import { api } from '../../services/api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface DocumentInfo {
    doc_key: string;
    name: string;
    mimetype: string;
    url_view: string;
    url_download: string;
    url_print: string;
}

interface MODocumentsResponse {
    mo_id: number;
    product_id: number | null;
    documents: DocumentInfo[];
    total: number;
    limit: number;
    offset: number;
    source: string;
    debug_timings?: {
        total_ms: number;
        scope: string;
    };
}

interface DocumentPreviewModalProps {
    moId: string; // Odoo ID (as string or number)
    moNumber: string;
    onClose: () => void;
}

export function DocumentPreviewModal({ moId, moNumber, onClose }: DocumentPreviewModalProps) {
    const [docs, setDocs] = useState<DocumentInfo[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timings, setTimings] = useState<any>(null);
    const loadedRef = useRef(false);

    useEffect(() => {
        if (!loadedRef.current) {
            loadedRef.current = true;
            fetchDocs(true);
        }
    }, [moId]);

    const fetchDocs = async (reset: boolean = false) => {
        if (reset) {
            setLoading(true);
            setError(null);
            setDocs([]);
            setOffset(0);
        } else {
            setLoadingMore(true);
        }

        try {
            const currentOffset = reset ? 0 : offset;
            const limit = 50;
            const res: MODocumentsResponse = await api.getMODocuments(moId, limit, currentOffset);

            if (reset) {
                setDocs(res.documents);
            } else {
                setDocs(prev => [...prev, ...res.documents]);
            }

            setTotal(res.total);
            setOffset(currentOffset + res.documents.length);
            setTimings(res.debug_timings);

        } catch (err: any) {
            console.error(err);
            if (err.status === 401) {
                setError("Sessão expirada. Por favor, faça login novamente.");
                return;
            }

            const isTimeout = err.data?.error_code === 'odoo_timeout';
            const reqId = err.data?.request_id ? ` (RID: ${err.data.request_id})` : "";

            if (isTimeout) {
                setError("Odoo demorou para responder (Timeout > 8s). Tente novamente.");
            } else {
                setError(err.message || `Falha ao carregar documentos.${reqId}`);
            }
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleLoadMore = () => {
        fetchDocs(false);
    };

    const handleAction = (url: string) => {
        const token = localStorage.getItem('access_token');
        const tokenParam = token ? `${url.includes('?') ? '&' : '?'}token=${token}` : '';

        const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';
        let rootUrl = "";
        try {
            rootUrl = new URL(apiUrl).origin;
        } catch (e) {
            rootUrl = window.location.origin;
        }

        const finalUrl = `${rootUrl}${url.startsWith('/') ? '' : '/'}${url}${tokenParam}`;
        window.open(finalUrl, '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Documentos do Produto</h3>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <span>MO: {moNumber}</span>
                            {timings && (
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-mono",
                                    timings.total_ms > 5000 ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"
                                )}>
                                    {timings.total_ms}ms ({timings.scope})
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                            <Loader2 className="animate-spin w-8 h-8 text-blue-500" />
                            <p className="text-sm font-medium">Buscando documentos...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-3 text-rose-500 text-center">
                            <AlertTriangle className="w-10 h-10" />
                            <p className="font-medium max-w-md">{error}</p>
                            <button onClick={() => fetchDocs(true)} className="px-4 py-2 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 text-sm font-bold transition-colors">
                                Tentar novamente
                            </button>
                        </div>
                    ) : docs.length === 0 ? (
                        <div className="p-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center">
                            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                            <p className="text-slate-500 font-medium">Nenhum documento encontrado.</p>
                            <p className="text-xs text-slate-400 mt-1">Verifique o cadastro "Product Documents" no Odoo.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                    {docs.length} de {total} Arquivo(s)
                                </h4>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {docs.map((doc) => (
                                    <DocRow key={doc.doc_key} doc={doc} onAction={handleAction} />
                                ))}
                            </div>

                            {/* Pagination / Load More */}
                            {docs.length < total && (
                                <div className="text-center pt-2">
                                    <button
                                        onClick={handleLoadMore}
                                        disabled={loadingMore}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-medium text-sm disabled:opacity-50"
                                    >
                                        {loadingMore ? <Loader2 className="animate-spin w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        Carregar Mais
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function DocRow({ doc, onAction }: { doc: DocumentInfo, onAction: (url: string) => void }) {
    return (
        <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group">
            <div className="flex items-center gap-4 overflow-hidden">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <FileText size={20} />
                </div>
                <div className="min-w-0">
                    <h4 className="font-bold text-sm text-slate-800 truncate" title={doc.name}>{doc.name}</h4>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5 truncate">
                        {doc.mimetype}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <button
                    onClick={() => onAction(doc.url_view)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-blue-600 hover:text-white transition-colors"
                >
                    <Eye size={14} />
                    View
                </button>
                <div className="flex items-center gap-1 pl-2 border-l border-slate-100">
                    <button
                        onClick={() => onAction(doc.url_print)}
                        className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Imprimir"
                    >
                        <Printer size={16} />
                    </button>
                    <button
                        onClick={() => onAction(doc.url_download)}
                        className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Baixar"
                    >
                        <Download size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
