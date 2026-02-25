const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const api = {
    get: async (endpoint: string) => {
        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API Request Failed:', error);
            throw error;
        }
    },
    healthCheck: async () => {
        return api.get('/health');
    },
    getBatchMatrix: async (batchId: string) => {
        return api.get(`/batches/${batchId}/matrix`);
    },
    updateBatchTask: async (batchId: string, payload: any) => {
        try {
            const response = await fetch(`${API_URL}/batches/${batchId}/tasks`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const error = new Error(errorData.detail || `API Error: ${response.statusText}`);
                (error as any).status = response.status;
                throw error;
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    },
    getOdooMOs: async () => {
        return api.get('/odoo/mos');
    },
    getFinishedBatches: async () => {
        return api.get('/batches/finished');
    },
    getActiveBatches: async () => {
        return api.get('/batches/active');
    },
    createBatch: async (moIds: number[]) => {
        try {
            const response = await fetch(`${API_URL}/batches/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mo_ids: moIds }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `API Error: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Create Batch Failed:', error);
            throw error;
        }
    },
    finalizeBatch: async (batchId: string) => {
        const response = await fetch(`${API_URL}/batches/${batchId}/finalize`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(data.detail?.message || data.detail || `API Error: ${response.statusText}`);
            (error as any).status = response.status;
            (error as any).data = data.detail; // Contains pendencies array on 400
            throw error;
        }

        return data;
    },

    // ── Production Portal ──
    searchMOs: async (query: string) => {
        return api.get(`/production/search?q=${encodeURIComponent(query)}`);
    },

    getBlueprints: async () => {
        return api.get('/production/blueprints');
    },

    createManualRequest: async (payload: {
        odoo_mo_id: number;
        panel_type: string;
        id_types: string[];
        requester_name: string;
        notes?: string;
    }) => {
        const response = await fetch(`${API_URL}/production/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(data.detail?.message || data.detail || `API Error: ${response.statusText}`);
            (error as any).status = response.status;
            (error as any).data = data.detail;
            throw error;
        }

        return data;
    },

    // ── Manual Queue & Transfer ──
    getManualRequests: async () => {
        return api.get('/id-requests/manual');
    },
    getManualRequestsCount: async () => {
        const res = await api.get('/id-requests/manual/count');
        return res; // { open_count: number }
    },
    transferManualRequest: async (requestId: string) => {
        const response = await fetch(`${API_URL}/id-requests/manual/${requestId}/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.detail?.message || data.detail || `API Error: ${response.statusText}`);
            (error as any).status = response.status;
            throw error;
        }
        return data;
    },

    async getProductionRequests(limit: number = 50, offset: number = 0) {
        return api.get(`/production/requests?limit=${limit}&offset=${offset}`);
    },
    getMODocuments: async (moId: number, limit: number = 50, offset: number = 0) => {
        return api.get(`/odoo/mos/${moId}/documents?limit=${limit}&offset=${offset}`);
    },
};
