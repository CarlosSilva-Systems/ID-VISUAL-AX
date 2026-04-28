/**
 * Cliente de API para presets de etiquetas de porta (210-855).
 * Endpoints: GET /door-presets, POST /door-presets, etc.
 */

const API_URL = (import.meta as any).env.VITE_API_URL || '/api/v1';

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('id_visual_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface DoorLabelPreset {
  id: number;
  name: string;
  category: 'sinaleira' | 'botoeira-3pos' | 'botoeira-2pos' | 'custom';
  equipment_name: string;
  columns: string[];
  rows: number;
  is_system: boolean;
  is_shared: boolean;
  created_by: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
}

export interface CreatePresetPayload {
  name: string;
  category: string;
  equipment_name: string;
  columns: string[];
  rows: number;
  is_shared: boolean;
}

export interface UpdatePresetPayload {
  name?: string;
  category?: string;
  equipment_name?: string;
  columns?: string[];
  rows?: number;
  is_shared?: boolean;
}

export type PresetFilterType = 'all' | 'system' | 'mine' | 'team' | 'favorites';

async function _handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.detail?.message ?? (data as any)?.detail ?? `Erro ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export async function fetchPresets(
  filterType: PresetFilterType = 'all',
  category?: string,
  search?: string,
): Promise<DoorLabelPreset[]> {
  const params = new URLSearchParams();
  params.append('filter_type', filterType);
  if (category) params.append('category', category);
  if (search) params.append('search', search);

  const res = await fetch(`${API_URL}/id-visual/door-presets?${params}`, {
    headers: getHeaders(),
  });
  return _handleResponse<DoorLabelPreset[]>(res);
}

export async function createPreset(payload: CreatePresetPayload): Promise<DoorLabelPreset> {
  const res = await fetch(`${API_URL}/id-visual/door-presets`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return _handleResponse<DoorLabelPreset>(res);
}

export async function updatePreset(
  presetId: number,
  payload: UpdatePresetPayload,
): Promise<DoorLabelPreset> {
  const res = await fetch(`${API_URL}/id-visual/door-presets/${presetId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return _handleResponse<DoorLabelPreset>(res);
}

export async function deletePreset(presetId: number): Promise<{ deleted: number }> {
  const res = await fetch(`${API_URL}/id-visual/door-presets/${presetId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  return _handleResponse<{ deleted: number }>(res);
}

export async function toggleFavorite(presetId: number): Promise<{ is_favorite: boolean }> {
  const res = await fetch(`${API_URL}/id-visual/door-presets/${presetId}/favorite`, {
    method: 'POST',
    headers: getHeaders(),
  });
  return _handleResponse<{ is_favorite: boolean }>(res);
}

export async function incrementUsage(presetId: number): Promise<{ usage_count: number }> {
  const res = await fetch(`${API_URL}/id-visual/door-presets/${presetId}/use`, {
    method: 'POST',
    headers: getHeaders(),
  });
  return _handleResponse<{ usage_count: number }>(res);
}
