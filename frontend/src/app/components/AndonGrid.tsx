import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Users, AlertTriangle, MonitorPlay, Activity, Clock, Package, Calendar, KeyRound } from 'lucide-react';
import { SkeletonCard } from './SkeletonLoader';
import { cn } from '../../lib/utils';
import { AndonOperador } from './AndonOperador';
import { PlanningModal } from './PlanningModal';
import { IoTDeviceModal, ESPDevice } from './IoTDeviceModal';
import { useDeviceWebSocket } from '../../services/useDeviceWebSocket';
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

const Timer: React.FC<{ startedAt: string | null; paused?: boolean }> = ({ startedAt, paused }) => {
    const [elapsed, setElapsed] = useState('00:00:00');

    useEffect(() => {
        if (!startedAt) {
            setElapsed('Aguardando início');
            return;
        }

        if (paused) {
            setElapsed(prev => prev === '00:00:00' ? 'Aguardando início' : prev);
            return; // Não atualiza o timer enquanto pausado
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
    }, [startedAt, paused]);

    return (
        <div className={cn(
            "flex items-center gap-1.5 text-xs font-mono font-bold opacity-70",
            paused && "text-slate-400 line-through"
        )}>
            <Clock className="w-3 h-3" />
            {paused ? 'Pausado' : elapsed}
        </div>
    );
};

export const AndonGrid: React.FC<AndonGridProps> = ({ username }) => {
    const [workcenters, setWorkcenters] = useState<Workcenter[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedWorkcenter, setSelectedWorkcenter] = useState<Workcenter | null>(null);
    const [planningWc, setPlanningWc] = useState<Workcenter | null>(null);
    const [iotWc, setIotWc] = useState<Workcenter | null>(null);
    const [devices, setDevices] = useState<ESPDevice[]>([]);

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

    const fetchDevices = async () => {
        try {
            const data = await api.getDevices();
            setDevices(data);
        } catch {
            // silencioso — IoT é feature adicional
        }
    };

    useEffect(() => {
        fetchWorkcenters();
        fetchDevices();
        const interval = setInterval(fetchWorkcenters, 10000);
        return () => clearInterval(interval);
    }, []);

    // Atualizar em tempo real via WebSocket — devices E eventos Andon
    useDeviceWebSocket((event) => {
        if (
            event.event === 'andon_call_created' ||
            event.event === 'andon_resolved' ||
            event.event === 'production_paused' ||
            event.event === 'production_resumed'
        ) {
            // Atualização imediata ao receber evento Andon
            fetchWorkcenters();
        } else {
            fetchDevices();
        }
    });

    const getBoundDevice = (wcId: number): ESPDevice | null =>
        devices.find((d) => d.workcenter_id === wcId) ?? null;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'verde': return 'border-emerald-500 bg-emerald-50/30';
            case 'amarelo':
            case 'amarelo_suave': return 'border-amber-400 bg-amber-50/40';
            case 'vermelho': return 'border-red-500 bg-red-50/50 animate-pulse-subtle';
            default: return 'border-slate-200 bg-slate-50/50';
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'verde': return 'bg-emerald-500';
            case 'amarelo':
            case 'amarelo_suave': return 'bg-amber-400';
            case 'vermelho': return 'bg-red-500';
            default: return 'bg-slate-300';
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2">
                        <div className="h-8 w-48 animate-shimmer rounded-md" />
                        <div className="h-4 w-64 animate-shimmer rounded-md" />
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
            </div>
        );
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
            {/* Header — flex-col em mobile, flex-row em sm+ */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                        <Activity className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
                        Painel Andon
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Status e produção em tempo real</p>
                </div>

                <button
                    onClick={() => window.open('/andon-tv', '_blank')}
                    className="flex items-center justify-center gap-2 px-4 min-h-[44px] bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-all shadow-sm text-sm font-bold w-full sm:w-auto"
                >
                    <MonitorPlay className="w-4 h-4" />
                    Abrir TV
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {workcenters.map((wc) => {
                  const boundDevice = getBoundDevice(wc.id);
                  const iotStatusLabel = boundDevice
                    ? `ESP32: ${boundDevice.device_name} (${boundDevice.status})`
                    : 'Sem dispositivo vinculado';

                  return (
                    <div
                        key={wc.id}
                        role="region"
                        aria-label={wc.name}
                        className={cn(
                            // hover:-translate-y-1 apenas em dispositivos com mouse real (@media hover:hover)
                            "relative flex flex-col rounded-3xl border-2 p-5 transition-all shadow-sm",
                            "hover:shadow-md [@media(hover:hover)]:hover:-translate-y-1",
                            "active:scale-[0.98]",
                            getStatusColor(wc.status)
                        )}
                    >
                        {/* Header: WC Name + Status Indicator */}
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-black text-lg text-slate-900 truncate pr-2">{wc.name}</h3>
                            <div className="flex items-center gap-2">
                                {/* Ícone IoT — tooltip em desktop, label inline em mobile */}
                                <TooltipProvider>
                                    <Tooltip delayDuration={200}>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setIotWc(wc); }}
                                                className="flex items-center gap-1 p-1 rounded-lg hover:bg-white/60 active:bg-white/80 transition-colors min-w-[44px] min-h-[44px] justify-center"
                                                aria-label={iotStatusLabel}
                                            >
                                                <KeyRound
                                                    className={cn(
                                                        "w-4 h-4",
                                                        boundDevice?.status === 'online'
                                                            ? 'text-emerald-500'
                                                            : 'text-red-400'
                                                    )}
                                                />
                                                {/* Label inline visível em mobile (< lg) */}
                                                <span className={cn(
                                                    "text-[10px] font-bold lg:hidden",
                                                    boundDevice?.status === 'online' ? 'text-emerald-600' : 'text-red-400'
                                                )}>
                                                    {boundDevice?.status === 'online' ? 'ON' : 'OFF'}
                                                </span>
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="bg-slate-900 text-white border-slate-800 text-[10px] font-bold py-1.5 px-3 rounded-lg shadow-xl hidden lg:block">
                                            {iotStatusLabel}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
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
                        </div>

                        {/* Content: New Hierarchy */}
                        <div className="space-y-4 flex-1">
                            {/* 1. Owner */}
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
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
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
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
                                <Timer startedAt={wc.started_at} paused={wc.status === 'cinza'} />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-6 flex items-center gap-2">
                            <button
                                onClick={() => setSelectedWorkcenter(wc)}
                                className="flex-1 min-h-[44px] py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 active:bg-slate-700 transition-all"
                            >
                                Acionar Andon
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setPlanningWc(wc);
                                }}
                                className="min-w-[44px] min-h-[44px] p-2.5 bg-white border-2 border-slate-100 text-slate-600 rounded-xl hover:border-blue-200 hover:text-blue-600 active:bg-blue-50 transition-all shadow-sm flex items-center justify-center"
                                title="Ver Planejamento"
                                aria-label="Ver Planejamento"
                            >
                                <Calendar size={18} />
                            </button>
                        </div>
                    </div>
                  );
                })}
            </div>

            {planningWc && (
                <PlanningModal
                    wcName={planningWc.name}
                    plannedMos={planningWc.planned_mos}
                    onClose={() => setPlanningWc(null)}
                />
            )}

            {iotWc && (
                <IoTDeviceModal
                    workcenterId={iotWc.id}
                    workcenterName={iotWc.name}
                    boundDevice={getBoundDevice(iotWc.id)}
                    onClose={() => setIotWc(null)}
                    onChanged={fetchDevices}
                />
            )}
        </div>
    );
};
