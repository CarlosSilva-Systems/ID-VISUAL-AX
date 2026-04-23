/**
 * Tipos TypeScript para impressão de etiquetas Zebra.
 * Espelha os schemas do backend: app/schemas/print_label.py
 */

export type LabelType = 'technical' | 'external' | 'both';

export interface PrintLabelRequest {
  /** UUID da IDRequest */
  id_request_id: string;
  /** Tipo de etiqueta a imprimir */
  label_type: LabelType;

  // Dados técnicos — preenchidos manualmente pelo operador
  corrente_nominal?: string;
  frequencia?: string;
  cap_corte?: string;
  tensao?: string;
  curva_disparo?: string;
  tensao_impulso?: string;
  tensao_isolamento?: string;

  /** URL para o QR code (link para documentos no Odoo) */
  qr_url?: string;
}

export interface PrintLabelResponse {
  status: string;
  label_type: LabelType;
  mo_name: string;
  printed_at: string; // ISO 8601
}
