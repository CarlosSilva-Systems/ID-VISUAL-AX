/**
 * Cliente de API para o sistema de fila de impressão.
 * Endpoints: GET /print/printers, POST /print/jobs, GET /print/jobs/{id}/status
 */

const API_URL = (import.meta as any).env.VITE_API_URL || '/api/v1';

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('id_visual_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface PrinterInfo {
  id: number;
  name: string;
  location: string | null;
}

export interface CreatePrintJobRequest {
  printer_id: number;
  id_request_id: string;       // UUID
  label_type: 'technical' | 'external' | 'both';
  corrente_nominal?: string;
  frequencia?: string;
  cap_corte?: string;
  tensao?: string;
  curva_disparo?: string;
  tensao_impulso?: string;
  tensao_isolamento?: string;
  qr_url?: string;
}

export interface CreatePrintJobResponse {
  job_id: number;
  status: string;
  printer_name: string;
  created_at: string;
}

export interface JobStatusResponse {
  id: number;
  status: 'pending' | 'processing' | 'done' | 'failed';
  completed_at: string | null;
  failed_reason: string | null;
}

async function _handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.detail?.message ?? (data as any)?.detail ?? `Erro ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export async function fetchPrinters(): Promise<PrinterInfo[]> {
  const res = await fetch(`${API_URL}/print/printers`, { headers: getHeaders() });
  return _handleResponse<PrinterInfo[]>(res);
}

export async function createPrintJob(
  payload: CreatePrintJobRequest,
): Promise<CreatePrintJobResponse> {
  const res = await fetch(`${API_URL}/print/jobs`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return _handleResponse<CreatePrintJobResponse>(res);
}

export async function fetchJobStatus(jobId: number): Promise<JobStatusResponse> {
  const res = await fetch(`${API_URL}/print/jobs/${jobId}/status`, { headers: getHeaders() });
  return _handleResponse<JobStatusResponse>(res);
}

// ---------------------------------------------------------------------------
// EPLAN — dispositivos e bornes
// ---------------------------------------------------------------------------

export interface DeviceLabelItem {
  id: number;
  mo_id: string;  // UUID como string
  device_tag: string;
  description: string;
  location: string | null;
  order_index: number;
}

export interface TerminalLabelItem {
  id: number;
  mo_id: number;
  terminal_number: string;
  wire_number: string | null;
  group_name: string | null;
  order_index: number;
}

export interface EplanImportSummary {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface PrintDevicesResponse {
  jobs_created: number;
  job_ids: number[];
}

export interface PrintDoorResponse {
  job_id: number;
}

function getUploadHeaders(): Record<string, string> {
  const token = localStorage.getItem('id_visual_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchDeviceLabels(moId: string): Promise<DeviceLabelItem[]> {
  const res = await fetch(`${API_URL}/id-visual/eplan/${moId}/devices`, { headers: getHeaders() });
  return _handleResponse<DeviceLabelItem[]>(res);
}

export async function fetchTerminalLabels(moId: string): Promise<TerminalLabelItem[]> {
  const res = await fetch(`${API_URL}/id-visual/eplan/${moId}/terminals`, { headers: getHeaders() });
  return _handleResponse<TerminalLabelItem[]>(res);
}

export async function importDevicesExcel(moId: string, file: File): Promise<EplanImportSummary> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/id-visual/eplan/import/devices?mo_id=${moId}`, {
    method: 'POST',
    headers: getUploadHeaders(),
    body: form,
  });
  return _handleResponse<EplanImportSummary>(res);
}

export async function importTerminalsExcel(moId: string, file: File): Promise<EplanImportSummary> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/id-visual/eplan/import/terminals?mo_id=${moId}`, {
    method: 'POST',
    headers: getUploadHeaders(),
    body: form,
  });
  return _handleResponse<EplanImportSummary>(res);
}

export async function printDevices(
  moId: string,
  printerId: number,
  deviceIds?: number[],
): Promise<PrintDevicesResponse> {
  const res = await fetch(`${API_URL}/id-visual/print/devices`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ mo_id: moId, printer_id: printerId, device_ids: deviceIds ?? null }),
  });
  return _handleResponse<PrintDevicesResponse>(res);
}

export async function printDoorInline(
  moId: string,
  printerId: number,
  equipmentName: string,
  columns: string[],
): Promise<PrintDoorResponse> {
  const res = await fetch(`${API_URL}/id-visual/print/door/inline`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ mo_id: moId, printer_id: printerId, equipment_name: equipmentName, columns }),
  });
  return _handleResponse<PrintDoorResponse>(res);
}

export async function printTerminals(
  moId: string,
  printerId: number,
  terminalIds?: number[],
): Promise<PrintDevicesResponse> {
  const res = await fetch(`${API_URL}/id-visual/print/terminals`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ mo_id: moId, printer_id: printerId, terminal_ids: terminalIds ?? null }),
  });
  return _handleResponse<PrintDevicesResponse>(res);
}

// ---------------------------------------------------------------------------
// EPLAN — Criação manual, edição e reordenação de dispositivos
// ---------------------------------------------------------------------------

export interface CreateDevicePayload {
  device_tag: string;
  description?: string;
  location?: string;
}

export interface UpdateDevicePayload {
  device_tag?: string;
  description?: string;
  location?: string;
}

export async function createDeviceManual(
  moId: string,
  payload: CreateDevicePayload,
): Promise<DeviceLabelItem> {
  const res = await fetch(`${API_URL}/id-visual/eplan/${moId}/devices/manual`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return _handleResponse<DeviceLabelItem>(res);
}

export async function updateDevice(
  deviceId: number,
  payload: UpdateDevicePayload,
): Promise<DeviceLabelItem> {
  const res = await fetch(`${API_URL}/id-visual/eplan/devices/${deviceId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return _handleResponse<DeviceLabelItem>(res);
}

export async function reorderDevices(
  moId: string,
  deviceIds: number[],
): Promise<{ reordered: number }> {
  const res = await fetch(`${API_URL}/id-visual/eplan/${moId}/devices/reorder`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ device_ids: deviceIds }),
  });
  return _handleResponse<{ reordered: number }>(res);
}

export async function deleteDevice(deviceId: number): Promise<{ deleted: number }> {
  const res = await fetch(`${API_URL}/id-visual/eplan/devices/${deviceId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  return _handleResponse<{ deleted: number }>(res);
}
