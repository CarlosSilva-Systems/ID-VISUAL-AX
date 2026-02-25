import React, { useEffect, useState, useRef } from 'react';
import { X, FileText, Download, Loader2, AlertTriangle, Eye, ArrowLeft, Maximize2, Minimize2, FileQuestion } from 'lucide-react';
import { api } from '../../services/api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface DocumentInfo {
    id: string;
    odoo_document_id: number;
    name: string;
    mimetype: string;
    view_url: string;
    download_url: string;
    is_previewable: boolean;
}

interface MODocumentsResponse {
    mo_id: number;
    product_id: number | null;
    documents: DocumentInfo[];
    total: number;
}

interface DocumentPreviewModalProps {
    moId: string;
    moNumber: string;
    onClose: () => void;
}

export function DocumentPreviewModal({ moId, moNumber, onClose }: DocumentPreviewModalProps) {
    const [docs, setDocs] = useState<DocumentInfo[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const loadedRef = useRef(false);

    // Inline preview state
    const [activeDoc, setActiveDoc] = useState<DocumentInfo | null>(null);
    const [activeViewUrl, setActiveViewUrl] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [iframeLoading, setIframeLoading] = useState(false);
    const [iframeError, setIframeError] = useState(false);
    const iframeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Reset preview state when MO changes
    useEffect(() => {
        resetPreviewState();
        loadedRef.current = false;
    }, [moId]);

    // Load docs on mount / MO change
    useEffect(() => {
        if (!loadedRef.current) {
            loadedRef.current = true;
            fetchDocs();
        }
    }, [moId]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (iframeTimeoutRef.current) clearTimeout(iframeTimeoutRef.current);
        };
    }, []);

    const resetPreviewState = () => {
        setActiveDoc(null);
        setActiveViewUrl(null);
        setIsFullscreen(false);
        setIframeLoading(false);
        setIframeError(false);
        if (iframeTimeoutRef.current) {
            clearTimeout(iframeTimeoutRef.current);
            iframeTimeoutRef.current = null;
        }
    };

    const handleClose = () => {
        resetPreviewState();
        onClose();
    };

    const fetchDocs = async () => {
        setLoading(true);
        setError(null);
        setDocs([]);

        try {
            const res: MODocumentsResponse = await api.getMODocuments(Number(moId));
            setDocs(res.documents);
            setTotal(res.total);
        } catch (err: any) {
            console.error(err);
            if (err.status === 401) {
                setError("Sessão expirada. Por favor, faça login novamente.");
                return;
            }
            const reqId = err.data?.request_id ? ` (RID: ${err.data.request_id})` : "";
            setError(err.message || `Falha ao carregar documentos.${reqId}`);
        } finally {
            setLoading(false);
        }
    };

    const buildFullUrl = (url: string): string => {
        const token = localStorage.getItem('access_token');
        const tokenParam = token ? `${url.includes('?') ? '&' : '?'}token=${token}` : '';
        const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';
        let rootUrl = "";
        try {
            rootUrl = new URL(apiUrl).origin;
        } catch (e) {
            rootUrl = window.location.origin;
        }
        return `${rootUrl}${url.startsWith('/') ? '' : '/'}${url}${tokenParam}`;
    };

    const handleView = (doc: DocumentInfo) => {
        if (!doc.is_previewable) return; // Safety guard
        const fullUrl = buildFullUrl(doc.view_url);
        setActiveDoc(doc);
        setActiveViewUrl(fullUrl);
        setIframeLoading(true);
        setIframeError(false);

        // Timeout: if iframe doesn't load in 15s, show error
        if (iframeTimeoutRef.current) clearTimeout(iframeTimeoutRef.current);
        iframeTimeoutRef.current = setTimeout(() => {
            setIframeLoading(false);
            setIframeError(true);
        }, 15000);
    };

    const handleDownload = (doc: DocumentInfo) => {
        const fullUrl = buildFullUrl(doc.download_url);
        window.open(fullUrl, '_blank');
    };

    const handleIframeLoad = () => {
        setIframeLoading(false);
        if (iframeTimeoutRef.current) {
            clearTimeout(iframeTimeoutRef.current);
            iframeTimeoutRef.current = null;
        }
    };

    const handleIframeError = () => {
        setIframeLoading(false);
        setIframeError(true);
        if (iframeTimeoutRef.current) {
            clearTimeout(iframeTimeoutRef.current);
            iframeTimeoutRef.current = null;
        }
    };

    const handleBackToList = () => {
        setActiveDoc(null);
        setActiveViewUrl(null);
        setIsFullscreen(false);
        setIframeLoading(false);
        setIframeError(false);
        if (iframeTimeoutRef.current) {
            clearTimeout(iframeTimeoutRef.current);
            iframeTimeoutRef.current = null;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={cn(
                "bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300",
                isFullscreen
                    ? "fixed inset-4 max-w-none max-h-none w-auto h-auto"
                    : "w-full max-w-2xl max-h-[90vh]"
            )}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50 shrink-0">
                    <div className="flex items-center gap-3 overflow-hidden">
                        {activeDoc && (
                            <button
                                onClick={handleBackToList}
                                className="p-1.5 hover:bg-white rounded-lg transition-colors text-slate-400 hover:text-slate-600 shrink-0"
                                title="Voltar à lista"
                            >
                                <ArrowLeft size={18} />
                            </button>
                        )}
                        <div className="min-w-0">
                            <h3 className="text-lg font-bold text-slate-800 truncate">
                                {activeDoc ? activeDoc.name : 'Documentos do Produto'}
                            </h3>
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <span>MO: {moNumber}</span>
                                {activeDoc && (
                                    <span className="text-[10px] uppercase tracking-widest text-slate-400">
                                        — {activeDoc.mimetype}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {activeDoc && (
                            <>
                                <button
                                    onClick={() => handleDownload(activeDoc)}
                                    className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600"
                                    title="Download"
                                >
                                    <Download size={18} />
                                </button>
                                <button
                                    onClick={() => setIsFullscreen(!isFullscreen)}
                                    className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600"
                                    title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
                                >
                                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                                </button>
                            </>
                        )}
                        <button onClick={handleClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {activeDoc && activeViewUrl ? (
                        /* Inline Preview (iframe) */
                        <div className="flex-1 relative">
                            {iframeLoading && (
                                <div className="absolute inset-0 bg-white/90 z-10 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="animate-spin w-8 h-8 text-blue-500" />
                                    <p className="text-sm font-medium text-slate-500">Carregando pré-visualização...</p>
                                </div>
                            )}
                            {iframeError ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-12 gap-4 text-slate-500 px-6">
                                    <AlertTriangle className="w-12 h-12 text-amber-500" />
                                    <p className="font-bold text-slate-700">Não foi possível carregar a pré-visualização</p>
                                    <p className="text-sm text-center max-w-sm">
                                        O documento pode ter demorado demais ou o formato não é compatível com pré-visualização no navegador.
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => handleDownload(activeDoc)}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold transition-colors flex items-center gap-2"
                                        >
                                            <Download size={16} />
                                            Baixar Arquivo
                                        </button>
                                        <button
                                            onClick={handleBackToList}
                                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-bold transition-colors"
                                        >
                                            Voltar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <iframe
                                    src={activeViewUrl}
                                    className="w-full h-full min-h-[400px] border-0"
                                    style={{ height: isFullscreen ? 'calc(100vh - 140px)' : '60vh' }}
                                    onLoad={handleIframeLoad}
                                    onError={handleIframeError}
                                    title={activeDoc.name}
                                />
                            )}
                        </div>
                    ) : (
                        /* Document List */
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
                                    <button onClick={() => fetchDocs()} className="px-4 py-2 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 text-sm font-bold transition-colors">
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
                                            <DocRow
                                                key={doc.id}
                                                doc={doc}
                                                onView={handleView}
                                                onDownload={handleDownload}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function DocRow({ doc, onView, onDownload }: {
    doc: DocumentInfo;
    onView: (doc: DocumentInfo) => void;
    onDownload: (doc: DocumentInfo) => void;
}) {
    return (
        <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group">
            <div className="flex items-center gap-4 overflow-hidden">
                <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    doc.is_previewable ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"
                )}>
                    {doc.is_previewable ? <FileText size={20} /> : <FileQuestion size={20} />}
                </div>
                <div className="min-w-0">
                    <h4 className="font-bold text-sm text-slate-800 truncate" title={doc.name}>{doc.name}</h4>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5 truncate">
                        {doc.mimetype}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {doc.is_previewable ? (
                    <button
                        onClick={() => onView(doc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-blue-600 hover:text-white transition-colors"
                    >
                        <Eye size={14} />
                        Visualizar
                    </button>
                ) : (
                    <span className="text-[10px] text-slate-400 italic px-2">
                        Sem pré-visualização
                    </span>
                )}
                <div className="flex items-center gap-1 pl-2 border-l border-slate-100">
                    <button
                        onClick={() => onDownload(doc)}
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
