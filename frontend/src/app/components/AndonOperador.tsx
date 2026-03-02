import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Button, cn } from './ui';
import { ArrowLeft, AlertTriangle, PackageOpen, CheckCircle2, Factory, MonitorPlay } from 'lucide-react';
import { toast } from 'sonner';

interface Workcenter {
    id: number;
    name: string;
    code: string;
    status: string;
}

interface AndonOperadorProps {
    workcenter: Workcenter;
    onBack: () => void;
    username: string;
}

export const AndonOperador: React.FC<AndonOperadorProps> = ({ workcenter, onBack, username }) => {
    const [activeWO, setActiveWO] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [currentStatus, setCurrentStatus] = useState(workcenter.status);
    const [reason, setReason] = useState('');
    const [showReasonModal, setShowReasonModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Manual fallback state
    const [manualWOId, setManualWOId] = useState('');
    const [manualMOId, setManualMOId] = useState('');

    const fetchActiveWorkorder = async () => {
        try {
            const wo = await api.getActiveWorkorder(workcenter.id);
            setActiveWO(wo);
        } catch (error) {
            console.error('Failed to fetch active WO:', error);
        } finally {
            if (loading) setLoading(false);
        }
    };

    useEffect(() => {
        fetchActiveWorkorder();
        const interval = setInterval(fetchActiveWorkorder, 15000);
        return () => clearInterval(interval);
    }, [workcenter.id]);

    const handleTrigger = async (color: 'verde' | 'amarelo' | 'vermelho') => {
        // Validação de WO Ativa ou Manual
        const woId = activeWO?.id || parseInt(manualWOId);
        const moId = activeWO?.production_id?.[0] || parseInt(manualMOId);

        if (!woId || !moId) {
            toast.error('É necessário ter uma OP ativa ou informar os IDs manualmente.');
            return;
        }

        if (color === 'vermelho' && !reason) {
            setShowReasonModal(true);
            return;
        }

        setIsSubmitting(true);
        try {
            if (color === 'verde') {
                await api.triggerAndon('basico', {
                    workcenter_id: workcenter.id,
                    workcenter_name: workcenter.name,
                    workorder_id: woId,
                    production_id: moId,
                    status: 'verde',
                    triggered_by: username
                });
                toast.success('Status retornado para Verde (Produção Normal)');
            }
            else if (color === 'amarelo') {
                const res = await api.triggerAndon('amarelo', {
                    workcenter_id: workcenter.id,
                    workcenter_name: workcenter.name,
                    workorder_id: woId,
                    production_id: moId,
                    triggered_by: username
                });
                if (res.path === 'odoo_picking') {
                    toast.success(`Estoque solicitado via Odoo (Picking #${res.picking_id})`);
                } else {
                    toast.warning('Requisição Local de Material criada (Sem componentes na MO)');
                }
            }
            else if (color === 'vermelho') {
                const res = await api.triggerAndon('vermelho', {
                    workcenter_id: workcenter.id,
                    workcenter_name: workcenter.name,
                    workorder_id: woId,
                    production_id: moId,
                    reason: reason,
                    triggered_by: username
                });

                if (!res.pause_ok) {
                    toast.error(`Falha ao pausar OP no Odoo: ${res.pause_error}`, { duration: 10000 });
                } else {
                    toast.success('Mesa paralisada e responsáveis notificados!');
                }
                setShowReasonModal(false);
                setReason('');
            }

            setCurrentStatus(color);

        } catch (error: any) {
            toast.error(error.message || `Erro ao registrar status ${color}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full text-slate-500">Buscando OP Ativa...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="flex items-center gap-4 border-b border-slate-200 pb-4">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">{workcenter.name}</h1>
                    <p className="text-slate-500">Terminal do Operador</p>
                </div>
            </div>

            {/* WO Info Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                        <Factory className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Operação Atual</h2>
                        {activeWO ? (
                            <>
                                <div className="text-xl font-bold text-slate-900">{activeWO.production_id?.[1] || 'MO Desconhecida'}</div>
                                <div className="text-slate-600 font-medium">{activeWO.name}</div>
                                <div className="text-sm text-slate-500 mt-1">Qtde: {activeWO.qty_produced} / {activeWO.qty_production}</div>
                            </>
                        ) : (
                            <div className="text-amber-600 font-medium">Nenhuma OP ativa detectada no Odoo.</div>
                        )}
                    </div>
                </div>

                {/* Fallback Manual se (não encontrar OP) */}
                {!activeWO && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 w-full md:w-auto">
                        <p className="text-xs font-semibold text-slate-500">SELEÇÃO MANUAL DE IDS (FALLBACK)</p>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                placeholder="ID da MO"
                                value={manualMOId}
                                onChange={e => setManualMOId(e.target.value)}
                                className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                            />
                            <input
                                type="number"
                                placeholder="ID da WO"
                                value={manualWOId}
                                onChange={e => setManualWOId(e.target.value)}
                                className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Acionamentos */}
            <h2 className="text-xl font-bold text-slate-800 pt-4">Acionar Status (Andon)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Botão Verde */}
                <button
                    disabled={isSubmitting || currentStatus === 'verde'}
                    onClick={() => handleTrigger('verde')}
                    className={cn(
                        "relative p-8 rounded-2xl border-4 flex flex-col items-center justify-center gap-4 transition-all overflow-hidden group shadow-lg",
                        currentStatus === 'verde'
                            ? "bg-emerald-500 border-emerald-600 text-white ring-4 ring-emerald-500/30 scale-105"
                            : "bg-white border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-600"
                    )}
                >
                    <CheckCircle2 className="w-16 h-16" />
                    <div className="text-2xl font-black uppercase tracking-widest text-center">
                        Produção<br />Normal
                    </div>
                </button>

                {/* Botão Amarelo */}
                <button
                    disabled={isSubmitting || currentStatus === 'amarelo'}
                    onClick={() => handleTrigger('amarelo')}
                    className={cn(
                        "relative p-8 rounded-2xl border-4 flex flex-col items-center justify-center gap-4 transition-all overflow-hidden group shadow-lg",
                        currentStatus === 'amarelo'
                            ? "bg-amber-400 border-amber-500 text-slate-900 ring-4 ring-amber-400/30 scale-105"
                            : "bg-white border-amber-400 text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                    )}
                >
                    <PackageOpen className="w-16 h-16" />
                    <div className="text-2xl font-black uppercase tracking-widest text-center">
                        Falta<br />Material
                    </div>
                </button>

                {/* Botão Vermelho */}
                <button
                    disabled={isSubmitting || currentStatus === 'vermelho'}
                    onClick={() => handleTrigger('vermelho')}
                    className={cn(
                        "relative p-8 rounded-2xl border-4 flex flex-col items-center justify-center gap-4 transition-all overflow-hidden group shadow-lg drop-shadow-[0_10px_15px_rgba(239,68,68,0.2)]",
                        currentStatus === 'vermelho'
                            ? "bg-red-600 border-red-700 text-white ring-8 ring-red-500/50 scale-105 animate-pulse"
                            : "bg-white border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-600"
                    )}
                >
                    <AlertTriangle className="w-16 h-16" />
                    <div className="text-2xl font-black uppercase tracking-widest text-center">
                        Parada<br />Crítica
                    </div>
                </button>

            </div>

            {/* Modal Motivo (Vermelho) */}
            {showReasonModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-slate-200 transform transition-all scale-100">
                        <div className="flex items-center gap-4 text-red-600 mb-6">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold">Motivo da Parada</h3>
                                <p className="text-slate-500 font-medium">Descreva por que a linha está parando.</p>
                            </div>
                        </div>

                        <textarea
                            autoFocus
                            className="w-full p-4 border-2 border-slate-200 rounded-xl mb-6 focus:border-red-500 focus:ring-4 focus:ring-red-500/20 text-lg transition-all"
                            rows={4}
                            placeholder="Ex: Máquina quebrou, falta de energia..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />

                        <div className="flex gap-4">
                            <Button
                                variant="secondary"
                                className="flex-1 h-14 text-lg font-bold rounded-xl"
                                onClick={() => {
                                    setShowReasonModal(false);
                                    setReason('');
                                }}
                            >
                                Cancelar
                            </Button>
                            <Button
                                className="flex-1 h-14 bg-red-600 hover:bg-red-700 text-white text-lg font-bold rounded-xl shadow-lg shadow-red-500/30"
                                onClick={() => handleTrigger('vermelho')}
                            >
                                Confirmar Parada
                            </Button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
