/**
 * AndonTV — Full-screen TV mode for the Andon system.
 * Layout: rotating carousel (left/main) + fixed log panel (right, hospital-style)
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    Activity, AlertTriangle, CheckCircle2, Clock, Factory,
    Image as ImageIcon, MonitorPlay, Package, Users, Signal, SignalLow, Zap,
    Volume2, ChevronRight
} from 'lucide-react';
import { AndonTVProvider, LogType, TVCall, TVIDRequest, TVLog, TVWorkcenter, useAndonTV } from './AndonTVContext';
import { normalizeLabel, cn } from '../../lib/utils';

// ── Constants ─────────────────────────────────────────────────────
const PANEL_DURATION_MS = 12000;

function elapsed(isoDate: string | null | undefined): string {
    if (!isoDate) return '---';
    try {
        const start = new Date(isoDate);
        if (isNaN(start.getTime())) return '---';
        const now = new Date();
        const diffMs = Math.max(0, now.getTime() - start.getTime());
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        return `${hours.toString().padStart(2, '0')}h${minutes.toString().padStart(2, '0')}m`;
    } catch {
        return '---';
    }
}

function fmtTime(iso: string | null | undefined): string {
    if (!iso) return '--:--';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '--:--';
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '--:--';
    }
}

// ── Log Panel ────────────────────────────────────────────────────

const LOG_STYLES: Record<LogType, { bg: string; badge: string; text: string; highlight?: string; dot: string; }> = {
    INFO: { bg: 'transparent', badge: 'text-slate-400', text: 'text-slate-200', dot: 'bg-slate-500' },
    AMARELO: {
        bg: 'transparent',
        badge: 'text-amber-400 font-bold',
        text: 'text-amber-100 font-semibold',
        highlight: 'bg-amber-900/40 rounded-lg',
        dot: 'bg-amber-400',
    },
    VERMELHO: {
        bg: 'transparent',
        badge: 'text-red-400 font-black animate-pulse',
        text: 'text-red-100 font-bold',
        highlight: 'bg-red-900/50 rounded-lg',
        dot: 'bg-red-500',
    },
    ID_VISUAL_PENDENTE: {
        bg: 'transparent',
        badge: 'text-blue-400 font-bold',
        text: 'text-blue-100',
        dot: 'bg-blue-400',
    },
    ID_VISUAL_EM_ANDAMENTO: {
        bg: 'transparent',
        badge: 'text-orange-400 font-bold',
        text: 'text-orange-100',
        dot: 'bg-orange-400',
    },
    ID_VISUAL_OK: {
        bg: 'transparent',
        badge: 'text-emerald-400 font-black',
        text: 'text-emerald-100 font-bold',
        highlight: 'bg-emerald-900/40 rounded-lg',
        dot: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]',
    },
    ID_VISUAL_TRANSFERRED: {
        bg: 'transparent',
        badge: 'text-orange-400 font-bold',
        text: 'text-orange-100',
        dot: 'bg-orange-400',
    },
    RESOLVIDO: {
        bg: 'transparent',
        badge: 'text-emerald-600 font-bold',
        text: 'text-emerald-400',
        dot: 'bg-emerald-600',
    },
};

function LogItem({ log }: { log: TVLog }) {
    const style = LOG_STYLES[log.type] || LOG_STYLES.INFO;

    // Flash de chegada (2s) — para todos os logs com highlight:true
    const [flash, setFlash] = useState(log.highlight ?? false);
    useEffect(() => {
        if (!flash) return;
        const t = setTimeout(() => setFlash(false), 2000);
        return () => clearTimeout(t);
    }, []);

    // Piscar lento em verde por 5 min — apenas ID_VISUAL_OK com blinking:true (Req 5 AC 1-4)
    const [blink, setBlink] = useState(log.blinking ?? false);
    useEffect(() => {
        if (!blink) return;
        // Alterna visibilidade a cada 500ms (500ms ligado, 500ms desligado)
        const interval = setInterval(() => {
            setBlink(prev => {
                // Se o log já não está mais em blinking (atualizado pelo context), parar
                if (!log.blinking) return false;
                return prev; // mantém o estado de piscar — o context desativa após 5min
            });
        }, 500);
        return () => clearInterval(interval);
    }, [log.blinking]);

    // Sincronizar blink com mudança externa (context desativa blinking após 5min)
    useEffect(() => {
        setBlink(log.blinking ?? false);
    }, [log.blinking]);

    const cleanText = log.text.replace(/^\[\d{2}:\d{2}\]\s*/, '');
    const timeOnly = new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Classe de fundo: blinking usa animação CSS, flash usa highlight estático
    const bgClass = blink
        ? 'animate-pulse bg-emerald-900/40 rounded-lg'
        : flash
            ? (style.highlight ?? '')
            : '';

    return (
        <div className={`relative pl-6 py-3 transition-all duration-700 ${bgClass}`}>
            {/* Linha vertical da timeline */}
            <div className="absolute left-[11px] top-0 bottom-0 w-[2px] bg-slate-800" />

            {/* Ponto da timeline */}
            <div className={`absolute left-2.5 top-5 w-2 h-2 rounded-full -translate-x-[3px] ring-4 ring-slate-950 ${style.dot}`} />

            <div className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-black tracking-widest text-slate-500 shrink-0">
                        {timeOnly}
                    </span>
                    <span className={`text-xs uppercase tracking-wider ${style.badge}`}>
                        {log.type.replace(/_/g, ' ')}
                    </span>
                </div>

                <div className="min-w-0 pr-2">
                    <p className={`text-base leading-snug tracking-wide ${style.text} break-words drop-shadow-md`}>
                        {normalizeLabel(cleanText)}
                    </p>
                    {log.requester && (
                        <p className="text-sm text-slate-500 font-semibold mt-1">
                            por {normalizeLabel(log.requester)}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function LogPanel({ logs, ttsBlocked }: { logs: TVLog[]; ttsBlocked: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const prevLen = useRef(logs.length);
    useEffect(() => {
        if (logs.length > prevLen.current && ref.current) {
            ref.current.scrollTop = 0;
        }
        prevLen.current = logs.length;
    }, [logs.length]);

    // Separar logs piscantes (fixos no topo) dos demais (Req 5 AC 4)
    const blinkingLogs = logs.filter(l => l.blinking);
    const normalLogs = logs.filter(l => !l.blinking);

    return (
        <aside className="w-[30%] min-w-[320px] h-full bg-slate-950 border-l border-slate-800/60 flex flex-col shadow-2xl relative z-10">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-800/80 shrink-0 bg-slate-900/40">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)] animate-pulse" />
                    <h2 className="text-lg font-black tracking-[0.2em] uppercase text-slate-200">
                        Registro de Eventos
                    </h2>
                    {/* Fallback visual TTS bloqueado (Req 4 AC 5) */}
                    {ttsBlocked && (
                        <div
                            title="Síntese de voz bloqueada pelo navegador"
                            className="ml-auto flex items-center gap-1 text-amber-400 animate-pulse"
                        >
                            <Volume2 className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-wider">Voz bloqueada</span>
                        </div>
                    )}
                </div>
                <p className="text-xs text-slate-500 font-bold mt-1 tracking-wide uppercase">Histórico Recente</p>
            </div>

            {/* Logs piscantes fixos no topo (ID_VISUAL_OK em blinking) — Req 5 AC 4 */}
            {blinkingLogs.length > 0 && (
                <div className="border-b border-emerald-800/40 bg-emerald-950/20 shrink-0">
                    {blinkingLogs.map(log => <LogItem key={log.id} log={log} />)}
                </div>
            )}

            {/* Log list (Timeline) */}
            <div ref={ref} className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {normalLogs.length === 0 && blinkingLogs.length === 0 ? (
                    <p className="text-center text-slate-600 text-sm font-bold mt-12 tracking-widest uppercase">Nenhum evento</p>
                ) : (
                    <div className="relative pb-8">
                        {normalLogs.map(log => <LogItem key={log.id} log={log} />)}
                    </div>
                )}
            </div>
        </aside>
    );
}

// ── Panel A: Resumo Geral ─────────────────────────────────────────

function PanelResumo({ workcenters, calls, idRequests }: {
    workcenters: TVWorkcenter[];
    calls: TVCall[];
    idRequests: TVIDRequest[];
}) {
    const normalizedWcs = Array.isArray(workcenters) ? workcenters : [];
    const normalizedCalls = Array.isArray(calls) ? calls : [];
    const normalizedIdRequests = Array.isArray(idRequests) ? idRequests : [];

    const verdes = normalizedWcs.filter(w => w?.status === 'verde' || w?.status === 'amarelo_suave').length;
    const amarelos = normalizedWcs.filter(w => w?.status === 'amarelo').length;
    const vermelhos = normalizedWcs.filter(w => w?.status === 'vermelho').length;
    const cinzas = normalizedWcs.filter(w => w?.status === 'cinza').length;
    const idWaiting = normalizedIdRequests.filter(r => r?.production_status === 'waiting').length;
    const idWorking = normalizedIdRequests.filter(r => r?.production_status === 'in_progress').length;
    const idDone = normalizedIdRequests.filter(r => r?.production_status === 'done').length;
    const hasReds = vermelhos > 0;

    return (
        <div className="h-full flex flex-col justify-center gap-8 px-8 py-6">
            <h2 className="text-2xl font-black text-slate-300 uppercase tracking-widest text-center">
                Resumo Geral
            </h2>

            {/* Workcenter counters */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Produção', count: verdes, color: 'from-emerald-600 to-emerald-500', ring: 'ring-emerald-500/30' },
                    { label: 'Amarelo', count: amarelos, color: 'from-amber-600 to-amber-400', ring: 'ring-amber-400/30' },
                    { label: 'Vermelho', count: vermelhos, color: 'from-red-700 to-red-500', ring: 'ring-red-500/40', pulse: hasReds },
                    { label: 'Inativas', count: cinzas, color: 'from-slate-700 to-slate-600', ring: 'ring-slate-600/20' },
                ].map(({ label, count, color, ring, pulse }) => (
                    <div
                        key={label}
                        className={`bg-gradient-to-br ${color} rounded-3xl p-6 flex flex-col items-center justify-center gap-2 shadow-2xl ring-4 ${ring} ${pulse ? 'animate-pulse' : ''}`}
                    >
                        <span className="text-6xl font-black text-white drop-shadow-lg">{count}</span>
                        <span className="text-white/80 font-bold uppercase tracking-wider text-sm">{label}</span>
                    </div>
                ))}
            </div>

            {/* ID Visual counters */}
            {(idWaiting + idWorking + idDone) > 0 && (
                <div className="mt-2">
                    <p className="text-slate-500 text-xs uppercase tracking-widest text-center mb-3 font-bold">ID Visual</p>
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: 'Em Espera', count: idWaiting, color: 'bg-blue-900/60 border border-blue-700/40', text: 'text-blue-300' },
                            { label: 'Trabalhando', count: idWorking, color: 'bg-orange-900/60 border border-orange-700/40', text: 'text-orange-300' },
                            { label: 'Finalizadas', count: idDone, color: 'bg-emerald-900/60 border border-emerald-700/40', text: 'text-emerald-300' },
                        ].map(({ label, count, color, text }) => (
                            <div key={label} className={`${color} rounded-2xl px-6 py-4 flex flex-col items-center gap-1`}>
                                <span className={`text-4xl font-black ${text}`}>{count}</span>
                                <span className="text-slate-400 text-sm font-semibold">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Panel B: Mesas Paradas ────────────────────────────────────────

function PanelMesasParadas({ calls }: { calls: TVCall[] }) {
    const normalizedCalls = Array.isArray(calls) ? calls : [];
    const sorted = [...normalizedCalls].sort((a, b) => {
        if (a?.color === 'RED' && b?.color !== 'RED') return -1;
        if (b?.color === 'RED' && a?.color !== 'RED') return 1;
        return new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime();
    });

    return (
        <div className="h-full flex flex-col px-6 py-5 gap-4">
            <h2 className="text-2xl font-black text-slate-300 uppercase tracking-widest flex items-center gap-3">
                <AlertTriangle className="w-7 h-7 text-red-500" />
                Mesas Paradas
                <span className="ml-auto text-sm font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full">
                    {calls.length} chamado{calls.length !== 1 ? 's' : ''}
                </span>
            </h2>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {sorted.length === 0 && (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                            <p className="text-xl font-black text-slate-300 uppercase tracking-widest">Todas as mesas em operação normal</p>
                            <p className="text-slate-500 text-sm mt-2">Nenhum chamado Andon ativo</p>
                        </div>
                    </div>
                )}
                {sorted.map(call => {
                    const isRed = call.color === 'RED';
                    return (
                        <div
                            key={call.id}
                            className={`rounded-2xl p-5 border flex gap-5 items-start transition-all ${isRed
                                ? 'bg-red-950/80 border-red-700/60 shadow-lg shadow-red-900/30 ring-2 ring-red-500/20'
                                : 'bg-amber-950/60 border-amber-700/30'
                                }`}
                        >
                            {/* Color badge */}
                            <div className={`shrink-0 w-14 h-14 rounded-xl flex items-center justify-center shadow-lg ${isRed ? 'bg-red-600 animate-pulse' : 'bg-amber-500'
                                }`}>
                                {isRed
                                    ? <AlertTriangle className="w-7 h-7 text-white" />
                                    : <Package className="w-7 h-7 text-slate-900" />
                                }
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className={`text-xl font-black ${isRed ? 'text-red-200' : 'text-amber-200'}`}>
                                        {normalizeLabel(call.workcenter_name)}
                                    </span>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${call.status === 'IN_PROGRESS'
                                        ? 'bg-blue-600/60 text-blue-200'
                                        : isRed ? 'bg-red-800/60 text-red-300' : 'bg-amber-800/60 text-amber-300'
                                        }`}>
                                        {call.status === 'IN_PROGRESS' ? 'Em Atendimento' : 'Aberto'}
                                    </span>
                                </div>
                                <p className={`text-sm mt-1 ${isRed ? 'text-red-300/80' : 'text-amber-300/80'}`}>
                                    {normalizeLabel(call.category)} — {normalizeLabel(call.reason)}
                                </p>
                                {call.description && (
                                    <p className="text-xs text-slate-400 mt-0.5">{normalizeLabel(call.description)}</p>
                                )}
                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5" />
                                        Parado há {elapsed(call.created_at)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Users className="w-3.5 h-3.5" />
                                        {normalizeLabel(call.triggered_by)}
                                    </span>
                                    {call.assigned_team && (
                                        <span className="flex items-center gap-1 text-blue-400">
                                            Responsável: {normalizeLabel(call.assigned_team)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Time badge */}
                            <div className={`shrink-0 text-right ${isRed ? 'text-red-400' : 'text-amber-400'}`}>
                                <div className="text-2xl font-black">{elapsed(call.created_at)}</div>
                                <div className="text-xs text-slate-500 mt-1">{fmtTime(call.created_at)}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Panel C: Mesas em Produção ────────────────────────────────────
function TVProductionCard({ wc }: { wc: TVWorkcenter }) {
    const [timeStr, setTimeStr] = useState(() => elapsed(wc.started_at));

    useEffect(() => {
        if (!wc.started_at) return;
        const interval = setInterval(() => {
            setTimeStr(elapsed(wc.started_at));
        }, 30000); // 30s
        return () => clearInterval(interval);
    }, [wc.started_at]);

    const isGreen = wc.status === 'verde';
    const isRed = wc.status === 'vermelho';
    const isYellow = wc.status === 'amarelo';
    const isSoftYellow = wc.status === 'amarelo_suave';

    return (
        <div
            className={cn(
                "rounded-2xl p-4 flex flex-col gap-3 border-2 transition-all shadow-lg relative",
                isGreen || isSoftYellow ? "bg-emerald-950/40 border-emerald-600/50 text-emerald-100" :
                    isRed ? "bg-rose-950/50 border-rose-600/50 text-rose-100 animate-pulse" :
                        isYellow ? "bg-amber-950/40 border-amber-600/50 text-amber-100" :
                            "bg-slate-900/40 border-slate-800/60 text-slate-400"
            )}
        >
            <div className="flex items-center gap-3">
                <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner",
                    isGreen ? "bg-emerald-500/20" : isRed ? "bg-rose-500/20" : isYellow ? "bg-amber-500/20" : "bg-slate-800/40"
                )}>
                    <Users className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="font-black text-sm uppercase truncate leading-tight">
                        {wc.operator_name !== "---" ? wc.operator_name : wc.name}
                    </div>
                    {wc.fabrication_code !== "---" && (
                        <div className="text-xs font-bold opacity-70 tracking-tight">
                            {wc.fabrication_code}
                        </div>
                    )}
                </div>
                {isSoftYellow && (
                    <div className="absolute top-4 right-4">
                        <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse" />
                    </div>
                )}
            </div>

            <div className="space-y-1.5 border-y border-white/5 py-2">
                <div className="flex items-start gap-1.5 min-w-0">
                    <span className="text-xs font-bold uppercase text-white/40 mt-0.5">Obra:</span>
                    <span className="text-xs font-bold leading-none truncate">{wc.obra_name}</span>
                </div>
                <div className="flex items-start gap-1.5 min-w-0">
                    <span className="text-xs font-bold uppercase text-white/40 mt-0.5">Etapa:</span>
                    <span className="text-xs font-bold leading-none truncate">{wc.stage}</span>
                </div>
            </div>

            <div className="flex items-center justify-between mt-auto pt-1">
                <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase shadow-sm",
                    wc.is_online === false ? "bg-slate-900 text-slate-600 border border-slate-800" :
                        isGreen ? "bg-emerald-500/20 text-emerald-400" :
                            isRed ? "bg-rose-500/20 text-rose-400" :
                                isYellow ? "bg-amber-500/20 text-amber-400" :
                                    "bg-slate-800/60 text-slate-500"
                )}>
                    {wc.is_online === false ? "OFFLINE" : wc.operational_status}
                </div>

                {wc.sync_pending && (
                    <div className="flex items-center gap-1 text-xs font-black text-blue-400 animate-pulse uppercase tracking-tighter">
                        <Clock size={10} /> Sync Odoo
                    </div>
                )}

                {wc.has_active_production && (
                    <div className="flex items-center gap-1.5 text-white/50">
                        <Clock size={12} className="shrink-0" />
                        <span className="text-xs font-mono font-bold tracking-tighter">
                            {timeStr}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

function PanelProducao({ workcenters }: { workcenters: TVWorkcenter[] }) {
    const normalizedWcs = Array.isArray(workcenters) ? workcenters : [];
    const active = normalizedWcs.filter(w => w?.has_active_production);
    const all = normalizedWcs;

    return (
        <div className="h-full flex flex-col px-6 py-5 gap-4">
            <h2 className="text-2xl font-black text-slate-300 uppercase tracking-widest flex items-center gap-3">
                <Factory className="w-7 h-7 text-emerald-500" />
                Mesas em Produção
                <span className="ml-auto text-sm font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full">
                    {active.length} / {all.length} em atividade
                </span>
            </h2>

            <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start overflow-y-auto pr-2 custom-scrollbar">
                {all.map(wc => (
                    <TVProductionCard key={wc.id} wc={wc} />
                ))}
            </div>
        </div >
    );
}

// ── Panel D: ID Visual ────────────────────────────────────────────

function IDVisualCard({ req, variant }: { req: TVIDRequest; variant: 'waiting' | 'in_progress' | 'done' }) {
    const isDone = variant === 'done';
    const isTransferred = req.is_transferred || false;

    return (
        <div className={`rounded-xl p-4 border transition-all ${isDone
            ? 'bg-emerald-950/70 border-emerald-500/60 ring-1 ring-emerald-400/20 shadow-lg shadow-emerald-900/30'
            : variant === 'in_progress'
                ? 'bg-orange-950/60 border-orange-700/30'
                : 'bg-blue-950/60 border-blue-700/30'
            }`}>
            <div className="flex items-center justify-between mb-2">
                {isDone ? (
                    <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">✅ Pronta</span>
                    </div>
                ) : isTransferred ? (
                    <div className="flex items-center gap-1.5 bg-blue-500/20 px-2 py-0.5 rounded-md border border-blue-400/30">
                        <MonitorPlay className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-wider">Transferida</span>
                    </div>
                ) : (
                    <div className="w-1 h-1" />
                )}
                {req.priority === 'urgent' && (
                    <span className="bg-red-600 text-xs font-black text-white px-1.5 py-0.5 rounded uppercase animate-pulse">Urgente</span>
                )}
            </div>

            <div className={`font-black text-base leading-tight ${isDone ? 'text-emerald-200' : 'text-slate-100'}`}>
                {normalizeLabel(req.mo_number)}
            </div>
            {req.obra && req.obra !== 'Sem Obra' && (
                <div className="text-xs text-slate-400 mt-0.5 truncate">{normalizeLabel(req.obra)}</div>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-xs text-slate-500">
                {req.requester_name && (
                    <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {normalizeLabel(req.requester_name)}
                    </span>
                )}
                {req.created_at && (
                    <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {fmtTime(req.created_at)} ({elapsed(req.created_at)})
                    </span>
                )}
            </div>
            {isDone && req.notes && (
                <div className="mt-2 text-xs text-emerald-300/80 bg-emerald-900/40 rounded-lg px-2 py-1.5">
                    <span className="font-semibold">Motivo: </span>{normalizeLabel(req.notes)}
                </div>
            )}
            {isDone && req.finished_at && (
                <div className="mt-1 text-[10px] text-emerald-500 text-right">
                    Concluído às {fmtTime(req.finished_at)}
                </div>
            )}
        </div>
    );
}

function PanelIDVisual({ idRequests }: { idRequests: TVIDRequest[] }) {
    const normalizedIdReqs = Array.isArray(idRequests) ? idRequests : [];
    const waiting = normalizedIdReqs.filter(r => r?.production_status === 'waiting');
    const working = normalizedIdReqs.filter(r => r?.production_status === 'in_progress');
    const done = normalizedIdReqs.filter(r => r?.production_status === 'done');

    return (
        <div className="h-full flex flex-col px-6 py-5 gap-4">
            <h2 className="text-2xl font-black text-slate-300 uppercase tracking-widest flex items-center gap-3">
                <ImageIcon className="w-7 h-7 text-blue-400" />
                Solicitações de ID Visual
            </h2>

            <div className="flex-1 grid grid-cols-3 gap-4 overflow-hidden">
                {/* Em Espera */}
                <div className="flex flex-col gap-2 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-1 shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                        <span className="text-xs font-black text-blue-400 uppercase tracking-widest">Em Espera</span>
                        <span className="ml-auto text-xs text-slate-500">{waiting.length}</span>
                    </div>
                    {waiting.length === 0
                        ? <p className="text-xs text-slate-600 text-center mt-4">Nenhuma</p>
                        : waiting.map(r => <IDVisualCard key={r.id} req={r} variant="waiting" />)
                    }
                </div>

                {/* Trabalhando */}
                <div className="flex flex-col gap-2 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-1 shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                        <span className="text-xs font-black text-orange-400 uppercase tracking-widest">Trabalhando</span>
                        <span className="ml-auto text-xs text-slate-500">{working.length}</span>
                    </div>
                    {working.length === 0
                        ? <p className="text-xs text-slate-600 text-center mt-4">Nenhuma</p>
                        : working.map(r => <IDVisualCard key={r.id} req={r} variant="in_progress" />)
                    }
                </div>

                {/* Finalizadas */}
                <div className="flex flex-col gap-2 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-1 shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Finalizadas</span>
                        <span className="ml-auto text-xs text-slate-500">{done.length}</span>
                    </div>
                    {done.length === 0
                        ? <p className="text-xs text-slate-600 text-center mt-4">Nenhuma</p>
                        : done.map(r => <IDVisualCard key={r.id} req={r} variant="done" />)
                    }
                </div>
            </div>
        </div>
    );
}

// ── Carousel ─────────────────────────────────────────────────────

interface Panel {
    id: string;
    label: string;
    icon: React.ReactNode;
}

function CarouselDots({ panels, activeIndex }: { panels: Panel[]; activeIndex: number }) {
    return (
        <div className="flex items-center gap-2">
            {panels.map((p, i) => (
                <div
                    key={p.id}
                    className={`h-1.5 rounded-full transition-all duration-500 ${i === activeIndex ? 'w-8 bg-blue-400' : 'w-2 bg-slate-600'
                        }`}
                />
            ))}
        </div>
    );
}

// ── Timer Bar ─────────────────────────────────────────────────────

function TimerBar({ duration }: { duration: number }) {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        setWidth(0);
        const start = Date.now();
        const tick = () => {
            const elapsed = Date.now() - start;
            setWidth(Math.min(100, (elapsed / duration) * 100));
            if (elapsed < duration) requestAnimationFrame(tick);
        };
        const raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [duration]);

    return (
        <div className="h-0.5 bg-slate-800 w-full">
            <div
                className="h-full bg-blue-500/60 transition-none"
                style={{ width: `${width}%` }}
            />
        </div>
    );
}

// ── Main TV Component ─────────────────────────────────────────────

function AndonTVInner() {
    const { workcenters, calls, idRequests, logs, isConnected, lastUpdated, ttsBlocked } = useAndonTV();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [panelIndex, setPanelIndex] = useState(0);
    const [transitioning, setTransitioning] = useState(false);
    const [started, setStarted] = useState(false);

    // Clock
    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const handleStart = () => {
        setStarted(true);
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => { });
        }
    };

    // Build panel list dynamically
    const normalizedWcs = Array.isArray(workcenters) ? workcenters : [];
    const normalizedCalls = Array.isArray(calls) ? calls : [];
    const normalizedIdRequests = Array.isArray(idRequests) ? idRequests : [];

    const hasStoppedMesas = normalizedCalls.length > 0;
    const hasIDVisual = normalizedIdRequests.some(r =>
        r?.production_status === 'waiting' ||
        (r?.production_status === 'in_progress' && !r?.is_transferred) ||
        (r?.production_status === 'in_progress' && r?.is_transferred) // Re-added to match goal
    );
    // User goal: "ID Visual" panel only enters rotation when there is at least 1 item in "Waiting" or "Working".
    const showIDPanel = normalizedIdRequests.some(r =>
        ['waiting', 'in_progress'].includes(r?.production_status)
    );

    const allPanels: (Panel & { show: boolean })[] = [
        { id: 'summary', label: 'Resumo Geral', icon: <Activity />, show: true },
        { id: 'stopped', label: 'Mesas Paradas', icon: <AlertTriangle />, show: hasStoppedMesas },
        { id: 'production', label: 'Produção', icon: <Factory />, show: true },
        { id: 'idvisual', label: 'ID Visual', icon: <ImageIcon />, show: showIDPanel },
    ];
    const panels = allPanels.filter(p => p.show);

    // Auto-rotate with smart skip (double check in rotation loop)
    useEffect(() => {
        if (panels.length <= 1) return;

        const timeout = setTimeout(() => {
            setTransitioning(true);
            setTimeout(() => {
                setPanelIndex(prev => {
                    const nextIndex = (prev + 1) % panels.length;
                    return nextIndex;
                });
                setTransitioning(false);
            }, 400);
        }, PANEL_DURATION_MS);

        return () => clearTimeout(timeout);
    }, [panelIndex, panels.length]);

    // Clamp panel index if panels change
    const safeIndex = panelIndex % Math.max(panels.length, 1);
    const activePanel = panels[safeIndex];

    const renderPanel = () => {
        if (!activePanel) return null;
        switch (activePanel.id) {
            case 'summary':
                return <PanelResumo workcenters={workcenters} calls={calls} idRequests={idRequests} />;
            case 'stopped':
                return <PanelMesasParadas calls={calls} />;
            case 'production':
                return <PanelProducao workcenters={workcenters} />;
            case 'idvisual':
                return <PanelIDVisual idRequests={idRequests} />;
            default:
                return null;
        }
    };

    const hasRed = calls.some(c => c.color === 'RED');

    return (
        <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden font-sans select-none">

            {/* ── Reconnection Banner ───────────────────────── */}
            {!isConnected && (
                <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-slate-900 text-center py-2 text-sm font-bold animate-pulse">
                    Conexão perdida — reconectando...
                </div>
            )}

            {/* ── Top Header ────────────────────────────────── */}
            <header className={`flex items-center px-6 py-3 gap-6 border-b shrink-0 transition-colors ${hasRed ? 'border-red-800/60 bg-red-950/20' : 'border-slate-800 bg-slate-900/60'
                }`}>
                {/* Brand */}
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${hasRed ? 'bg-red-600 animate-pulse' : 'bg-blue-600'
                        }`}>
                        <MonitorPlay className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black tracking-tight text-white leading-none">ANDON TV</h1>
                        <p className="text-slate-500 text-xs">Chão de Fábrica · ID Visual</p>
                    </div>
                </div>

                {/* Alerts summary */}
                {hasRed && (
                    <div className="flex items-center gap-2 bg-red-600/20 border border-red-600/40 rounded-xl px-4 py-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 animate-bounce" />
                        <span className="text-red-300 font-black text-sm uppercase tracking-wider">
                            {calls.filter(c => c.color === 'RED').length} Parada Crítica
                        </span>
                    </div>
                )}

                <div className="flex-1" />

                {/* Downtime */}
                <div className="flex items-center gap-2 text-right">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <div>
                        <div className="text-xs text-slate-500">Chamados Ativos</div>
                        <div className="text-lg font-black text-amber-400">{calls.length}</div>
                    </div>
                </div>

                {/* Connection */}
                <div className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold",
                    isConnected ? "text-emerald-400" : "text-red-400"
                )}>
                    {isConnected
                        ? <Signal className="w-4 h-4" />
                        : <SignalLow className="w-4 h-4 animate-pulse" />
                    }
                    <span className="hidden sm:inline">
                        {isConnected ? 'Ao vivo' : 'Reconectando...'}
                    </span>
                </div>

                {/* Clock */}
                <div className="text-right font-mono hidden md:block">
                    <div className="text-2xl font-black tracking-wider text-emerald-400">
                        {currentTime.toLocaleTimeString('pt-BR')}
                    </div>
                    <div className="text-slate-500 text-xs capitalize">
                        {currentTime.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                    </div>
                </div>
            </header>

            {/* ── Timer bar ─────────────────────────────────── */}
            <TimerBar key={`timer-${panelIndex}`} duration={PANEL_DURATION_MS} />

            {/* ── Main Content ──────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden">

                {/* Carousel main area */}
                <main className="flex-1 flex flex-col overflow-hidden">

                    {/* Panel nav tabs */}
                    <div className="flex items-center gap-2 px-6 pt-3 pb-1 border-b border-slate-800/60 shrink-0">
                        <CarouselDots panels={panels} activeIndex={safeIndex} />
                        <div className="flex items-center gap-1.5 ml-3">
                            {panels.map((p, i) => (
                                <button
                                    key={p.id}
                                    onClick={() => { setTransitioning(true); setTimeout(() => { setPanelIndex(i); setTransitioning(false); }, 300); }}
                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${i === safeIndex
                                        ? 'bg-blue-600/30 text-blue-300 border border-blue-600/40'
                                        : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        <div className="ml-auto text-xs text-slate-600">
                            {lastUpdated ? `Atualizado às ${lastUpdated.toLocaleTimeString('pt-BR')}` : 'Aguardando dados...'}
                        </div>
                    </div>

                    {/* Panel content */}
                    <div
                        className={`flex-1 overflow-hidden transition-all duration-400 ${transitioning ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
                            }`}
                        style={{ transition: 'opacity 0.35s ease, transform 0.35s ease' }}
                    >
                        {renderPanel()}
                    </div>
                </main>

                {/* Fixed right log panel */}
                <LogPanel logs={logs} ttsBlocked={ttsBlocked} />
            </div>

            {/* ── Start Overlay (Required for Fullscreen) ── */}
            {!started && (
                <div className="absolute inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700">
                    <div className="w-24 h-24 rounded-3xl bg-blue-600 flex items-center justify-center mb-8 shadow-2xl shadow-blue-500/20 animate-bounce">
                        <MonitorPlay className="w-12 h-12 text-white" />
                    </div>
                    <h2 className="text-4xl font-black text-white mb-4 tracking-tighter uppercase">Andon TV Online</h2>
                    <p className="text-slate-400 max-w-md mb-4 text-lg">
                        Os dados já estão sendo carregados em tempo real ao fundo.
                    </p>
                    <p className="text-slate-500 max-w-md mb-12 text-sm">
                        Clique no botão abaixo para ativar o <b>Modo TV (Tela Cheia)</b> e iniciar a rotação automática dos painéis de produção e chamados.
                    </p>
                    <button
                        onClick={handleStart}
                        className="group relative px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xl transition-all shadow-xl shadow-blue-600/20 active:scale-95 flex items-center gap-3"
                    >
                        <span>INICIAR TRANSMISSÃO</span>
                        <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <div className="fixed bottom-8 text-[10px] text-slate-600 font-bold tracking-[0.2em] uppercase opacity-50">
                        AX Automação · Sistema ID Visual
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Export with Provider ──────────────────────────────────────────

export const AndonTV: React.FC = () => (
    <AndonTVProvider>
        <AndonTVInner />
    </AndonTVProvider>
);
