import React from 'react';
import { BatchStats } from '../../types/matrix';
import { FileText, TrendingUp, Calendar, Ban } from 'lucide-react';

interface BatchKPIsProps {
    stats: BatchStats;
    onFilter: (filter: string) => void;
    activeFilter: string | null;
}

export const BatchKPIs: React.FC<BatchKPIsProps> = ({ stats, onFilter, activeFilter }) => {
    const cards = [
        {
            id: 'docs',
            label: 'Documentos (Docs)',
            value: (
                <div className="flex text-xs space-x-2">
                    <span className="text-slate-500">Pend: <b className="text-slate-700">{stats.docs_pending}</b></span>
                    <span className="text-amber-600">Fila: <b className="text-amber-700">{stats.docs_printing}</b></span>
                    <span className="text-emerald-600">OK: <b className="text-emerald-700">{stats.docs_printed}</b></span>
                </div>
            ),
            icon: FileText,
            color: 'blue'
        },
        {
            id: 'progress',
            label: 'Progresso do Lote',
            value: (
                <div className="flex items-center">
                    <span className="text-2xl font-bold text-slate-800">{stats.progress_pct}%</span>
                    <div className="ml-2 w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${stats.progress_pct}%` }}
                        />
                    </div>
                </div>
            ),
            icon: TrendingUp,
            color: 'emerald'
        },
        {
            id: 'today',
            label: 'Hoje / Semana',
            value: (
                <div className="flex text-xs space-x-3">
                    <span className="text-slate-600">Hoje: <b className="text-indigo-600 font-bold text-sm">{stats.count_today}</b></span>
                    <span className="text-slate-400">|</span>
                    <span className="text-slate-600">Semana: <b className="text-slate-800 font-bold">{stats.count_week}</b></span>
                </div>
            ),
            icon: Calendar,
            color: 'indigo'
        },
        {
            id: 'blocked',
            label: 'Bloqueios',
            value: (
                <span className={`text-2xl font-bold ${stats.total_blocked > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    {stats.total_blocked}
                </span>
            ),
            icon: Ban,
            color: 'red'
        }
    ];

    return (
        <div className="grid grid-cols-4 gap-4 mb-6">
            {cards.map((card) => (
                <div
                    key={card.id}
                    onClick={() => onFilter(card.id)}
                    className={`
            bg-white p-4 rounded-xl border-2 transition-all cursor-pointer shadow-sm hover:shadow-md
            ${activeFilter === card.id ? `border-${card.color}-500 ring-2 ring-${card.color}-100` : 'border-slate-100 hover:border-slate-300'}
          `}
                >
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{card.label}</span>
                        <card.icon size={18} className={`text-${card.color}-500`} />
                    </div>
                    <div>{card.value}</div>
                </div>
            ))}
        </div>
    );
};
