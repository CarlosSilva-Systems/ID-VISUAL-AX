/**
 * AndonTVContext — Centralized state for the Andon TV screen.
 *
 * Estratégia de atualização (dupla camada):
 * 1. WebSocket via proxy Vite (/api/v1/andon/ws) — notificação instantânea
 *    quando o servidor emite "andon_version_changed"
 * 2. Polling de 1.5s como fallback — garante atualização mesmo se WS cair
 *
 * O WebSocket usa URL relativa (/api/v1/andon/ws) para passar pelo proxy
 * do Vite (http://api:8000) dentro do Docker. Nunca usa URL absoluta.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';

// ── Types ─────────────────────────────────────────────────────────

export interface TVWorkcenter {
    id: number;
    name: string;
    code: string;
    status: 'verde' | 'amarelo' | 'vermelho' | 'cinza' | 'amarelo_suave';
    operational_status: string;
    has_active_production: boolean;
    operator_name: string;
    fabrication_code: string;
    obra_name: string;
    stage: string;
    started_at: string | null;
    is_online: boolean;
    sync_pending?: boolean;
    active_calls_count?: number;
}

export interface TVCall {
    id: number;
    color: 'RED' | 'YELLOW';
    category: string;
    reason: string;
    description?: string;
    workcenter_id: number;
    workcenter_name: string;
    operator_name: string;
    mo_id?: number;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
    triggered_by: string;
    assigned_team?: string;
    created_at: string;
    updated_at: string;
}

export interface TVIDRequest {
    id: string;
    mo_number: string;
    product_name?: string; // Nome do produto (sem código AX)
    obra: string;
    package_code: string;
    status: string;
    production_status: 'waiting' | 'in_progress' | 'done';
    requester_name?: string;
    notes?: string;
    priority: string;
    is_transferred?: boolean;
    created_at: string;
    started_at?: string;
    finished_at?: string;
}

export type LogType =
    | 'INFO'
    | 'AMARELO'
    | 'VERMELHO'
    | 'ID_VISUAL_PENDENTE'
    | 'ID_VISUAL_EM_ANDAMENTO'
    | 'ID_VISUAL_OK'
    | 'ID_VISUAL_TRANSFERRED'
    | 'RESOLVIDO';

export interface TVLog {
    id: string;
    timestamp: string;
    type: LogType;
    source: string;
    text: string;
    requester?: string;
    highlight?: boolean;
    blinking?: boolean;
    finishedAt?: string;
}

interface AndonTVState {
    workcenters: TVWorkcenter[];
    calls: TVCall[];
    idRequests: TVIDRequest[];
    logs: TVLog[];
    lastUpdated: Date | null;
    isConnected: boolean;
    ttsBlocked: boolean;
    wsConnected: boolean;
}

const AndonTVContext = createContext<AndonTVState>({
    workcenters: [],
    calls: [],
    idRequests: [],
    logs: [],
    lastUpdated: null,
    isConnected: false,
    ttsBlocked: false,
    wsConnected: false,
});

// ── localStorage helpers ─────────────────────────────────────────

const LOGS_KEY = 'andon_tv_logs_v2'; // v2: logs agora usam operator_name em vez de workcenter_name
const MAX_LOGS = 30;

function loadLogsFromStorage(): TVLog[] {
    try {
        const raw = localStorage.getItem(LOGS_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as TVLog[];
    } catch {
        return [];
    }
}

function saveLogsToStorage(logs: TVLog[]) {
    try {
        localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
    } catch { /* ignorar */ }
}

// ── WebSocket URL ─────────────────────────────────────────────────

/**
 * Constrói a URL do WebSocket usando o protocolo e host atuais da página.
 * Isso garante que o WebSocket passe pelo proxy do Vite dentro do Docker,
 * e funcione tanto em http quanto em https.
 *
 * Exemplos:
 *   http://localhost:5173  →  ws://localhost:5173/api/v1/andon/ws
 *   https://app.exemplo.com  →  wss://app.exemplo.com/api/v1/andon/ws
 */
function buildWsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // inclui porta se houver
    return `${protocol}//${host}/api/v1/andon/ws`;
}

// ── TTS Engine ───────────────────────────────────────────────────

