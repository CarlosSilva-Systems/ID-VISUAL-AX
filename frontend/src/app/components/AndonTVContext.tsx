/**
 * AndonTVContext — Centralized state for the Andon TV screen.
 * - Polls /andon/tv-data every 8s
 * - Compares version to skip unchanged responses
 * - Generates log entries from recent_events
 * - Persists last 30 logs in localStorage
 * - TTS (Web Speech API) para eventos IDVISUAL_DONE
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
    highlight?: boolean;   // flash on arrival
    blinking?: boolean;    // piscar lento por 5 min (apenas ID_VISUAL_OK)
    finishedAt?: string;   // usado para expiração de 24h e timer de 5min
}

interface AndonTVState {
    workcenters: TVWorkcenter[];
    calls: TVCall[];
    idRequests: TVIDRequest[];
    logs: TVLog[];
    lastUpdated: Date | null;
    isConnected: boolean;
    ttsBlocked: boolean;   // true se o browser bloqueou autoplay de áudio
    wsConnected: boolean;  // true se WebSocket está ativo (tempo real)
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

const LOGS_KEY = 'andon_tv_logs';
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
    } catch {
        // ignorar erros de storage
    }
}

// ── TTS Engine ───────────────────────────────────────────────────

/**
 * Sintetiza voz em pt-BR usando Web Speech API.
 * Retorna true se disparou com sucesso, false se bloqueado/indisponível.
 *
 * NOTA: Chrome carrega vozes de forma assíncrona. Esta função tenta selecionar
 * uma voz pt-BR se disponível, mas funciona mesmo sem ela (usa voz padrão do sistema).
 */
