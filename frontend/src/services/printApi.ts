/**
 * Cliente de API para impressão de etiquetas Zebra.
 * Centraliza a chamada ao endpoint POST /id-visual/print/labels.
 */

import { PrintLabelRequest, PrintLabelResponse } from '../types/print';

const API_URL = (import.meta as any).env.VITE_API_URL || '/api/v1';

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('id_visual_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Envia uma solicitação de impressão de etiqueta para a impressora Zebra.
 *
 * @param payload - Dados da etiqueta a imprimir (tipo + dados técnicos opcionais)
 * @returns PrintLabelResponse com status, mo_name e printed_at
 * @throws Error com mensagem legível em caso de falha (4xx/5xx)
 */
export async function printLabels(
  payload: PrintLabelRequest,
): Promise<PrintLabelResponse> {
  const response = await fetch(`${API_URL}/id-visual/print/labels`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (data as any)?.detail?.message ??
      (data as any)?.detail ??
      `Erro ${response.status}: ${response.statusText}`;
    throw new Error(message);
  }

  return data as PrintLabelResponse;
}
