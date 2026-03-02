import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { AlertTriangle, MonitorPlay, Users, Factory, Zap, Clock } from 'lucide-react';
import { cn } from './ui';

interface Workcenter {
    id: number;
    name: string;
    code: string;
    status: 'verde' | 'amarelo' | 'vermelho' | 'cinza';
}

interface DowntimeMetric {
    workcenter_id: number;
    downtime_minutes: number;
}

export const AndonTV: React.FC = () => {
    const [workcenters, setWorkcenters] = useState<Workcenter[]>([]);
    const [downtime, setDowntime] = useState<{ metrics: DowntimeMetric[], total_downtime_minutes: number }>({ metrics: [], total_downtime_minutes: 0 });
    const [currentTime, setCurrentTime] = useState(new Date());

    const fetchData = async () => {
        try {
            const [wcs, down] = await Promise.all([
                api.getAndonWorkcenters(),
                api.getAndonDowntime()
            ]);
            setWorkcenters(wcs);
            setDowntime(down);
        } catch (error) {
            console.error('Failed to fetch Andon TV data', error);
        }
    };

    useEffect(() => {
        fetchData();
        const dataInterval = setInterval(fetchData, 10000); // Poll a cada 10s
        const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000); // Relógio

        // Modo tela cheia
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => { });
        }

        return () => {
            clearInterval(dataInterval);
            clearInterval(timeInterval);
        };
    }, []);

    const getStatusClasses = (status: string) => {
        switch (status) {
            case 'verde': return 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-500/40';
            case 'amarelo': return 'bg-amber-400 text-slate-900 border-amber-500 shadow-amber-400/40';
            case 'vermelho': return 'bg-red-600 text-white border-red-700 shadow-red-600/50 animate-pulse';
            default: return 'bg-slate-800 text-slate-400 border-slate-700 shadow-slate-900/40';
        }
    };

    const getWcDowntime = (id: number) => {
        const metric = downtime.metrics.find(m => m.workcenter_id === id);
        return metric ? Math.round(metric.downtime_minutes) : 0;
    };

    // Layout escuro (Dark Mode) para TV
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-10 flex flex-col gap-8 selection:bg-blue-500/30">

            {/* HEADER TV */}
            <header className="flex items-center justify-between border-b flex-wrap border-slate-800 pb-6 gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                        <MonitorPlay className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-1">ANDON TV</h1>
                        <p className="text-slate-400 text-lg md:text-xl font-medium flex items-center gap-2">
                            <Factory className="w-5 h-5" />
                            Chão de Fábrica - ID Visual
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-8">
                    <div className="text-right flex items-center gap-4 bg-slate-900 p-4 rounded-2xl border border-slate-800">
                        <div className="w-12 h-12 rounded-full bg-red-600/20 flex items-center justify-center text-red-500">
                            <Zap className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-bold tracking-widest text-slate-500 uppercase">Downtime Total</p>
                            <div className="text-3xl font-black text-red-500">
                                {Math.floor(downtime.total_downtime_minutes / 60)}h {Math.round(downtime.total_downtime_minutes % 60)}m
                            </div>
                        </div>
                    </div>

                    <div className="text-center font-mono bg-slate-900 p-4 rounded-2xl border border-slate-800 hidden lg:block">
                        <div className="text-4xl font-black tracking-wider text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                            {currentTime.toLocaleTimeString('pt-BR')}
                        </div>
                        <div className="text-slate-500 text-sm font-bold uppercase mt-1">
                            {currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}
                        </div>
                    </div>
                </div>
            </header>

            {/* GRID DE MESAS */}
            <main className="flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
                    {workcenters.map((wc) => {
                        const downMins = getWcDowntime(wc.id);
                        const isRed = wc.status === 'vermelho';

                        return (
                            <div
                                key={wc.id}
                                className={cn(
                                    "relative rounded-[2rem] border-4 p-8 flex flex-col justify-between transition-all duration-500 shadow-2xl h-[320px] md:h-[400px]",
                                    getStatusClasses(wc.status)
                                )}
                            >
                                {/* Ícone de Alerta Piscante p/ Vermelho */}
                                {isRed && (
                                    <div className="absolute -top-4 -right-4 w-14 h-14 bg-red-600 text-white rounded-full flex items-center justify-center border-4 border-slate-950 shadow-xl animate-bounce">
                                        <AlertTriangle className="w-6 h-6" />
                                    </div>
                                )}

                                <div className="flex items-start justify-between">
                                    <div className="bg-black/20 p-4 rounded-2xl backdrop-blur-md">
                                        <Users className="w-10 h-10 md:w-14 md:h-14 opacity-90" />
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm md:text-base font-black opacity-60 uppercase tracking-widest mb-1">{wc.code || `WC-${wc.id}`}</p>
                                        <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full text-xs md:text-sm font-bold backdrop-blur-sm">
                                            <Clock className="w-4 h-4" />
                                            {downMins}m Parado
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-auto">
                                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-black leading-tight tracking-tight mb-4 drop-shadow-md">
                                        {wc.name}
                                    </h2>
                                    <div className="inline-flex items-center gap-2 bg-black/20 px-4 py-2 rounded-xl text-lg font-bold uppercase tracking-widest backdrop-blur-sm">
                                        {wc.status}
                                    </div>
                                </div>

                                {/* Efeito de Gradiente Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent rounded-[2rem] pointer-events-none" />
                            </div>
                        );
                    })}
                </div>
            </main>

        </div>
    );
};
