/**
 * AndonTVContext — Centralized state for the Andon TV screen.
 * - Polls /andon/tv-data every 8s
 * - Compares version to skip unchanged responses
 * - Generates log entries from recent_events
 * - Persists last 30 logs in localStorage
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';

// ── Types ─────────────────────────────────────────────────────────

export interface TVWorkcenter {
    id: number;
    name: string;
    code: string;
    status: 'verde' | 'amarelo' | 'vermelho' | 'cinza';
    operational_status: string;
    has_active_production: boolean;
    operator_name: string;
    fabrication_code: string;
    obra_name: string;
    stage: string;
    started_at: string | null;
    is_online: boolean;
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
    highlight?: boolean; // flash on arrival
    finishedAt?: string; // used for 2h expiration
}

interface AndonTVState {
    workcenters: TVWorkcenter[];
    calls: TVCall[];
    idRequests: TVIDRequest[];
    logs: TVLog[];
    lastUpdated: Date | null;
    isConnected: boolean;
}

const AndonTVContext = createContext<AndonTVState>({
    workcenters: [],
    calls: [],
    idRequests: [],
    logs: [],
    lastUpdated: null,
    isConnected: false,
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
        // ignore storage errors
    }
}

// ── Event → Log converters ──────────────────────────────────────

function makeLogId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatDuration(minutes: number | null | undefined): string {
    if (minutes == null) return '';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function eventToLog(ev: any): TVLog | null {
    const ts = ev.resolved_at || ev.finished_at || ev.created_at || new Date().toISOString();
    const time = new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    switch (ev.event_type) {
        case 'CALL_OPENED': {
            const type: LogType = ev.color === 'RED' ? 'VERMELHO' : 'AMARELO';
            return {
                id: makeLogId(),
                timestamp: ts,
                type,
                source: ev.workcenter_name || 'Mesa',
                text: `[${time}] ${type} — ${ev.workcenter_name} — ${ev.reason}`,
                requester: ev.triggered_by,
                highlight: true,
            };
        }
        case 'CALL_IN_PROGRESS': {
            return {
                id: makeLogId(),
                timestamp: ts,
                type: 'INFO',
                source: ev.workcenter_name || 'Mesa',
                text: `[${time}] EM ATENDIMENTO — ${ev.workcenter_name} — ${ev.reason}`,
                requester: ev.triggered_by,
            };
        }
        case 'CALL_RESOLVED': {
            const dur = formatDuration(ev.duration_minutes);
            return {
                id: makeLogId(),
                timestamp: ts,
                type: 'RESOLVIDO',
                source: ev.workcenter_name || 'Mesa',
                text: `[${time}] RESOLVIDO — ${ev.workcenter_name}${dur ? ` — Tempo: ${dur}` : ''}${ev.resolved_note ? ` — ${ev.resolved_note}` : ''}`,
                requester: ev.triggered_by,
                highlight: false,
            };
        }
        case 'IDVISUAL_CREATED': {
            return {
                id: makeLogId(),
                timestamp: ts,
                type: 'ID_VISUAL_PENDENTE',
                source: 'Produção',
                text: `[${time}] ID VISUAL — Em espera — ${ev.mo_number}`,
                requester: ev.requester_name,
            };
        }
        case 'IDVISUAL_STARTED': {
            return {
                id: makeLogId(),
                timestamp: ts,
                type: 'ID_VISUAL_EM_ANDAMENTO',
                source: 'Engenharia',
                text: `[${time}] ID VISUAL — Trabalhando — ${ev.mo_number}`,
                requester: ev.requester_name,
            };
        }
        case 'IDVISUAL_DONE': {
            const dur = formatDuration(ev.duration_minutes);
            return {
                id: makeLogId(),
                timestamp: ts,
                type: 'ID_VISUAL_OK',
                source: 'Engenharia',
                text: `[${time}] ✅ ID VISUAL PRONTA — ${ev.mo_number}${dur ? ` — Tempo: ${dur}` : ''}${ev.notes ? ` — ${ev.notes}` : ''}`,
                requester: ev.requester_name,
                highlight: true,
                finishedAt: ev.finished_at,
            };
        }
        case 'IDVISUAL_TRANSFERRED': {
            return {
                id: makeLogId(),
                timestamp: ts,
                type: 'ID_VISUAL_EM_ANDAMENTO', // Display with Working style
                source: 'Produção',
                text: `[${time}] ID VISUAL — Trabalhando — Transferida para o Dashboard — ${ev.mo_number}${ev.requester_name ? ` — Solicitante: ${ev.requester_name}` : ''}`,
                requester: ev.requester_name,
                highlight: true,
            };
        }
        default:
            return null;
    }
}

// ── Provider ─────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 8000;

export function AndonTVProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<AndonTVState>({
        workcenters: [],
        calls: [],
        idRequests: [],
        logs: loadLogsFromStorage(),
        lastUpdated: null,
        isConnected: false,
    });

    // Track which event entity IDs we've already logged to avoid duplicates
    const seenEventKeys = useRef<Set<string>>(new Set());
    const lastVersion = useRef<string | number | null>(null);

    useEffect(() => {
        let cancelled = false;

        const fetchData = async () => {
            try {
                const data = await api.getAndonTVData();

                if (cancelled) return;

                // Skip if version unchanged
                const newVersion = data.version;
                if (newVersion === lastVersion.current) {
                    setState(prev => ({ ...prev, isConnected: true }));
                    return;
                }
                lastVersion.current = newVersion;

                // Generate new logs from recent_events (avoid duplicates)
                const newLogs: TVLog[] = [];
                const events: any[] = (data.recent_events || []).slice().reverse(); // oldest first
                for (const ev of events) {
                    const key = `${ev.event_type}:${ev.entity_id}:${ev.event_type === 'CALL_RESOLVED' ? 'R' : ev.event_type === 'IDVISUAL_DONE' ? 'D' : ev.event_type === 'CALL_IN_PROGRESS' ? 'P' : 'O'}`;
                    if (!seenEventKeys.current.has(key)) {
                        seenEventKeys.current.add(key);
                        const log = eventToLog(ev);
                        if (log) newLogs.push(log);
                    }
                }

                setState(prev => {
                    // Prepend new logs (newest first)
                    const combined = [...newLogs.slice().reverse(), ...prev.logs].slice(0, MAX_LOGS);
                    saveLogsToStorage(combined);
                    return {
                        workcenters: Array.isArray(data.workcenters) ? data.workcenters : [],
                        calls: Array.isArray(data.calls) ? data.calls : [],
                        idRequests: Array.isArray(data.id_requests) ? data.id_requests : [],
                        logs: combined,
                        lastUpdated: new Date(),
                        isConnected: true,
                    };
                });
            } catch (err) {
                if (!cancelled) {
                    setState(prev => ({ ...prev, isConnected: false }));
                }
            }
        };

        const fetchInterval = setInterval(fetchData, POLL_INTERVAL_MS);

        // --- Log Expiration Cleanup (Every 1 minute) ---
        const cleanupInterval = setInterval(() => {
            const now = new Date();
            setState(prev => {
                const filtered = prev.logs.filter(log => {
                    if (log.type !== 'ID_VISUAL_OK') return true;

                    // Expiration relative to finishedAt (priority) or timestamp (fallback)
                    const baseDate = log.finishedAt ? new Date(log.finishedAt) : new Date(log.timestamp);
                    const diffMs = now.getTime() - baseDate.getTime();
                    const hoursElapsed = diffMs / (1000 * 60 * 60);

                    return hoursElapsed < 2; // Return true to keep log if < 2h
                });

                if (filtered.length !== prev.logs.length) {
                    saveLogsToStorage(filtered);
                    return { ...prev, logs: filtered };
                }
                return prev;
            });
        }, 60000);

        fetchData();
        return () => {
            cancelled = true;
            clearInterval(fetchInterval);
            clearInterval(cleanupInterval);
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
