/**
 * DocViewerModal — visualizador de documentos inline padronizado.
 *
 * Uso:
 *   const { openDocs, DocViewer } = useDocViewer();
 *   <button onClick={() => openDocs(odooMoId, moNumber)}>Docs</button>
 *   <DocViewer />
 */
import React, { useState, useCallback } from 'react';
import { X, Download, Maximize2, Minimize2, ExternalLink, FileText, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

// ── helpers ───────────────────────────────────────────────────────────────────

function buildFullUrl(path: string): string {
    const token = localStorage.getItem('access_token');
    const tokenParam = token ? `${path.includes('?') ? '&' : '?'}token=${token}` : '';
    const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';
    let origin = '';
    try { origin = new URL(apiUrl).origin; } catch { origin = window.location.origin; }
    return `${origin}${path.startsWith('/') ? '' : '/'}${path}${tokenParam}`;
}

// ── modal ─────────────────────────────────────────────────────────────────────

interface DocViewerModalProps {
    viewUrl: string;
    downloadUrl: string;
    title: string;
    onClose: () => void;
}

export function DocViewerModal({ viewUrl, downloadUrl, title, onClose }: DocViewerModalProps) {
    const [fullscreen, setFullscreen] = useState(false);

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className={`bg-white flex flex-col overflow-hidden shadow-2xl transition-all duration-300 ${
                    fullscreen ? 'w-full h-full' : 'w-[92vw] h-[90vh] max-w-5xl rounded-2xl'
                }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <FileText size={15} className="text-blue-600 shrink-0" />
                        <span className="text-sm font-bold text-slate-800 truncate">{title}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                        <a
                            href={viewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Abrir em nova aba"
                        >
                            <ExternalLink size={15} />
                        </a>
                        <a
                            href={downloadUrl}
                            download
                            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Baixar"
                        >
                            <Download size={15} />
                        </a>
                        <button
                            onClick={() => setFullscreen(f => !f)}
                            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                            title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                        >
                            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Fechar"
                        >
                            <X size={15} />
                        </button>
                    </div>
                </div>
                {/* iframe */}
                <iframe src={viewUrl} className="flex-1 w-full border-0" title={title} />
            </div>
        </div>
    );
}

// ── hook ──────────────────────────────────────────────────────────────────────

interface DocViewerState {
    viewUrl: string;
    downloadUrl: string;
    title: string;
}

export function useDocViewer() {
    const [loading, setLoading] = useState<string | null>(null); // key = moId string
    const [viewer, setViewer] = useState<DocViewerState | null>(null);

    const openDocs = useCallback(async (odooMoId: number | string, moNumber: string) => {
        const id = Number(odooMoId);
        if (!id) {
            toast.error('MO sem ID Odoo — não é possível abrir documentos.');
            return;
        }
        const key = String(id);
        setLoading(key);
        try {
            const res = await api.getMODocuments(id);
            if (!res.documents || res.documents.length === 0) {
                toast.warning('Nenhum documento encontrado para esta MO.');
                return;
            }
            const doc = res.documents.find((d: any) => d.is_previewable) ?? res.documents[0];
            setViewer({
                viewUrl: buildFullUrl(doc.view_url),
                downloadUrl: buildFullUrl(doc.download_url),
                title: `${doc.name} — ${moNumber}`,
            });
        } catch (err: any) {
            toast.error('Erro ao buscar documentos: ' + (err.message || 'Erro desconhecido'));
        } finally {
            setLoading(null);
        }
    }, []);

    const isLoading = (key: string | number) => loading === String(key);

    const DocViewer = viewer
        ? () => <DocViewerModal {...viewer} onClose={() => setViewer(null)} />
        : () => null;

    return { openDocs, isLoading, DocViewer };
}
