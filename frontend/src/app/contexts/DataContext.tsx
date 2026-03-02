import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { Fabrication } from '../types';

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
            const mapped = data.map((mo: any): Fabrication => ({
                id: String(mo.odoo_mo_id),
                mo_number: mo.mo_number,
                obra: mo.obra,
                status: mo.state === 'confirmed' ? 'Nova' : mo.state,
                priority: 'Normal',
                date_start: mo.date_start ? new Date(mo.date_start).toLocaleDateString('pt-BR') : '-',
                product_qty: mo.product_qty,
                sla: 'No Prazo',
                mrp_state: 'Em Produção',
                tasks: [],
                docs: { diagrama: false, legenda: false },
                from_production: mo.from_production,
                production_requester: mo.production_requester
            }));
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
            const mapped = data.map((req: any): Fabrication => ({
                id: req.request_id,
                mo_number: req.mo_number,
                obra: req.obra_nome,
                product_qty: req.product_qty,
                date_start: req.date_start ? String(req.date_start).split('T')[0] : '',
                sla: 'Urgente',
                priority: req.priority,
                status: req.status.charAt(0).toUpperCase() + req.status.slice(1),
                mrp_state: 'Em Produção',
                tasks: [],
                docs: { diagrama: true, legenda: true },
                requester_name: req.requester_name,
                notes: req.notes,
                request_id: req.request_id
            }));
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
