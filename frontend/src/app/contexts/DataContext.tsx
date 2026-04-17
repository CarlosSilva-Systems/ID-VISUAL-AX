import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { Fabrication, ODOO_STATE_TO_MRP, BACKEND_STATUS_TO_ID, StatusID, MRPState } from '../types';

interface SyncStatus {
    odoo_version: string;
    requests_version: string;
}

interface DataContextType {
    odooMOs: Fabrication[];
    manualRequests: Fabrication[];
    loadingMOs: boolean;
    loadingRequests: boolean;
    refreshMOs: (force?: boolean) => Promise<void>;
    refreshManualRequests: (force?: boolean) => Promise<void>;
    syncStatus: SyncStatus | null;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Helper for fetch deduplication
const memoPromise = <T,>(fn: () => Promise<T>) => {
    let pending: Promise<T> | null = null;
    return () => {
        if (pending) return pending;
        pending = fn().finally(() => { pending = null; });
        return pending;
    };
};

const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '-';
    try {
        // Se já vier com T ou for apenas YYYY-MM-DD
        const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return dateStr;
    }
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [odooMOs, setOdooMOs] = useState<Fabrication[]>([]);
    const [manualRequests, setManualRequests] = useState<Fabrication[]>([]);
    const [loadingMOs, setLoadingMOs] = useState(false);
    const [loadingRequests, setLoadingRequests] = useState(false);
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

    const versionsRef = useRef<SyncStatus>({ odoo_version: '', requests_version: '' });



    const fetchMOs = useCallback(async () => {
        setLoadingMOs(true);
        try {
            const data = await api.getOdooMOs();
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const mapped = data.map((mo: any): Fabrication => {
                let slaStatus = 'Sem Prazo';
                if (mo.activity_date_deadline) {
                    const deadline = new Date(mo.activity_date_deadline + 'T00:00:00');
                    if (deadline < today) {
                        slaStatus = 'Vencida';
                    } else if (deadline.getTime() === today.getTime()) {
                        slaStatus = 'Vence Hoje';
                    } else {
                        slaStatus = 'No Prazo';
                    }
                }

                // Mapeia o estado bruto do Odoo para o StatusID do sistema.
                // MOs vindas do Odoo com atividade "Imprimir ID Visual" ainda não têm
                // IDRequest criada — exibimos "Sem Solicitação" como estado neutro.
                // Quando o estado é "confirmed" ou "progress", a MO está aguardando
                // processamento, então mapeamos para "Nova".
                const rawState: string = mo.state || 'unknown';
                let statusID: StatusID;
                if (rawState === 'confirmed' || rawState === 'progress' || rawState === 'to_close') {
                    statusID = 'Nova';
                } else if (rawState === 'done') {
                    statusID = 'Concluída';
                } else if (rawState === 'cancel') {
                    statusID = 'Cancelada';
                } else {
                    statusID = 'Sem Solicitação';
                }

                // Estado da MO no Odoo para exibição informativa (badge secundário)
                const mrpState: MRPState = ODOO_STATE_TO_MRP[rawState] ?? 'Desconhecido';

                // Normalizar obra (pode vir como array [id, "nome"] do Odoo)
                let obraStr = '';
                if (typeof mo.obra === 'string') {
                    obraStr = mo.obra;
                } else if (Array.isArray(mo.obra) && mo.obra.length > 1) {
                    obraStr = String(mo.obra[1]);
                } else if (mo.obra && typeof mo.obra === 'object' && 'name' in mo.obra) {
                    obraStr = String(mo.obra.name);
                }

                return {
                    id: String(mo.odoo_mo_id),
                    mo_number: mo.mo_number,
                    obra: obraStr,
                    status: statusID,
                    priority: 'Normal',
                    date_start: formatDate(mo.date_start),
                    product_qty: mo.product_qty,
                    sla: slaStatus,
                    deadline_date: formatDate(mo.activity_date_deadline),
                    mrp_state: mrpState,
                    tasks: [],
                    docs: { diagrama: false, legenda: false },
                    from_production: mo.from_production,
                    production_requester: mo.production_requester,
                    source: mo.from_production ? 'producao' : 'odoo'
                };
            });
            setOdooMOs(mapped);
        } catch (e) {
            console.error('Failed to fetch MOs', e);
        } finally {
            setLoadingMOs(false);
        }
    }, []);

    const fetchManualRequests = useCallback(async () => {
        setLoadingRequests(true);
        try {
            const data = await api.getManualRequests();
            const mapped = data.map((req: any): Fabrication => {
                // Mapeia o status snake_case do backend para o StatusID tipado do frontend
                const rawStatus: string = req.status ?? 'nova';
                const statusID: StatusID = BACKEND_STATUS_TO_ID[rawStatus] ?? 'Nova';

                // Estado da MO no Odoo para exibição informativa
                const rawMoState: string = req.mo_state ?? 'unknown';
                const mrpState: MRPState = ODOO_STATE_TO_MRP[rawMoState] ?? 'Desconhecido';

                // SLA: usa o label retornado pelo backend se disponível
                const sla: string = req.mo_state_label ?? 'Sem Prazo';

                return {
                    id: req.request_id,
                    mo_number: req.mo_number,
                    obra: req.obra_nome,
                    product_qty: req.product_qty,
                    date_start: formatDate(req.date_start),
                    sla,
                    priority: req.priority ?? 'Normal',
                    status: statusID,
                    mrp_state: mrpState,
                    tasks: [],
                    docs: { diagrama: true, legenda: true },
                    requester_name: req.requester_name,
                    notes: req.notes,
                    request_id: req.request_id,
                    source: 'producao'
                };
            });
            setManualRequests(mapped);
        } catch (e) {
            console.error('Failed to fetch Manual Requests', e);
        } finally {
            setLoadingRequests(false);
        }
    }, []);

    const memoFetchMOs = useMemo(() => memoPromise(fetchMOs), [fetchMOs]);
    const memoFetchManualRequests = useMemo(() => memoPromise(fetchManualRequests), [fetchManualRequests]);

    const checkSync = useCallback(async () => {
        try {
            const status: SyncStatus = await api.getSyncStatus();
            setSyncStatus(status);

            if (status.odoo_version !== versionsRef.current.odoo_version) {
                versionsRef.current.odoo_version = status.odoo_version;
                memoFetchMOs();
            }
            if (status.requests_version !== versionsRef.current.requests_version) {
                versionsRef.current.requests_version = status.requests_version;
                memoFetchManualRequests();
            }
        } catch (e) {
            console.error('Sync check failed', e);
        }
    }, [memoFetchMOs, memoFetchManualRequests]);

    const refreshMOs = useCallback(async (force = false) => {
        if (force) {
            await fetchMOs();
        } else {
            await memoFetchMOs();
        }
    }, [fetchMOs, memoFetchMOs]);

    const refreshManualRequests = useCallback(async (force = false) => {
        if (force) {
            await fetchManualRequests();
        } else {
            await memoFetchManualRequests();
        }
    }, [fetchManualRequests, memoFetchManualRequests]);

    useEffect(() => {
        checkSync();
        const interval = setInterval(checkSync, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, [checkSync]);

    // Also check on window focus
    useEffect(() => {
        const handleFocus = () => checkSync();
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [checkSync]);

    return (
        <DataContext.Provider value={{
            odooMOs,
            manualRequests,
            loadingMOs,
            loadingRequests,
            refreshMOs,
            refreshManualRequests,
            syncStatus
        }}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};
