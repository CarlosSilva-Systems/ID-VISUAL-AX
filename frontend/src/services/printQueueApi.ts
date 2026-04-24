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
