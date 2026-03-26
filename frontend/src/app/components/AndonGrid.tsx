import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Users, AlertTriangle, MonitorPlay, Activity, Clock, Package, Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AndonOperador } from './AndonOperador';
import { PlanningModal } from './PlanningModal';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from './ui/tooltip';

interface Workcenter {
    id: number;
    name: string;
    code: string;
    status: 'verde' | 'amarelo' | 'vermelho' | 'cinza' | 'amarelo_suave';
    status_reason?: string;
    owner_name: string;
    current_mo: string;
    started_at: string | null;
    planned_mos: any[];
}

interface AndonGridProps {
    username: string;
}

const Timer: React.FC<{ startedAt: string | null }> = ({ startedAt }) => {
    const [elapsed, setElapsed] = useState('00:00:00');

    useEffect(() => {
        if (!startedAt) {
            setElapsed('Aguardando início');
            return;
        }

        const updateTimer = () => {
            const start = new Date(startedAt).getTime();
            const now = new Date().getTime();
            const diff = Math.max(0, now - start);

            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);

            setElapsed(
                `${hours.toString().padStart(2, '0')}:${minutes
                    .toString()
                    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [startedAt]);

    return (
        <div className="flex items-center gap-1.5 text-xs font-mono font-bold opacity-70">
            <Clock className="w-3 h-3" />
            {elapsed}
        </div>
    );
};

export const AndonGrid: React.FC<AndonGridProps> = ({ username }) => {
    const [workcenters, setWorkcenters] = useState<Workcenter[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedWorkcenter, setSelectedWorkcenter] = useState<Workcenter | null>(null);
    const [planningWc, setPlanningWc] = useState<Workcenter | null>(null);

    const fetchWorkcenters = async () => {
        try {
            const data = await api.getAndonWorkcenters();
            setWorkcenters(data);
        } catch (error) {
            console.error('Failed to fetch workcenters', error);
        } finally {
            if (loading) setLoading(false);
        }
    };

    useEffect(() => {
        fetchWorkcenters();
        const interval = setInterval(fetchWorkcenters, 10000);
        return () => clearInterval(interval);
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'verde': return 'border-emerald-500 bg-emerald-50/30';
            case 'amarelo': return 'border-amber-400 bg-amber-50/40';
            case 'vermelho': return 'border-red-500 bg-red-50/50 animate-pulse-subtle';
            default: return 'border-slate-200 bg-slate-50/50';
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'verde': return 'bg-emerald-500 text-white';
            case 'amarelo': return 'bg-amber-400 text-slate-900';
            case 'vermelho': return 'bg-red-500 text-white';
            default: return 'bg-slate-300 text-slate-600';
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full text-slate-500">Carregando painel Andon...</div>;
    }

    if (selectedWorkcenter) {
        return (
            <AndonOperador
                workcenter={selectedWorkcenter as any}
                username={username}
                onBack={() => setSelectedWorkcenter(null)}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                        <Activity className="w-7 h-7 text-blue-600" />
                        Painel Andon
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Status e produção em tempo real</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => window.open('/andon-tv', '_blank')}
                        className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all shadow-sm text-sm font-bold active:scale-95"
                    >
                        <MonitorPlay className="w-4 h-4" />
                        Abrir TV
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {workcenters.map((wc) => (
                    <div
                        key={wc.id}
                        className={cn(
                            "relative flex flex-col rounded-[2rem] border-2 p-5 transition-all shadow-sm hover:shadow-xl hover:-translate-y-1 overflow-hidden",
                            getStatusColor(wc.status)
                        )}
                    >
                        {/* Header: WC Name + Status Indicator */}
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-black text-lg text-slate-900 truncate pr-2">{wc.name}</h3>
                            <TooltipProvider>
                                <Tooltip delayDuration={300}>
                                    <TooltipTrigger asChild>
                                        <div className={cn(
                                            "w-3 h-3 rounded-full flex-shrink-0 cursor-help transition-transform hover:scale-125", 
                                            getStatusBadge(wc.status)
                                        )} />
                                    </TooltipTrigger>
                                    <TooltipContent 
                                        side="top" 
                                        className="bg-slate-900 text-white border-slate-800 text-[10px] font-bold py-1.5 px-3 rounded-lg shadow-xl"
                                    >
                                        <p>{wc.status_reason || 'Operação Normal'}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>

                        {/* Content: New Hierarchy */}
                        <div className="space-y-4 flex-1">
                            {/* 1. Owner */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Users size={12} /> Responsável
                                </label>
                                <p className={cn(
                                    "text-sm font-bold truncate",
                                    wc.owner_name === "Sem responsável definido" ? "text-slate-400 italic" : "text-slate-700"
                                )}>
                                    {wc.owner_name}
                                </p>
                            </div>

                            {/* 2. Current MO */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Package size={12} /> Fabricação Atual
                                </label>
                                <div className={cn(
                                    "text-sm font-black leading-tight",
                                    wc.current_mo === "Sem fabricação em andamento" ? "text-slate-400 italic" : "text-blue-600"
                                )}>
                                    {wc.current_mo}
                                </div>
                            </div>

                            {/* 3. Timer */}
                            <div className="pt-2 border-t border-slate-100/50">
                                <Timer startedAt={wc.started_at} />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-6 flex items-center gap-2">
                            <button
                                onClick={() => setSelectedWorkcenter(wc)}
                                className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
                            >
                                Acionar Andon
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setPlanningWc(wc);
                                }}
                                className="p-2.5 bg-white border-2 border-slate-100 text-slate-600 rounded-xl hover:border-blue-200 hover:text-blue-600 transition-all active:scale-95 shadow-sm"
                                title="Ver Planejamento"
                            >
                                <Calendar size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {planningWc && (
                <PlanningModal
                    wcName={planningWc.name}
                    plannedMos={planningWc.planned_mos}
                    onClose={() => setPlanningWc(null)}
                />
            )}
        </div>
    );
};
