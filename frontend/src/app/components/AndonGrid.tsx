import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Users, AlertTriangle, MonitorPlay, Activity } from 'lucide-react';
import { cn } from './ui';
import { AndonOperador } from './AndonOperador';

interface Workcenter {
    id: number;
    name: string;
    code: string;
    status: 'verde' | 'amarelo' | 'vermelho' | 'cinza';
}

interface AndonGridProps {
    username: string;
}

export const AndonGrid: React.FC<AndonGridProps> = ({ username }) => {
    const [workcenters, setWorkcenters] = useState<Workcenter[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedWorkcenter, setSelectedWorkcenter] = useState<Workcenter | null>(null);

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
        const interval = setInterval(fetchWorkcenters, 10000); // Poll a cada 10s
        return () => clearInterval(interval);
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'verde': return 'bg-emerald-500 shadow-emerald-500/40 text-white border-emerald-600';
            case 'amarelo': return 'bg-amber-400 shadow-amber-400/40 text-slate-800 border-amber-500';
            case 'vermelho': return 'bg-red-500 shadow-red-500/40 text-white border-red-600 animate-pulse';
            default: return 'bg-slate-200 text-slate-600 border-slate-300';
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full text-slate-500">Carregando painel Andon...</div>;
    }

    if (selectedWorkcenter) {
        return (
            <AndonOperador
                workcenter={selectedWorkcenter}
                username={username}
                onBack={() => setSelectedWorkcenter(null)}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Activity className="w-7 h-7 text-blue-600" />
                        Painel Andon
                    </h1>
                    <p className="text-slate-500 mt-1">Status em tempo real das mesas de trabalho</p>
                </div>

                {/* Futuro botão para abrir a TV */}
                <button
                    onClick={() => window.open('/andon-tv', '_blank')}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 text-sm font-semibold whitespace-nowrap"
                >
                    <MonitorPlay className="w-4 h-4" />
                    Abrir Painel TV
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {workcenters.map((wc) => (
                    <button
                        key={wc.id}
                        onClick={() => setSelectedWorkcenter(wc)}
                        className={cn(
                            "relative group p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-3 text-center shadow-lg hover:-translate-y-1 hover:shadow-xl",
                            getStatusColor(wc.status)
                        )}
                    >
                        {wc.status === 'vermelho' && (
                            <AlertTriangle className="absolute top-3 right-3 w-5 h-5 opacity-80" />
                        )}
                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                            <Users className="w-6 h-6 currentColor" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg leading-tight">{wc.name}</h3>
                            <p className="text-xs opacity-80 font-medium mt-1 uppercase tracking-wider">{wc.code || `WC-${wc.id}`}</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};
