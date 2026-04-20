import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Button, cn } from './ui';
import { ArrowLeft, AlertTriangle, PackageOpen, CheckCircle2, Factory, MonitorPlay } from 'lucide-react';
import { toast } from 'sonner';
import { BottomSheet } from './BottomSheet';
import { useBreakpoint } from '@/hooks/useBreakpoint';

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
    const [isStop, setIsStop] = useState(false);
    const [activeColor, setActiveColor] = useState<'amarelo' | 'vermelho' | null>(null);
    const [showReasonModal, setShowReasonModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Manual fallback state
    const [manualWOId, setManualWOId] = useState('');
    const [manualMOId, setManualMOId] = useState('');

    const bp = useBreakpoint();
    const isMobile = bp === 'mobile';

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
        const woId = activeWO?.id || parseInt(manualWOId);
        const moId = activeWO?.production_id?.[0] || parseInt(manualMOId);

        if (!woId || !moId) {
            toast.error('É necessário ter uma OP ativa ou informar os IDs manualmente.');
            return;
        }

        if ((color === 'vermelho' || color === 'amarelo') && !showReasonModal) {
            setActiveColor(color);
            setIsStop(color === 'vermelho'); // Default stop=true for Red
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
            else {
                // Use the new structured call for Yellow and Red
                const callRes = await api.createAndonCall({
                    color: color === 'amarelo' ? 'YELLOW' : 'RED',
                    category: color === 'amarelo' ? 'Material' : 'Qualidade/Técnico', // Simplified for now
                    reason: reason || (color === 'amarelo' ? 'Falta de Material' : 'Parada Crítica'),
                    description: reason,
                    workcenter_id: workcenter.id,
                    workcenter_name: workcenter.name,
                    mo_id: moId,
                    triggered_by: username,
                    is_stop: isStop
                });

                if (color === 'vermelho' && !callRes.pause_ok && isStop) {
                    toast.warning('Chamado aberto, mas houve falha ao pausar OP no Odoo automaticamente.');
                } else {
                    toast.success(isStop ? 'Mesa PARADA e responsáveis notificados!' : 'Chamado aberto (Produção continua)');
                }

                setShowReasonModal(false);
                setReason('');
                setIsStop(false);
                setActiveColor(null);
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
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        {workcenter.owner_name && workcenter.owner_name !== "Sem responsável definido"
                            ? workcenter.owner_name
                            : workcenter.name}
                    </h1>
                    <p className="text-slate-500">
                        {workcenter.owner_name && workcenter.owner_name !== "Sem responsável definido"
                            ? workcenter.name
                            : 'Terminal do Operador'}
                    </p>
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
            <div className="grid grid-cols-3 gap-4 sm:gap-6">

                {/* Botão Verde */}
                <button
                    disabled={isSubmitting || currentStatus === 'verde'}
                    onClick={() => handleTrigger('verde')}
                    className={cn(
                        "relative p-4 sm:p-8 rounded-2xl border-4 flex flex-col items-center justify-center gap-2 sm:gap-4 transition-all overflow-hidden group shadow-lg min-h-[64px]",
                        currentStatus === 'verde'
                            ? "bg-emerald-500 border-emerald-600 text-white ring-4 ring-emerald-500/30 scale-105"
                            : "bg-white border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-600"
                    )}
                >
                    <CheckCircle2 className="w-8 h-8 sm:w-16 sm:h-16" />
                    <div className="text-sm sm:text-2xl font-black uppercase tracking-widest text-center">
                        Produção<br />Normal
                    </div>
                </button>

                {/* Botão Amarelo */}
                <button
                    disabled={isSubmitting || currentStatus === 'amarelo'}
                    onClick={() => handleTrigger('amarelo')}
                    className={cn(
                        "relative p-4 sm:p-8 rounded-2xl border-4 flex flex-col items-center justify-center gap-2 sm:gap-4 transition-all overflow-hidden group shadow-lg min-h-[64px]",
                        currentStatus === 'amarelo'
                            ? "bg-amber-400 border-amber-500 text-slate-900 ring-4 ring-amber-400/30 scale-105"
                            : "bg-white border-amber-400 text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                    )}
                >
                    <PackageOpen className="w-8 h-8 sm:w-16 sm:h-16" />
                    <div className="text-sm sm:text-2xl font-black uppercase tracking-widest text-center">
                        Falta<br />Material
                    </div>
                </button>

                {/* Botão Vermelho */}
                <button
                    disabled={isSubmitting || currentStatus === 'vermelho'}
                    onClick={() => handleTrigger('vermelho')}
                    className={cn(
                        "relative p-4 sm:p-8 rounded-2xl border-4 flex flex-col items-center justify-center gap-2 sm:gap-4 transition-all overflow-hidden group shadow-lg drop-shadow-[0_10px_15px_rgba(239,68,68,0.2)] min-h-[64px]",
                        currentStatus === 'vermelho'
                            ? "bg-red-600 border-red-700 text-white ring-8 ring-red-500/50 scale-105 animate-pulse"
                            : "bg-white border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-600"
                    )}
                >
                    <AlertTriangle className="w-8 h-8 sm:w-16 sm:h-16" />
                    <div className="text-sm sm:text-2xl font-black uppercase tracking-widest text-center">
                        Parada<br />Crítica
                    </div>
                </button>

            </div>

            {/* Modal Motivo — BottomSheet em mobile, modal centralizado em >= sm */}
            {isMobile ? (
                <BottomSheet
                    isOpen={showReasonModal}
                    onClose={() => {
                        setShowReasonModal(false);
                        setReason('');
                        setIsStop(false);
                        setActiveColor(null);
                    }}
                    title="Motivo da Parada"
                    maxHeight="85vh"
                >
                    <div className="p-6 space-y-4">
                        <p className="text-slate-500 font-medium">Descreva por que a linha está parando.</p>

                        <textarea
                            autoFocus
                            className={cn(
                                "w-full p-4 border-2 rounded-xl mb-4 focus:ring-4 text-lg transition-all",
                                activeColor === 'vermelho' ? "border-slate-200 focus:border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-amber-500 focus:ring-amber-500/20"
                            )}
                            rows={3}
                            placeholder={activeColor === 'vermelho' ? "Descreva o problema técnico..." : "Descreva o material em falta..."}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />

                        <div
                            className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                            onClick={() => setIsStop(!isStop)}
                        >
                            <input type="checkbox" checked={isStop} onChange={() => {}} className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                            <div>
                                <div className="font-bold text-slate-800">Esta situação bloqueia a produção?</div>
                                <div className="text-xs text-slate-500">Marque se a mesa ficará totalmente parada.</div>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <Button variant="secondary" className="flex-1 h-14 text-lg font-bold rounded-xl min-h-[44px]"
                                onClick={() => { setShowReasonModal(false); setReason(''); setIsStop(false); setActiveColor(null); }}>
                                Cancelar
                            </Button>
                            <Button
                                className={cn("flex-1 h-14 text-white text-lg font-bold rounded-xl shadow-lg transition-all min-h-[44px]",
                                    activeColor === 'vermelho' ? "bg-red-600 hover:bg-red-700 shadow-red-500/30" : "bg-amber-500 hover:bg-amber-600 shadow-amber-500/30")}
                                onClick={() => handleTrigger(activeColor || 'vermelho')}>
                                Confirmar Chamado
                            </Button>
                        </div>
                    </div>
                </BottomSheet>
            ) : (
                showReasonModal && (
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
                                className={cn(
                                    "w-full p-4 border-2 rounded-xl mb-4 focus:ring-4 text-lg transition-all",
                                    activeColor === 'vermelho' ? "border-slate-200 focus:border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-amber-500 focus:ring-amber-500/20"
                                )}
                                rows={3}
                                placeholder={activeColor === 'vermelho' ? "Descreva o problema técnico..." : "Descreva o material em falta..."}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />

                            <div
                                className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 mb-6 cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => setIsStop(!isStop)}
                            >
                                <input type="checkbox" checked={isStop} onChange={() => {}} className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                                <div>
                                    <div className="font-bold text-slate-800">Esta situação bloqueia a produção?</div>
                                    <div className="text-xs text-slate-500">Marque se a mesa ficará totalmente parada.</div>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <Button variant="secondary" className="flex-1 h-14 text-lg font-bold rounded-xl min-h-[44px]"
                                    onClick={() => { setShowReasonModal(false); setReason(''); setIsStop(false); setActiveColor(null); }}>
                                    Cancelar
                                </Button>
                                <Button
                                    className={cn("flex-1 h-14 text-white text-lg font-bold rounded-xl shadow-lg transition-all min-h-[44px]",
                                        activeColor === 'vermelho' ? "bg-red-600 hover:bg-red-700 shadow-red-500/30" : "bg-amber-500 hover:bg-amber-600 shadow-amber-500/30")}
                                    onClick={() => handleTrigger(activeColor || 'vermelho')}>
                                    Confirmar Chamado
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            )}

        </div>
    );
};