function speakPtBR(text: string): boolean {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
        console.warn('[TTS] Web Speech API não disponível neste navegador.');
        return false;
    }
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 0.92;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        const doSpeak = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                const ptVoice =
                    voices.find(v => v.lang === 'pt-BR') ??
                    voices.find(v => v.lang.startsWith('pt')) ??
                    null;
                if (ptVoice) utterance.voice = ptVoice;
            }
            window.speechSynthesis.speak(utterance);
        };

        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            doSpeak();
        } else {
            const timeout = setTimeout(() => {
                window.speechSynthesis.onvoiceschanged = null;
                doSpeak();
            }, 2000);
            window.speechSynthesis.onvoiceschanged = () => {
                clearTimeout(timeout);
                window.speechSynthesis.onvoiceschanged = null;
                doSpeak();
            };
        }
        return true;
    } catch (err) {
        console.warn('[TTS] Erro ao sintetizar voz:', err);
        return false;
    }
}

// ── Event → Log converters ──────────────────────────────────────

function makeLogId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatDuration(minutes: number | null | undefined): string {
    if (minutes == null) return '';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function eventToLog(ev: Record<string, unknown>): TVLog | null {
    const ts = (ev.resolved_at ?? ev.finished_at ?? ev.created_at ?? new Date().toISOString()) as string;
    const time = new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let log: TVLog | null = null;

    switch (ev.event_type) {
        case 'CALL_OPENED': {
            const type: LogType = ev.color === 'RED' ? 'VERMELHO' : 'AMARELO';
            const label = (ev.operator_name as string) || (ev.workcenter_name as string) || 'Mesa';
            log = {
                id: makeLogId(), timestamp: ts, type,
                source: label,
                text: `[${time}] ${type} — ${label} — ${ev.reason}`,
                requester: ev.triggered_by as string | undefined,
                highlight: true,
            };
            break;
        }
        case 'CALL_IN_PROGRESS': {
            const label = (ev.operator_name as string) || (ev.workcenter_name as string) || 'Mesa';
            log = {
                id: makeLogId(), timestamp: ts, type: 'INFO',
                source: label,
                text: `[${time}] EM ATENDIMENTO — ${label} — ${ev.reason}`,
                requester: ev.triggered_by as string | undefined,
            };
            break;
        }
        case 'CALL_RESOLVED': {
            const label = (ev.operator_name as string) || (ev.workcenter_name as string) || 'Mesa';
            const dur = formatDuration(ev.duration_minutes as number | undefined);
            log = {
                id: makeLogId(), timestamp: ts, type: 'RESOLVIDO',
                source: label,
                text: `[${time}] RESOLVIDO — ${label}${dur ? ` — Tempo: ${dur}` : ''}${ev.resolved_note ? ` — ${ev.resolved_note}` : ''}`,
                requester: ev.triggered_by as string | undefined,
                highlight: false,
            };
            break;
        }
        case 'IDVISUAL_CREATED': {
            if (!ev.requester_name && ev.source !== 'manual') return null;
            log = {
                id: makeLogId(), timestamp: ts, type: 'ID_VISUAL_PENDENTE',
                source: 'Produção',
                text: `Nova solicitação recebida da produção.`,
                requester: ev.requester_name as string | undefined,
            };
            break;
        }
        case 'IDVISUAL_STARTED': {
            log = {
                id: makeLogId(), timestamp: ts, type: 'ID_VISUAL_EM_ANDAMENTO',
                source: 'Engenharia',
                text: `Trabalhando.`,
                requester: ev.requester_name as string | undefined,
            };
            break;
        }
        case 'IDVISUAL_DONE': {
            log = {
                id: makeLogId(), timestamp: ts, type: 'ID_VISUAL_OK',
                source: 'Engenharia',
                text: `ID visual pronta, favor buscar na mesa da engenharia.`,
                requester: ev.requester_name as string | undefined,
                highlight: true,
                blinking: true,
                finishedAt: ev.finished_at as string | undefined,
            };
            break;
        }
        case 'IDVISUAL_TRANSFERRED': {
            log = {
                id: makeLogId(), timestamp: ts, type: 'ID_VISUAL_TRANSFERRED',
                source: 'Sistema',
                text: `Transferida para fila de produção.`,
                requester: ev.requester_name as string | undefined,
            };
            break;
        }
        default:
            return null;
    }

    if (!log || !log.id || !log.timestamp || !log.type || !log.source || !log.text) {
        console.error('[AndonTV] Log com campos obrigatórios ausentes, descartando:', log);
        return null;
    }

    return log;
}

// ── Pretty Printer ───────────────────────────────────────────────

export function formatLogForDebug(log: TVLog): string {
    const fields: Record<string, unknown> = {
        id: log.id,
        timestamp: new Date(log.timestamp).toISOString(),
        type: log.type,
        source: log.source,
        text: log.text,
    };
    if (log.requester != null) fields.requester = log.requester;
    if (log.highlight != null) fields.highlight = log.highlight;
    if (log.blinking != null) fields.blinking = log.blinking;
    if (log.finishedAt != null) fields.finishedAt = new Date(log.finishedAt).toISOString();
    return JSON.stringify(fields, null, 2);
}

// ── Provider ─────────────────────────────────────────────────────

/** Polling de fallback — garante atualização mesmo se WebSocket cair */
const POLL_INTERVAL_MS = 1500;
const BLINK_DURATION_MS = 5 * 60 * 1000;
const LOG_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function AndonTVProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<AndonTVState>({
        workcenters: [],
        calls: [],
        idRequests: [],
        logs: loadLogsFromStorage(),
        lastUpdated: null,
        isConnected: false,
        ttsBlocked: false,
        wsConnected: false,
    });

    const seenEventKeys = useRef<Set<string>>(new Set());
    const lastVersion = useRef<string | number | null>(null);
    // Controla se o polling de fundo está em andamento (não bloqueia fetch do WS)
    const isPollingRef = useRef(false);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        let cancelled = false;

        // ── Fetch /tv-data ────────────────────────────────────────────────────
        // force=true: disparado pelo WebSocket — nunca bloqueado, sempre processa
        // force=false: polling de fundo — bloqueado se já há um em andamento
        const fetchData = async (force = false) => {
            if (!force && isPollingRef.current) return;
            if (!force) isPollingRef.current = true;
            try {
                const data = await api.getAndonTVData();
                if (cancelled) return;

                const newVersion = String(data.version ?? '');

                // Sempre processar se forçado (WebSocket) ou se versão mudou
                const versionChanged = newVersion !== lastVersion.current;
                if (!force && !versionChanged) {
                    // Versão igual no polling — apenas confirmar conexão
                    setState(prev => prev.isConnected ? prev : { ...prev, isConnected: true });
                    return;
                }

                // Atualizar versão rastreada
                if (versionChanged) {
                    lastVersion.current = newVersion;
                }

                const newLogs: TVLog[] = [];
                const events: Record<string, unknown>[] = Array.isArray(data.recent_events)
                    ? (data.recent_events as Record<string, unknown>[]).slice().reverse()
                    : [];

                const ttsQueue: string[] = [];

                for (const ev of events) {
                    const entityId = ev.entity_id != null
                        ? String(ev.entity_id)
                        : String(ev.mo_number ?? ev.workcenter_name ?? 'unknown');
                    const suffix =
                        ev.event_type === 'CALL_RESOLVED' ? 'R' :
                        ev.event_type === 'IDVISUAL_DONE' ? 'D' :
                        ev.event_type === 'CALL_IN_PROGRESS' ? 'P' : 'O';
                    const key = `${ev.event_type}:${entityId}:${suffix}`;

                    if (!seenEventKeys.current.has(key)) {
                        seenEventKeys.current.add(key);
                        const log = eventToLog(ev);
                        if (log) {
                            newLogs.push(log);
                            if (ev.event_type === 'IDVISUAL_DONE' && ev.requester_name) {
                                ttsQueue.push(
                                    `Atenção ${ev.requester_name}. Sua Identificação Visual foi finalizada. Por favor retire na mesa da engenharia.`
                                );
                            }
                        }
                    }
                }

                let ttsWasBlocked = false;
                for (const msg of ttsQueue) {
                    if (!speakPtBR(msg)) ttsWasBlocked = true;
                }

                setState(prev => {
                    const combined = [...newLogs.slice().reverse(), ...prev.logs].slice(0, MAX_LOGS);
                    saveLogsToStorage(combined);
                    return {
                        workcenters: Array.isArray(data.workcenters) ? data.workcenters : [],
                        calls: Array.isArray(data.calls) ? data.calls : [],
                        idRequests: Array.isArray(data.id_requests) ? data.id_requests : [],
                        logs: combined,
                        lastUpdated: new Date(),
                        isConnected: true,
                        ttsBlocked: ttsWasBlocked ? true : prev.ttsBlocked,
                        wsConnected: prev.wsConnected,
                    };
                });
            } catch {
                if (!cancelled) {
                    setState(prev => ({ ...prev, isConnected: false }));
                }
            } finally {
                if (!force) isPollingRef.current = false;
            }
        };

        // ── WebSocket via proxy Vite ──────────────────────────────────────────
        let wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null;

        const connectWebSocket = () => {
            if (cancelled) return;

            // URL relativa — passa pelo proxy do Vite (ws: true) dentro do Docker
            const wsUrl = buildWsUrl();
            let ws: WebSocket;
            try {
                ws = new WebSocket(wsUrl);
            } catch {
                // WebSocket não suportado ou URL inválida — polling cobre
                return;
            }
            wsRef.current = ws;

            ws.onopen = () => {
                if (cancelled) { ws.close(); return; }
                console.info('[AndonTV] WebSocket conectado — modo tempo real ativo');
                setState(prev => ({ ...prev, wsConnected: true }));
                fetchData(true); // sincronizar imediatamente ao conectar
            };

            ws.onmessage = (event) => {
                if (cancelled) return;
                try {
                    const msg = JSON.parse(event.data as string) as { event: string };
                    if (msg.event === 'andon_version_changed') {
                        fetchData(true); // fetch forçado — nunca bloqueado, ignora versão cached
                    }
                } catch { /* mensagem malformada — ignorar */ }
            };

            ws.onclose = () => {
                wsRef.current = null;
                if (!cancelled) {
                    setState(prev => ({ ...prev, wsConnected: false }));
                    // Reconectar após 5s — polling de 1.5s cobre o intervalo
                    wsReconnectTimeout = setTimeout(connectWebSocket, 5000);
                }
            };

            ws.onerror = () => {
                // onclose dispara logo após — reconexão tratada lá
                ws.close();
            };
        };

        // Polling de fallback — 1.5s garante atualização mesmo sem WebSocket
        const fetchInterval = setInterval(() => fetchData(false), POLL_INTERVAL_MS);

        // Limpeza de logs expirados (a cada 1 minuto)
        const cleanupInterval = setInterval(() => {
            const now = new Date();
            setState(prev => {
                let changed = false;
                const updated = prev.logs
                    .filter(log => {
                        if (log.type !== 'ID_VISUAL_OK') return true;
                        const base = log.finishedAt ? new Date(log.finishedAt) : new Date(log.timestamp);
                        const keep = now.getTime() - base.getTime() < LOG_EXPIRY_MS;
                        if (!keep) changed = true;
                        return keep;
                    })
                    .map(log => {
                        if (log.type !== 'ID_VISUAL_OK' || !log.blinking) return log;
                        const base = log.finishedAt ? new Date(log.finishedAt) : new Date(log.timestamp);
                        if (now.getTime() - base.getTime() >= BLINK_DURATION_MS) {
                            changed = true;
                            return { ...log, blinking: false };
                        }
                        return log;
                    });

                if (!changed) return prev;
                saveLogsToStorage(updated);
                return { ...prev, logs: updated };
            });
        }, 60_000);

        // Iniciar
        fetchData(false);
        connectWebSocket();

        return () => {
            cancelled = true;
            clearInterval(fetchInterval);
            clearInterval(cleanupInterval);
            if (wsReconnectTimeout) clearTimeout(wsReconnectTimeout);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, []);

    return (
        <AndonTVContext.Provider value={state}>
            {children}
        </AndonTVContext.Provider>
    );
}

export function useAndonTV() {
    return useContext(AndonTVContext);
}
