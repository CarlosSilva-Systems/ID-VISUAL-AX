import React, { useState } from 'react';
import {
    MatrixRow,
    MatrixColumn,
    MatrixCell as MatrixCellType,
    TaskStatusEnum
} from '../../types/matrix';
import { StatusCell } from './StatusCell';
import { MoreHorizontal, Clock, Box, FileText, Loader2, X, Download, Maximize2, Minimize2, ExternalLink } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner';

// ── Inline Doc Viewer Modal ───────────────────────────────────────────────────
interface DocViewerProps {
    url: string;
    title: string;
    downloadUrl: string;
    onClose: () => void;
}

const DocViewer: React.FC<DocViewerProps> = ({ url, title, downloadUrl, onClose }) => {
    const [fullscreen, setFullscreen] = useState(false);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${fullscreen ? 'w-full h-full rounded-none' : 'w-[90vw] h-[90vh] max-w-5xl'}`}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <FileText size={16} className="text-blue-600 shrink-0" />
                        <span className="text-sm font-bold text-slate-800 truncate">{title}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-4">
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Abrir em nova aba"
                        >
                            <ExternalLink size={16} />
                        </a>
                        <a
                            href={downloadUrl}
                            download
                            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Baixar"
                        >
                            <Download size={16} />
                        </a>
                        <button
                            onClick={() => setFullscreen(f => !f)}
                            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                            title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                        >
                            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Fechar"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
                {/* iframe */}
                <iframe
                    src={url}
                    className="flex-1 w-full border-0"
                    title={title}
                />
            </div>
        </div>
    );
};

interface MatrixTableProps {
    columns: MatrixColumn[];
    rows: MatrixRow[];
    onTaskClick: (
        requestId: string,
        taskCode: string,
        currentCell: MatrixCellType,
        nextStatus: TaskStatusEnum
    ) => void;
    onOpenDrawer: (requestId: string, taskCode: string, cell: MatrixCellType) => void;
}

export const MatrixTable: React.FC<MatrixTableProps> = ({
    columns,
    rows,
    onTaskClick,
    onOpenDrawer
}) => {
    const [undoConfirm, setUndoConfirm] = useState<{
        requestId: string;
        taskCode: string;
        currentCell: MatrixCellType;
        nextStatus: TaskStatusEnum;
    } | null>(null);

    const [docsLoadingId, setDocsLoadingId] = useState<string | null>(null);
    const [docViewer, setDocViewer] = useState<{ url: string; title: string; downloadUrl: string } | null>(null);

    const buildFullUrl = (path: string): string => {
        const token = localStorage.getItem('access_token');
        const tokenParam = token ? `${path.includes('?') ? '&' : '?'}token=${token}` : '';
        const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';
        let origin = '';
        try { origin = new URL(apiUrl).origin; } catch { origin = window.location.origin; }
        return `${origin}${path.startsWith('/') ? '' : '/'}${path}${tokenParam}`;
    };

    const handleOpenDocs = async (row: MatrixRow) => {
        if (!row.odoo_mo_id) {
            toast.error('MO sem ID Odoo — não é possível abrir documentos.');
            return;
        }
        setDocsLoadingId(row.request_id);
        try {
            const res = await api.getMODocuments(row.odoo_mo_id);
            if (!res.documents || res.documents.length === 0) {
                toast.warning('Nenhum documento encontrado para esta MO.');
                return;
            }
            const doc = res.documents.find((d: any) => d.is_previewable) ?? res.documents[0];
            setDocViewer({
                url: buildFullUrl(doc.view_url),
                downloadUrl: buildFullUrl(doc.download_url),
                title: `${doc.name} — ${row.mo_number}`,
            });
        } catch (err: any) {
            toast.error('Erro ao buscar documentos: ' + (err.message || 'Erro desconhecido'));
        } finally {
            setDocsLoadingId(null);
        }
    };

    // Helper to determine next status (Lean Cycle)
    const getNextStatus = (current: TaskStatusEnum, isDocs: boolean): TaskStatusEnum | null => {
        switch (current) {
            case TaskStatusEnum.nao_iniciado:
                return TaskStatusEnum.montado;
            case TaskStatusEnum.montado:
                return TaskStatusEnum.impresso;
            case TaskStatusEnum.impresso:
                // Regression requires confirmation handled by parent/UI logic
                return isDocs ? TaskStatusEnum.montado : TaskStatusEnum.nao_iniciado;
            default:
                return null;
        }
    };

    const handleCellClick = (requestId: string, taskCode: string, cell: MatrixCellType) => {
        if (cell.status === TaskStatusEnum.nao_aplicavel || cell.status === TaskStatusEnum.bloqueado) {
            return;
        }

        const isDocs = taskCode === 'DOCS_Epson';
        const next = getNextStatus(cell.status, isDocs);

        if (!next) return;

        // Undo Rule: If leaving Green (Impresso), require confirmation
        if (cell.status === TaskStatusEnum.impresso) {
            setUndoConfirm({ requestId, taskCode, currentCell: cell, nextStatus: next });
        } else {
            onTaskClick(requestId, taskCode, cell, next);
        }
    };

    return (
        <div className="flex-1 overflow-auto relative">
            <table className="w-full border-collapse">
                <thead className="sticky top-0 z-20 bg-white shadow-sm ring-1 ring-slate-200">
                    <tr>
                        <th className="sticky left-0 z-30 bg-white p-4 text-left w-[360px] border-b border-black/10 shadow-[4px_0_16px_rgba(0,0,0,0.05)]">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Fabricação / MO</span>
                        </th>
                        {columns.map((col) => (
                            <th key={col.task_code} className="p-2 min-w-[140px] text-center border-b border-r border-slate-100 last:border-r-0">
                                <span className="text-xs font-bold text-slate-600 block">{col.label}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{col.task_code}</span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.request_id} className="hover:bg-slate-50 group transition-colors">
                            {/* Sticky MO Info Column */}
                            <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 p-4 border-b border-slate-100 shadow-[4px_0_16px_rgba(0,0,0,0.05)]">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-slate-400">#{row.request_id.slice(0, 4)}</span>
                                            <h3 className="font-black text-slate-800 text-lg">{row.mo_number}</h3>
                                            <button
                                                onClick={() => handleOpenDocs(row)}
                                                disabled={docsLoadingId === row.request_id}
                                                title="Abrir documentos da MO"
                                                className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors disabled:opacity-60 shrink-0"
                                            >
                                                {docsLoadingId === row.request_id
                                                    ? <Loader2 size={11} className="animate-spin" />
                                                    : <FileText size={11} />
                                                }
                                                Docs
                                            </button>
                                        </div>
                                        <p className="text-sm font-medium text-slate-600 max-w-[280px]">{row.obra_nome}</p>

                                        <div className="flex items-center gap-4 mt-2">
                                            <div className="flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                                <Box size={12} />
                                                {row.package_code}
                                            </div>
                                            <div className="flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                                                <Clock size={12} />
                                                {row.sla_text || '24h'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <span className="block text-2xl font-black text-slate-800">{row.quantity}</span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">UNID</span>
                                    </div>
                                </div>
                            </td>

                            {/* Status Cells */}
                            {columns.map((col) => {
                                const cell = row.cells[col.task_code];
                                return (
                                    <td key={col.task_code} className="p-2 border-b border-r border-slate-100 last:border-r-0 relative">
                                        <div className="flex items-center gap-1">
                                            <StatusCell
                                                taskCode={col.task_code}
                                                status={cell?.status || TaskStatusEnum.nao_aplicavel}
                                                onClick={() => cell && handleCellClick(row.request_id, col.task_code, cell)}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    if (cell) onOpenDrawer(row.request_id, col.task_code, cell);
                                                }}
                                                disabled={!cell}
                                            />
                                            {/* Context Menu Trigger (alternative to right click) */}
                                            {cell && cell.status !== TaskStatusEnum.nao_aplicavel && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onOpenDrawer(row.request_id, col.task_code, cell); }}
                                                    className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <MoreHorizontal size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Doc Viewer Modal */}
            {docViewer && (
                <DocViewer
                    url={docViewer.url}
                    title={docViewer.title}
                    downloadUrl={docViewer.downloadUrl}
                    onClose={() => setDocViewer(null)}
                />
            )}

            {/* Undo Confirmation Modal */}
            {undoConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Voltar Etapa?</h3>
                        <p className="text-slate-600 mb-6">
                            A tarefa já foi concluída. Deseja realmente voltar o status para
                            <span className="font-bold text-amber-600 ml-1">
                                {undoConfirm.taskCode === 'DOCS_Epson' ? 'Imprimindo' : 'Montado'}
                            </span>?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setUndoConfirm(null)}
                                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    onTaskClick(undoConfirm.requestId, undoConfirm.taskCode, undoConfirm.currentCell, undoConfirm.nextStatus);
                                    setUndoConfirm(null);
                                }}
                                className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800"
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
