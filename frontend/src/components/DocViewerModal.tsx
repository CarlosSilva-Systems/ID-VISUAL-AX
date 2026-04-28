/**
 * DocViewerModal — visualizador de documentos inline padronizado.
 *
 * Fluxo otimizado em 2 etapas:
 *   1. Clique no botão → abre modal de lista imediatamente (feedback instantâneo
 *      assim que a API responde, sem aguardar carregamento de binário)
 *   2. Clique em um doc da lista → carrega o binário e exibe o viewer
 *
 * Excecao: se a MO tiver exatamente 1 documento previewable, abre direto
 * no viewer (comportamento anterior preservado para o caso mais comum).
 *
 * Uso:
 *   const { openDocs, isLoading, DocViewer } = useDocViewer();
 *   <button onClick={() => openDocs(odooMoId, moNumber)} disabled={isLoading(odooMoId)}>Docs</button>
 *   <DocViewer />
 */
import React, { useState, useCallback } from 'react';
import {
    X, Download, Maximize2, Minimize2, ExternalLink,
    FileText, Loader2, AlertTriangle, ChevronLeft, File,
    FileImage, FileType2, Pin,
} from 'lucide-react';
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

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocIcon({ mimetype }: { mimetype: string }) {
    if (mimetype?.startsWith('image/')) return <FileImage size={16} className="text-green-500 shrink-0" />;
    if (mimetype === 'application/pdf') return <FileType2 size={16} className="text-red-500 shrink-0" />;
    return <File size={16} className="text-slate-400 shrink-0" />;
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface DocMeta {
    id: string;
    name: string;
    mimetype: string;
    size: number;
    is_previewable: boolean;
    view_url: string;
    download_url: string;
}

// ── DocListModal ──────────────────────────────────────────────────────────────

interface DocListModalProps {
    moNumber: string;
    docs: DocMeta[];
    onSelectDoc: (doc: DocMeta) => void;
    onClose: () => void;
}

export function DocListModal({ moNumber, docs, onSelectDoc, onClose }: DocListModalProps) {
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white w-[92vw] max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <FileText size={15} className="text-blue-600 shrink-0" />
                        <span className="text-sm font-bold text-slate-800 truncate">
                            Documentos — {moNumber}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full shrink-0">
                            {docs.length}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Fechar"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Lista */}
                <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
                    {docs.map((doc) => (
                        <div
                            key={doc.id}
                            className="relative flex items-center gap-3 px-5 py-3 hover:bg-blue-50 transition-colors group"
                        >
                            <DocIcon mimetype={doc.mimetype} />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
                                <p className="text-[11px] text-slate-400">
                                    {doc.mimetype}{doc.size ? ` · ${formatBytes(doc.size)}` : ''}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                {doc.is_previewable && (
                                    <button
                                        onClick={() => onSelectDoc(doc)}
                                        className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                                        title="Visualizar"
                                    >
                                        Abrir
                                    </button>
                                )}
                                <a
                                    href={buildFullUrl(doc.download_url)}
                                    download
                                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                                    title="Baixar"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Download size={14} />
                                </a>
                            </div>
                            {doc.is_previewable && (
                                <button
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    onClick={() => onSelectDoc(doc)}
                                    aria-label={`Abrir ${doc.name}`}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── DocViewerModal ────────────────────────────────────────────────────────────

interface DocViewerModalProps {
    viewUrl: string;
    downloadUrl: string;
    title: string;
    onClose: () => void;
    /** Exibido quando o viewer foi aberto a partir de uma lista de múltiplos docs */
    onBack?: () => void;
    /** Callback para abrir em floating viewer */
    onOpenFloating?: () => void;
}

export function DocViewerModal({ viewUrl, downloadUrl, title, onClose, onBack, onOpenFloating }: DocViewerModalProps) {
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
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors shrink-0"
                                title="Voltar à lista"
                            >
                                <ChevronLeft size={15} />
                            </button>
                        )}
                        <FileText size={15} className="text-blue-600 shrink-0" />
                        <span className="text-sm font-bold text-slate-800 truncate">{title}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                        {onOpenFloating && (
                            <button
                                onClick={() => {
                                    onOpenFloating();
                                    onClose();
                                    toast.success('Documento aberto em janela flutuante');
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                                title="Abrir em janela flutuante (sempre visível)"
                            >
                                <Pin size={13} />
                                <span className="hidden sm:inline">Pop-up</span>
                            </button>
                        )}
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

/**
 * Timeout para a requisicao de listagem de documentos.
 * Se o Odoo nao responder em DOCS_FETCH_TIMEOUT_MS, a requisicao e abortada
 * e o usuario recebe feedback imediato para tentar novamente.
 */
const DOCS_FETCH_TIMEOUT_MS = 15_000; // 15 segundos

/**
 * Estado interno do modal: discriminated union entre lista e viewer.
 * Armazenar 'docs' e 'moNumber' no estado 'viewer' permite que o botao
 * 'Voltar' restaure a lista sem uma nova chamada a API.
 */
type ModalState =
    | { type: 'list'; moNumber: string; docs: DocMeta[]; odooMoId: number }
    | { type: 'viewer'; viewUrl: string; downloadUrl: string; title: string; docs: DocMeta[]; moNumber: string; odooMoId: number; documentType: 'diagrama' | 'legenda' };

export function useDocViewer(options?: { onOpenFloating?: (moId: string, moNumber: string, documentType: 'diagrama' | 'legenda') => void }) {
    const [loading, setLoading] = useState<string | null>(null);
    const [modal, setModal] = useState<ModalState | null>(null);

    /**
     * Ref para o AbortController da requisicao em andamento.
     * Permite cancelar a requisicao anterior se o usuario clicar em outro
     * botao de docs antes da primeira terminar, e tambem e usado pelo
     * timeout interno para abortar requisicoes lentas.
     */
    const abortRef = React.useRef<AbortController | null>(null);

    const openDocs = useCallback(async (odooMoId: number | string, moNumber: string) => {
        const id = Number(odooMoId);
        if (!id) {
            toast.error('MO sem ID Odoo — não é possível abrir documentos.');
            return;
        }
        const key = String(id);

        // Cancela requisicao anterior se ainda estiver em andamento.
        // Isso garante que apenas 1 requisicao fica ativa por vez e que
        // o loading do botao anterior e limpo corretamente.
        if (abortRef.current) {
            abortRef.current.abort();
        }

        const controller = new AbortController();
        abortRef.current = controller;

        // Timeout: aborta automaticamente apos DOCS_FETCH_TIMEOUT_MS.
        // O timer e limpo no finally para nao vazar se a requisicao terminar antes.
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, DOCS_FETCH_TIMEOUT_MS);

        setLoading(key);
        try {
            const res = await api.getMODocuments(id, { signal: controller.signal });
            if (!res.documents || res.documents.length === 0) {
                toast.warning('Nenhum documento encontrado para esta MO.');
                return;
            }

            const previewable: DocMeta[] = res.documents.filter((d: DocMeta) => d.is_previewable);

            // Caso especial: exatamente 1 documento previewable → abre direto no viewer,
            // preservando o comportamento anterior e evitando uma tela intermediaria
            // desnecessaria para o caso mais comum.
            if (res.documents.length === 1 && previewable.length === 1) {
                const doc = previewable[0];
                const documentType = doc.name.toLowerCase().includes('diagrama') ? 'diagrama' : 'legenda';
                setModal({
                    type: 'viewer',
                    viewUrl: buildFullUrl(doc.view_url),
                    downloadUrl: buildFullUrl(doc.download_url),
                    title: `${doc.name} — ${moNumber}`,
                    docs: res.documents,
                    moNumber,
                    odooMoId: id,
                    documentType,
                });
                return;
            }

            // Caso geral: exibe lista para o usuario escolher qual documento abrir.
            // O binario so e carregado (via iframe) quando o usuario seleciona um doc,
            // eliminando o tempo de espera percebido ao clicar no botao.
            setModal({ type: 'list', moNumber, docs: res.documents, odooMoId: id });
        } catch (err: any) {
            // AbortError pode ser: timeout interno OU cancelamento por novo clique.
            // Distinguimos pelo estado do controller para dar a mensagem certa.
            if (err instanceof DOMException && err.name === 'AbortError') {
                if (controller.signal.aborted) {
                    // Foi o timeout — informa o usuario
                    toast.error('Tempo esgotado ao buscar documentos. Tente novamente.');
                }
                // Se foi cancelado por novo clique, nao exibe nada (o novo clique
                // ja iniciou seu proprio loading)
                return;
            }
            toast.error('Erro ao buscar documentos: ' + (err.message || 'Erro desconhecido'));
        } finally {
            clearTimeout(timeoutId);
            // Limpa o loading apenas se este controller ainda e o ativo.
            // Evita que um abort por novo clique limpe o loading do novo clique.
            if (abortRef.current === controller) {
                setLoading(null);
                abortRef.current = null;
            }
        }
    }, []);

    const handleSelectDoc = useCallback((doc: DocMeta, moNumber: string, allDocs: DocMeta[], odooMoId: number) => {
        const documentType = doc.name.toLowerCase().includes('diagrama') ? 'diagrama' : 'legenda';
        setModal({
            type: 'viewer',
            viewUrl: buildFullUrl(doc.view_url),
            downloadUrl: buildFullUrl(doc.download_url),
            title: `${doc.name} — ${moNumber}`,
            docs: allDocs,
            moNumber,
            odooMoId,
            documentType,
        });
    }, []);

    const handleBack = useCallback(() => {
        setModal(prev =>
            prev?.type === 'viewer'
                ? { type: 'list', moNumber: prev.moNumber, docs: prev.docs, odooMoId: prev.odooMoId }
                : null
        );
    }, []);

    const isLoading = useCallback((key: string | number) => loading === String(key), [loading]);

    const DocViewer = useCallback(() => {
        if (!modal) return null;

        if (modal.type === 'list') {
            return (
                <DocListModal
                    moNumber={modal.moNumber}
                    docs={modal.docs}
                    onSelectDoc={(doc) => handleSelectDoc(doc, modal.moNumber, modal.docs, modal.odooMoId)}
                    onClose={() => setModal(null)}
                />
            );
        }

        const handleOpenFloating = options?.onOpenFloating
            ? () => options.onOpenFloating!(String(modal.odooMoId), modal.moNumber, modal.documentType)
            : undefined;

        return (
            <DocViewerModal
                viewUrl={modal.viewUrl}
                downloadUrl={modal.downloadUrl}
                title={modal.title}
                onClose={() => setModal(null)}
                onBack={modal.docs.length > 1 ? handleBack : undefined}
                onOpenFloating={handleOpenFloating}
            />
        );
    }, [modal, handleSelectDoc, handleBack, options]);

    // 'docsLoading' exportado como alias de 'isLoading' para retrocompatibilidade
    // com componentes que ja usavam a desestruturacao: { isLoading: docsLoading }
    return { openDocs, isLoading, docsLoading: isLoading, DocViewer };
}
