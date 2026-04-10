const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';


const getHeaders = () => {
    const token = localStorage.getItem('id_visual_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
};

export const api = {
    login: async (username: string, password: string) => {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData,
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || 'Falha no login');
        }

        localStorage.setItem('id_visual_token', data.access_token);
        return data;
    },

    logout: () => {
        localStorage.removeItem('id_visual_token');
        window.location.reload();
    },

    get: async (endpoint: string) => {
        // Prevent double prefixing if endpoint already contains API_URL
        const cleanEndpoint = endpoint.startsWith(API_URL) 
            ? endpoint.slice(API_URL.length) 
            : endpoint;

        try {
            const response = await fetch(`${API_URL}${cleanEndpoint}`, {
                method: 'GET',
                headers: getHeaders(),
            });

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem('id_visual_token');
                    window.location.reload();
                }
                throw new Error(`API Error: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API Request Failed:', error);
            throw error;
        }
    },

    post: async (endpoint: string, payload: any) => {
        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(data.detail?.message || data.detail || `API Error: ${response.statusText}`);
                (error as any).status = response.status;
                throw error;
            }
            return data;
        } catch (error) {
            console.error('API POST Failed:', error);
            throw error;
        }
    },

    patch: async (endpoint: string, payload: any) => {
        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(data.detail?.message || data.detail || `API Error: ${response.statusText}`);
                (error as any).status = response.status;
                throw error;
            }
            return data;
        } catch (error) {
            console.error('API PATCH Failed:', error);
            throw error;
        }
    },

    delete: async (endpoint: string) => {
        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'DELETE',
                headers: getHeaders(),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(data.detail?.message || data.detail || `API Error: ${response.statusText}`);
                (error as any).status = response.status;
                throw error;
            }
            return data;
        } catch (error) {
            console.error('API DELETE Failed:', error);
            throw error;
        }
    },

    healthCheck: async () => {
        return api.get('/health');
    },

    getSyncStatus: async () => {
        return api.get('/sync/status');
    },

    getBatchMatrix: async (batchId: string) => {
        return api.get(`/batches/${batchId}/matrix`);
    },

    updateBatchTask: async (batchId: string, payload: any) => {
        return api.patch(`/batches/${batchId}/tasks`, payload);
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

    cancelBatch: async (batchId: string) => {
        const response = await fetch(`${API_URL}/batches/${batchId}/cancel`, {
            method: 'PATCH',
            headers: getHeaders(),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.detail?.message || data.detail || `API Error: ${response.statusText}`);
            (error as any).status = response.status;
            throw error;
        }
        return data;
    },

    createBatch: async (moIds: number[]) => {
        try {
            const response = await fetch(`${API_URL}/batches/`, {
                method: 'POST',
                headers: getHeaders(),
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
            headers: getHeaders(),
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
            headers: getHeaders(),
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
            headers: getHeaders(),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.detail?.message || data.detail || `API Error: ${response.statusText}`);
            (error as any).status = response.status;
            throw error;
        }
        return data;
    },

    bulkTransferManualRequests: async (requestIds: string[]) => {
        const response = await fetch(`${API_URL}/id-requests/manual/bulk-transfer`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(requestIds)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.detail?.message || data.detail || `API Error: ${response.statusText}`);
            (error as any).status = response.status;
            throw error;
        }
        return data;
    },

    getProductionRequests: async (limit: number = 50, offset: number = 0) => {
        return api.get(`/production/requests?limit=${limit}&offset=${offset}`);
    },

    getMODocuments: async (moId: number, limit: number = 50, offset: number = 0) => {
        return api.get(`/odoo/mos/${moId}/documents?limit=${limit}&offset=${offset}`);
    },

    // ── Auth ──
    getMe: async () => {
        return api.get('/auth/me');
    },

    // ── Andon ──
    getAndonWorkcenters: async () => {
        return api.get('/andon/workcenters');
    },

    getActiveWorkorder: async (wcId: number) => {
        return api.get(`/andon/workcenters/${wcId}/current_order`);
    },

    // --- Novos métodos Andon Estruturado ---
    getAndonCalls: async (activeOnly = true) => {
        return api.get(`/andon/calls?active_only=${activeOnly}`);
    },

    createAndonCall: async (data: {
        color: 'YELLOW' | 'RED';
        category: string;
        reason: string;
        description?: string;
        workcenter_id: number;
        workcenter_name: string;
        mo_id?: number;
        triggered_by: string;
        is_stop: boolean;
    }) => {
        return api.post('/andon/calls', data);
    },

    updateAndonCallStatus: async (callId: number, status: 'IN_PROGRESS' | 'RESOLVED', resolvedNote?: string) => {
        return api.patch(`/andon/calls/${callId}/status`, { status, resolved_note: resolvedNote });
    },

    // ── Andon Justification Cycle ──
    getPendingJustification: async (filters?: {
        workcenter_id?: number;
        color?: string;
        from_date?: string;
        to_date?: string;
    }) => {
        const params = new URLSearchParams();
        if (filters?.workcenter_id) params.append('workcenter_id', String(filters.workcenter_id));
        if (filters?.color) params.append('color', filters.color);
        if (filters?.from_date) params.append('from_date', filters.from_date);
        if (filters?.to_date) params.append('to_date', filters.to_date);
        const query = params.toString();
        return api.get(`/andon/calls/pending-justification${query ? `?${query}` : ''}`);
    },

    justifyCall: async (callId: number, payload: {
        root_cause_category: string;
        root_cause_detail: string;
        action_taken: string;
        justified_by: string;
    }) => {
        return api.patch(`/andon/calls/${callId}/justify`, payload);
    },

    getJustificationStats: async () => {
        return api.get('/andon/calls/justification-stats');
    },

    // --- Métodos Legados ---
    triggerAndon: async (color: 'amarelo' | 'vermelho' | 'basico', payload: any) => {
        return api.post(`/andon/trigger/${color}`, payload);
    },

    getAndonDowntime: async () => {
        return api.get('/andon/downtime');
    },

    getAndonTVData: async () => {
        return api.get('/andon/tv-data');
    },

    // ── Settings ──
    getSettings: async () => {
        return api.get('/settings');
    },

    patchSettings: async (updates: Record<string, string>) => {
        return api.patch('/settings', updates);
    },

    getOdooUsers: async () => {
        return api.get('/odoo/users');
    },

    resetDatabase: async () => {
        return api.post('/settings/reset-database', {});
    },

    // ── Custom Reports (IA) ──
    getCustomReports: async () => {
        return api.get('/reports/');
    },

    getCustomReport: async (id: string) => {
        return api.get(`/reports/${id}`);
    },

    deleteCustomReport: async (id: string) => {
        const response = await fetch(`${API_URL}/reports/${id}`, {
            method: 'DELETE',
            headers: getHeaders(),
        });
        return await response.json();
    },

    generateIAReport: async (prompt: string) => {
        return api.post('/reports/generate', { prompt });
    },

    // ── User Specific Odoo Environment ──
    getUserOdooConfig: async () => {
        return api.get('/user/odoo-config');
    },

    updateUserOdooConfig: async (payload: { is_odoo_test_mode?: boolean, odoo_test_url?: string }) => {
        return api.patch('/user/odoo-config', payload);
    },

    // ── IoT Devices ──
    getDevices: async () => {
        return api.get('/devices');
    },

    getDeviceLogs: async (deviceId: string, level?: string, limit = 100) => {
        const params = new URLSearchParams({ limit: String(limit) });
        if (level) params.append('level', level);
        return api.get(`/devices/${encodeURIComponent(deviceId)}/logs?${params}`);
    },

    updateDevice: async (deviceId: string, payload: {
        device_name?: string;
        location?: string;
        workcenter_id?: number | null;
        notes?: string;
    }) => {
        return api.patch(`/devices/${encodeURIComponent(deviceId)}`, payload);
    },

    syncDevice: async (deviceId: string) => {
        return api.post(`/devices/${encodeURIComponent(deviceId)}/sync`, {});
    },

    restartDevice: async (deviceId: string) => {
        return api.post(`/devices/${encodeURIComponent(deviceId)}/restart`, {});
    },

    deleteDevice: async (deviceId: string) => {
        return api.delete(`/devices/${encodeURIComponent(deviceId)}`);
    },

    getFirmwareVersions: async () => {
        return api.get('/devices/firmware/versions');
    },

    uploadFirmwareVersion: async (formData: FormData): Promise<unknown> => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error('Upload falhou'));
                }
            });
            xhr.addEventListener('error', () => reject(new Error('Upload falhou')));
            const token = localStorage.getItem('id_visual_token');
            xhr.open('POST', `${API_URL}/devices/firmware/versions`);
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.send(formData);
        });
    },

    triggerDeviceOTA: async (deviceId: string, payload: {
        firmware_version_id: number;
        triggered_by: string;
    }) => {
        return api.post(`/devices/${encodeURIComponent(deviceId)}/ota`, payload);
    },

    triggerOTABatch: async (payload: {
        firmware_version_id: number;
        triggered_by: string;
        device_ids?: string[];
    }) => {
        return api.post('/devices/ota/batch', payload);
    },

    // Legado — mantido para compatibilidade com IoTDeviceModal
    bindDevice: async (macAddress: string, workcenterId: number) => {
        return api.post(`/devices/${encodeURIComponent(macAddress)}/bind`, { workcenter_id: workcenterId });
    },

    unbindDevice: async (macAddress: string) => {
        return api.delete(`/devices/${encodeURIComponent(macAddress)}/bind`);
    },

    // ── OTA Management ──
    getFirmwareReleases: async () => {
        return api.get('/ota/firmware/releases');
    },

    checkGitHub: async () => {
        return api.post('/ota/firmware/check-github', {});
    },

    downloadFromGitHub: async (version?: string) => {
        return api.post('/ota/firmware/download-github', { version });
    },

    uploadFirmware: async (formData: FormData, onProgress?: (progress: number) => void): Promise<any> => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress(Math.round((e.loaded / e.total) * 100));
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error('Upload failed'));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Upload failed')));

            const token = localStorage.getItem('id_visual_token');
            xhr.open('POST', `${API_URL}/ota/firmware/upload`);
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
            xhr.send(formData);
        });
    },

    triggerOTAUpdate: async (firmwareReleaseId: string) => {
        return api.post('/ota/trigger', { firmware_release_id: firmwareReleaseId });
    },

    getOTAStatus: async () => {
        return api.get('/ota/status');
    },

    getOTAHistory: async (macAddress: string) => {
        return api.get(`/ota/history/${encodeURIComponent(macAddress)}`);
    },
};

