import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import {
    BatchMatrixResponse,
    TaskStatusEnum,
    MatrixCell
} from '../../types/matrix';
import { BatchHeader } from './BatchHeader';
import { BatchKPIs } from './BatchKPIs';
import { MatrixTable } from './MatrixTable';
import { QADrawer } from './QADrawer';
import { ConfirmModal } from '../../app/components/ConfirmModal';
import { AddFabricationsModal } from './AddFabricationsModal';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, RefreshCw, Box, X, ShieldAlert } from 'lucide-react';

interface ActiveBatchProps {
    batchId?: string;
    onBack: () => void;
    onNavigateFinalizadas?: () => void;
}

interface Pendency {
    mo_name: string;
    request_id: string;
    task_code: string;
    status: string;
    reason: string;
}

const DEV_BATCH_ID = "00000000-0000-0000-0000-000000000000";

export const ActiveBatch: React.FC<ActiveBatchProps> = ({ onBack, onNavigateFinalizadas }) => {
    const { batchId } = useParams<{ batchId: string }>();
    const effectiveBatchId = batchId || DEV_BATCH_ID;
    const [data, setData] = useState<BatchMatrixResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [finalizing, setFinalizing] = useState(false);
    const [confirmFinalize, setConfirmFinalize] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);

    // Pendencies Modal
    const [pendencies, setPendencies] = useState<Pendency[]>([]);
    const [showPendencies, setShowPendencies] = useState(false);

    // QA Drawer State
    const [qaDrawerOpen, setQaDrawerOpen] = useState(false);
    const [qaPendingUpdate, setQaPendingUpdate] = useState<{
        requestId: string;
        taskCode: string;
        currentCell: MatrixCell;
        nextStatus: TaskStatusEnum;
    } | null>(null);

    const fetchMatrix = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.getBatchMatrix(effectiveBatchId);
            setData(response);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Falha ao carregar lote');
            toast.error('Erro ao carregar dados do lote');
        } finally {
            setLoading(false);
        }
    }, [effectiveBatchId]);

    useEffect(() => {
        fetchMatrix();
    }, [fetchMatrix]);

    const handleTaskUpdate = async (
        requestId: string,
        taskCode: string,
        currentCell: MatrixCell,
        nextStatus: TaskStatusEnum,
        updateNote?: string
    ) => {
        if (!data) return;

        const previousData = { ...data };
        const newData = JSON.parse(JSON.stringify(data)) as BatchMatrixResponse;
        const row = newData.rows.find(r => r.request_id === requestId);
        if (row && row.cells[taskCode]) {
            row.cells[taskCode].status = nextStatus;
            row.cells[taskCode].version += 1;
        }
        setData(newData);

        try {
            const response = await api.updateBatchTask(effectiveBatchId, {
                request_id: requestId,
                task_code: taskCode,
                new_status: nextStatus,
                version: currentCell.version,
                update_note: updateNote,
                blocked_reason: currentCell.blocked_reason // Ensure consistency
            });

            setData(prev => {
                if (!prev) return null;
                const up = JSON.parse(JSON.stringify(prev)) as BatchMatrixResponse;
                up.stats = response.updated_stats;
                const targetRow = up.rows.find(r => r.request_id === requestId);
                if (targetRow) {
                    targetRow.cells[taskCode] = response.updated_cell;
                }
                return up;
            });

            if (qaPendingUpdate) {
                setQaDrawerOpen(false);
                setQaPendingUpdate(null);
            }

        } catch (err: any) {
            setData(previousData);

            if (err.status === 409) {
                toast.error('Conflito de Edição', {
                    description: 'Esta tarefa foi alterada por outro usuário.',
                    action: {
                        label: 'Recarregar',
                        onClick: fetchMatrix
                    }
                });
            } else if (err.status === 400 && taskCode === 'QA_FINAL') {
                if (!updateNote) {
                    setQaPendingUpdate({ requestId, taskCode, currentCell, nextStatus });
                    setQaDrawerOpen(true);
                    return;
                }
                toast.error(err.message || 'Erro de validação');
            } else {
                toast.error('Erro ao atualizar tarefa');
            }
        }
    };

    const handleFinalizeBatch = async () => {
        setFinalizing(true);
        try {
            const result = await api.finalizeBatch(effectiveBatchId);

            const errCount = result.errors?.length || 0;
            if (errCount > 0) {
                toast.warning(`Lote finalizado com ${errCount} falha(s) Odoo`, {
                    description: 'Algumas atividades não puderam ser fechadas no Odoo.',
                    duration: 6000
                });
            } else {
                toast.success('Lote finalizado com sucesso!', {
                    description: `${result.odoo_activities_closed || 0} atividades concluídas no Odoo.`
                });
            }

            if (onNavigateFinalizadas) {
                onNavigateFinalizadas();
            } else {
                onBack();
            }
        } catch (err: any) {
            if (err.status === 400 && err.data?.pendencies) {
                setPendencies(err.data.pendencies);
                setShowPendencies(true);
            } else {
                toast.error(err.message || 'Erro ao finalizar lote');
            }
        } finally {
            setFinalizing(false);
        }
    };

    // Render States
    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-blue-600" size={48} />
                    <p className="text-slate-500 font-medium animate-pulse">Carregando Lote...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="h-full flex items-center justify-center bg-red-50">
                <div className="text-center">
                    <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Falha ao carregar</h2>
                    <p className="text-slate-600 mb-6">{error}</p>
                    <button
                        onClick={fetchMatrix}
                        className="px-6 py-2 bg-white text-slate-800 font-bold rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 flex items-center gap-2 mx-auto"
                    >
                        <RefreshCw size={18} /> Tentar Novamente
                    </button>
                </div>
            </div>
        );
    }

    if (data.rows.length === 0) {
        return (
            <div className="h-full flex flex-col">
                <BatchHeader
                    batchName={data.batch_name}
                    batchId={data.batch_id}
                    status={data.batch_status}
                    onBack={onBack}
                    onAddFabrications={() => setShowAddModal(true)}
                    onFinishBatch={() => { }}
                />
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                    <Box size={64} className="mb-4 opacity-50" />
                    <p className="font-bold text-lg">Nenhuma fabricação neste lote</p>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="mt-4 text-blue-600 font-bold hover:underline"
                    >
                        Adicionar Fabricações
                    </button>
                </div>
                {showAddModal && (
                    <AddFabricationsModal
                        batchId={effectiveBatchId}
                        onClose={() => setShowAddModal(false)}
                        onAdded={fetchMatrix}
                    />
                )}
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <BatchHeader
                batchName={data.batch_name}
                batchId={data.batch_id}
                status={data.batch_status}
                onBack={onBack}
                onAddFabrications={() => setShowAddModal(true)}
                onFinishBatch={() => setConfirmFinalize(true)}
                isFinishing={finalizing}
            />

            <div className="flex-1 px-3 pb-3 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8 flex flex-col overflow-hidden">
                <BatchKPIs
                    stats={data.stats}
                    activeFilter={activeFilter}
                    onFilter={(f) => setActiveFilter(f === activeFilter ? null : f)}
                />

                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <MatrixTable
                        columns={data.columns}
                        rows={data.rows}
                        onTaskClick={(reqId, code, cell, next) => handleTaskUpdate(reqId, code, cell, next)}
                        onOpenDrawer={() => toast.info('Drawer de detalhes em breve')}
                    />
                </div>
            </div>

            <QADrawer
                isOpen={qaDrawerOpen}
                onClose={() => {
                    setQaDrawerOpen(false);
                    setQaPendingUpdate(null);
                    fetchMatrix();
                }}
                onConfirm={(note) => {
                    if (qaPendingUpdate) {
                        handleTaskUpdate(
                            qaPendingUpdate.requestId,
                            qaPendingUpdate.taskCode,
                            qaPendingUpdate.currentCell,
                            qaPendingUpdate.nextStatus,
                            note
                        );
                    }
                }}
            />

            {showAddModal && (
                <AddFabricationsModal
                    batchId={effectiveBatchId}
                    onClose={() => setShowAddModal(false)}
                    onAdded={fetchMatrix}
                />
            )}

            <ConfirmModal
                isOpen={confirmFinalize}
                title="Finalizar Lote?"
                description="Tem certeza que deseja finalizar este lote? Todas as atividades pendentes serão concluídas no Odoo."
                confirmLabel="Finalizar"
                variant="success"
                isLoading={finalizing}
                onConfirm={() => { setConfirmFinalize(false); handleFinalizeBatch(); }}
                onCancel={() => setConfirmFinalize(false)}
            />

            {/* Pendencies Modal */}
            {showPendencies && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-50 rounded-xl">
                                    <ShieldAlert className="w-5 h-5 text-amber-600" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-slate-800">Pendências para Finalizar</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">{pendencies.length} item(s) precisam de atenção</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowPendencies(false)}
                                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        <th className="text-left pb-3">Fabricação</th>
                                        <th className="text-left pb-3">Tarefa</th>
                                        <th className="text-left pb-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendencies.map((p, i) => (
                                        <tr key={i} className="border-t border-slate-50">
                                            <td className="py-3 text-sm font-medium text-slate-700">{p.mo_name}</td>
                                            <td className="py-3">
                                                <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded">
                                                    {p.task_code}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                <span className="inline-flex items-center px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-[11px] font-bold uppercase">
                                                    {p.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-6 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setShowPendencies(false)}
                                className="px-6 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all"
                            >
                                Entendi
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