function speakPtBR(text: string): boolean {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
        console.warn('[TTS] Web Speech API não disponível neste navegador.');
        return false;
    }
    try {
        // Cancelar qualquer fala em andamento para não acumular fila
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 0.92;   // ligeiramente mais lento para clareza
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Função interna que tenta selecionar voz pt-BR e dispara a fala
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

        // Chrome: vozes podem não estar carregadas ainda na primeira chamada
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            doSpeak();
        } else {
            // Aguardar carregamento das vozes (máx 2s) e então falar
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

/**
 * Converte um evento do backend em uma entrada de log.
 * Retorna null para eventos que não devem gerar log.
 * Valida campos obrigatórios antes de retornar (Req 12 AC 4-5).
 */
export function eventToLog(ev: Record<string, unknown>): TVLog | null {
    const ts = (ev.resolved_at ?? ev.finished_at ?? ev.created_at ?? new Date().toISOString()) as string;
    const time = new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let log: TVLog | null = null;

    switch (ev.event_type) {
        case 'CALL_OPENED': {
            const type: LogType = ev.color === 'RED' ? 'VERMELHO' : 'AMARELO';
            log = {
                id: makeLogId(),
                timestamp: ts,
                type,
                source: (ev.workcenter_name as string) || 'Mesa',
                text: `[${time}] ${type} — ${ev.workcenter_name} — ${ev.reason}`,
                requester: ev.triggered_by as string | undefined,
                highlight: true,
            };
            break;
        }
        case 'CALL_IN_PROGRESS': {
            log = {
                id: makeLogId(),
                timestamp: ts,
                type: 'INFO',
                source: (ev.workcenter_name as string) || 'Mesa',
                text: `[${time}] EM ATENDIMENTO — ${ev.workcenter_name} — ${ev.reason}`,
                requester: ev.triggered_by as string | undefined,
            };
            break;
        }
        case 'CALL_RESOLVED': {
            const dur = formatDuration(ev.duration_minutes as number | undefined);
            log = {
                id: makeLogId(),
                timestamp: ts,
                type: 'RESOLVIDO',
                source: (ev.workcenter_name as string) || 'Mesa',
                text: `[${time}] RESOLVIDO — ${ev.workcenter_name}${dur ? ` — Tempo: ${dur}` : ''}${ev.resolved_note ? ` — ${ev.resolved_note}` : ''}`,
                requester: ev.triggered_by as string | undefined,
                highlight: false,
            };
            break;
        }
        case 'IDVISUAL_CREATED': {
            // Só gera log quando solicitado manualmente pela produção (Req 1 AC 1, Req 10 AC 2)
            if (!ev.requester_name && ev.source !== 'manual') return null;
            log = {
                id: makeLogId(),
                timestamp: ts,
                type: 'ID_VISUAL_PENDENTE',
                source: 'Produção',
                text: `Nova solicitação recebida da produção.`,
                requester: ev.requester_name as string | undefined,
            };
            break;
        }
        case 'IDVISUAL_STARTED': {
            log = {
                id: makeLogId(),
                timestamp: ts,
                type: 'ID_VISUAL_EM_ANDAMENTO',
                source: 'Engenharia',
                text: `Trabalhando.`,
                requester: ev.requester_name as string | undefined,
            };
            break;
        }
        case 'IDVISUAL_DONE': {
            log = {
                id: makeLogId(),
                timestamp: ts,
                type: 'ID_VISUAL_OK',
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
            // Gera log laranja de transferência para a fila (Req 2)
            log = {
                id: makeLogId(),
                timestamp: ts,
                type: 'ID_VISUAL_TRANSFERRED',
                source: 'Sistema',
                text: `Transferida para fila de produção.`,
                requester: ev.requester_name as string | undefined,
            };
            break;
        }
        default:
            return null;
    }

    // Validação de campos obrigatórios (Req 12 AC 4-5)
    if (!log || !log.id || !log.timestamp || !log.type || !log.source || !log.text) {
        console.error('[AndonTV] Log com campos obrigatórios ausentes, descartando:', log);
        return null;
    }

    return log;
}

// ── Pretty Printer (Req 11) ──────────────────────────────────────

/**
 * Formata um TVLog em string legível para debugging.
 * Omite campos opcionais quando undefined/null.
 */
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

const POLL_INTERVAL_MS = 1500;  // 1.5s — polling agressivo para resposta quase instantânea
/** Tempo em ms que ID_VISUAL_OK fica piscando (5 minutos) */
const BLINK_DURATION_MS = 5 * 60 * 1000;
/** Tempo em ms após o qual ID_VISUAL_OK é removido do log (24 horas) */
const LOG_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Constrói a URL do WebSocket a partir da URL da API HTTP */
function buildWsUrl(): string {
    const apiUrl = (import.meta as Record<string, any>).env?.VITE_API_URL || 'http://localhost:8000/api/v1';
    // Trocar protocolo http(s) por ws(s) e apontar para /andon/ws
    return apiUrl.replace(/^http/, 'ws') + '/andon/ws';
}

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

    // Rastreia chaves de eventos já processados para evitar duplicatas (Req 9)
    const seenEventKeys = useRef<Set<string>>(new Set());
    const lastVersion = useRef<string | number | null>(null);
    // Ref para o WebSocket ativo — permite fechar na limpeza
    const wsRef = useRef<WebSocket | null>(null);
    // Ref para o fetch em andamento — evita fetches paralelos
    const fetchingRef = useRef(false);
    // AbortController para cancelar fetch anterior quando um novo chega
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        let cancelled = false;

        // ── Fetch de dados do /tv-data ────────────────────────────────────────
        const fetchData = async () => {
            // Cancelar fetch anterior se ainda estiver em andamento
            if (abortRef.current) {
                abortRef.current.abort();
            }
            abortRef.current = new AbortController();

            try {
                const data = await api.getAndonTVData();
                if (cancelled) return;

                // Pular se versão não mudou
                const newVersion = data.version;
                if (newVersion === lastVersion.current) {
                    setState(prev => ({ ...prev, isConnected: true }));
                    return;
                }
                lastVersion.current = newVersion;

                // Gerar novos logs a partir de recent_events (evitar duplicatas)
                const newLogs: TVLog[] = [];
                // Backend retorna mais recente primeiro; invertemos para processar do mais antigo
                const events: Record<string, unknown>[] = Array.isArray(data.recent_events)
                    ? (data.recent_events as Record<string, unknown>[]).slice().reverse()
                    : [];

                const ttsQueue: string[] = [];

                for (const ev of events) {
                    // Chave única por evento + estado (Req 9 AC 2, AC 5)
                    // entity_id pode ser int (AndonCall) ou UUID string (IDRequest) — normalizar para string
                    const entityId = ev.entity_id != null
                        ? String(ev.entity_id)
                        : (ev.mo_number ?? ev.workcenter_name ?? 'unknown');
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
                            // Enfileirar TTS para IDVISUAL_DONE (Req 4 AC 1)
                            if (ev.event_type === 'IDVISUAL_DONE' && ev.requester_name) {
                                ttsQueue.push(
                                    `Atenção ${ev.requester_name}. Sua Identificação Visual foi finalizada. Por favor retire na mesa da engenharia.`
                                );
                            }
                        }
                    }
                }

                // Disparar TTS para cada IDVISUAL_DONE novo (Req 4)
                let ttsWasBlocked = false;
                for (const msg of ttsQueue) {
                    const ok = speakPtBR(msg);
                    if (!ok) ttsWasBlocked = true;
                }

                setState(prev => {
                    // Prepend novos logs (mais recente no topo)
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
                    };
                });
            } catch {
                if (!cancelled) {
                    setState(prev => ({ ...prev, isConnected: false }));
                }
            } finally {
                abortRef.current = null;
            }
        };

        // ── WebSocket — notificação em tempo real ─────────────────────────────
        let wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null;

        const connectWebSocket = () => {
            if (cancelled) return;

            const wsUrl = buildWsUrl();
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                if (cancelled) { ws.close(); return; }
                setState(prev => ({ ...prev, wsConnected: true }));
                // Conexão estabelecida — fetch imediato para sincronizar
                fetchData();
            };

            ws.onmessage = (event) => {
                if (cancelled) return;
                try {
                    const msg = JSON.parse(event.data as string) as { event: string; data?: unknown };
                    if (msg.event === 'andon_version_changed') {
                        // Dado mudou no servidor — fetch imediato
                        fetchData();
                    }
                } catch {
                    // mensagem malformada — ignorar
                }
            };

            ws.onclose = () => {
                wsRef.current = null;
                setState(prev => ({ ...prev, wsConnected: false }));
                if (!cancelled) {
                    // Reconectar após 3s
                    wsReconnectTimeout = setTimeout(connectWebSocket, 3000);
                }
            };

            ws.onerror = () => {
                // onclose será chamado logo após — reconexão tratada lá
                ws.close();
            };
        };

        // Polling de fallback — garante atualização mesmo se WebSocket cair
        const fetchInterval = setInterval(fetchData, POLL_INTERVAL_MS);

        // Limpeza de logs expirados e desativação de blinking após 5min (a cada 1 minuto)
        const cleanupInterval = setInterval(() => {
            const now = new Date();
            setState(prev => {
                let changed = false;
                const updated = prev.logs
                    .filter(log => {
                        if (log.type !== 'ID_VISUAL_OK') return true;
                        // Expirar após 24h (Req 5 AC 6)
                        const base = log.finishedAt ? new Date(log.finishedAt) : new Date(log.timestamp);
                        const keep = now.getTime() - base.getTime() < LOG_EXPIRY_MS;
                        if (!keep) changed = true;
                        return keep;
                    })
                    .map(log => {
                        if (log.type !== 'ID_VISUAL_OK' || !log.blinking) return log;
                        // Desativar blinking após 5min (Req 5 AC 5)
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

        // Iniciar: fetch imediato + WebSocket
        fetchData();
        connectWebSocket();

        return () => {
            cancelled = true;
            clearInterval(fetchInterval);
            clearInterval(cleanupInterval);
            if (wsReconnectTimeout) clearTimeout(wsReconnectTimeout);
            if (abortRef.current) {
                abortRef.current.abort();
                abortRef.current = null;
            }
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
