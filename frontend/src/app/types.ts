import { LucideIcon, FileText, Tag, Layers, ClipboardCheck, Box, Settings, ShieldCheck } from "lucide-react";

export interface User {
  username: string;
  user: string; // Alias para compatibilidade com respostas da API
  role: "operator" | "responsible" | "admin";
  is_admin: boolean;
  department: string | null;
  is_odoo_test_mode: boolean;
  odoo_test_url: string | null;
}

// Status interno da IDRequest no sistema ID Visual
export type StatusID =
  | "Nova"
  | "Triagem"
  | "Em Lote"
  | "Em Progresso"
  | "Bloqueada"
  | "Concluída"
  | "Entregue"
  | "Cancelada"
  | "Sem Solicitação";

export type Priority = "Normal" | "Alta" | "Urgente";

export type PackageType = "COMANDO" | "DISTRIBUIÇÃO" | "APTO" | "PERSONALIZADO";

// Estado da Ordem de Manufatura no Odoo (mrp.production.state)
export type MRPState =
  | "Rascunho"
  | "Confirmado"
  | "Em Produção"
  | "A Encerrar"
  | "Concluído"
  | "Cancelado"
  | "Desconhecido";

// Mapeamento canônico: estado bruto do Odoo → label exibido no frontend
export const ODOO_STATE_TO_MRP: Record<string, MRPState> = {
  draft:     "Rascunho",
  confirmed: "Confirmado",
  progress:  "Em Produção",
  to_close:  "A Encerrar",
  done:      "Concluído",
  cancel:    "Cancelado",
};

// Mapeamento canônico: status bruto do backend (snake_case) → StatusID do frontend
export const BACKEND_STATUS_TO_ID: Record<string, StatusID> = {
  nova:         "Nova",
  triagem:      "Triagem",
  em_lote:      "Em Lote",
  em_progresso: "Em Progresso",
  bloqueada:    "Bloqueada",
  concluida:    "Concluída",
  entregue:     "Entregue",
  cancelada:    "Cancelada",
};

export interface HistoryLog {
  id: string;
  date: string;
  user: string;
  action: string;
  details?: string;
}

export interface Caixinha {
  id: string;
  label: string;
  status: "Neutro" | "Em Andamento" | "Concluído" | "Bloqueado";
  type: "Epson" | "SmartScript" | "Elesys" | "QA";
  blockedReason?: string;
  lastUpdate?: string;
  version?: number;
  taskCode?: string;
}

export interface Fabrication {
  id: string;
  mo_number: string;
  product_name?: string; // Nome do produto (sem código AX)
  ax_code?: string;      // Código AX do produto (product_id.default_code)
  fab_code?: string;     // Código FAB derivado de mo_number (ex: FAB01015)
  obra: string;
  product_qty: number;
  date_start: string;
  sla: string;
  priority: Priority;
  status: StatusID;
  mrp_state: MRPState;
  packageType?: PackageType;
  tasks: Caixinha[];
  docs: {
    diagrama: boolean;
    legenda: boolean;
  };
  history?: HistoryLog[];
  // Manual Request Fields
  requester_name?: string;
  notes?: string;
  request_id?: string;
  from_production?: boolean;
  production_requester?: string;
  odoo_mo_id?: string; // Odoo MO ID for document lookups
  deadline_date?: string;
  source?: 'odoo' | 'producao';
}

export const PACKAGES_CONFIG: Record<PackageType, string[]> = {
  "COMANDO":     ["DOCS_Epson", "WAGO_210_804", "WAGO_210_805", "ELESYS_EFZ", "WAGO_2009_110", "WAGO_210_855", "QA_FINAL"],
  "DISTRIBUIÇÃO":["DOCS_Epson", "WAGO_210_804", "WAGO_210_805", "ELESYS_EFZ", "QA_FINAL"],
  "APTO":        ["DOCS_Epson", "ELESYS_EFZ", "WAGO_210_805", "QA_FINAL"],
  "PERSONALIZADO":["DOCS_Epson", "QA_FINAL"],
};

// Mapeamento canônico: task_code → label exibido no frontend.
// Fonte da verdade alinhada com TASK_LABELS do backend (production.py).
export const TASK_CODE_TO_LABEL: Record<string, string> = {
  DOCS_Epson:    "Diagrama e Layout",
  WAGO_210_804:  "Carac. Técnica (210-804)",
  WAGO_210_805:  "Adesivo Componente (210-805)",
  ELESYS_EFZ:    "Tag Cabo EFZ",
  WAGO_2009_110: "Régua Borne (2009-110)",
  WAGO_210_855:  "Adesivo Porta (210-855)",
  QA_FINAL:      "QA Final",
};

// Tipo de caixinha derivado do task_code
export function taskCodeToType(code: string): Caixinha["type"] {
  if (code === "DOCS_Epson") return "Epson";
  if (code === "QA_FINAL") return "QA";
  return "SmartScript";
}

export const MOCK_FABRICATIONS: Fabrication[] = [
  {
    id: "1",
    mo_number: "MO/10234",
    obra: "Condomínio Solar das Flores",
    product_qty: 12,
    date_start: "2026-02-10",
    sla: "Vence em 6h",
    priority: "Alta",
    status: "Nova",
    mrp_state: "Em Produção",
    tasks: [],
    docs: { diagrama: true, legenda: true },
    history: [
      { id: "h1", date: "2026-02-10 08:00", user: "Odoo Sync", action: "Criada via MRP" }
    ]
  },
  {
    id: "2",
    mo_number: "MO/10235",
    obra: "Edifício Horizon Tech",
    product_qty: 5,
    date_start: "2026-02-11",
    sla: "Vence em 2d",
    priority: "Normal",
    status: "Triagem",
    mrp_state: "Confirmado",
    tasks: [],
    docs: { diagrama: true, legenda: false },
  },
  {
    id: "3",
    mo_number: "MO/10236",
    obra: "Residencial Parque Verde",
    product_qty: 20,
    date_start: "2026-02-08",
    sla: "Atrasado +2d",
    priority: "Urgente",
    status: "Bloqueada",
    mrp_state: "Pronto",
    tasks: [],
    docs: { diagrama: false, legenda: false },
  },
  {
    id: "4",
    mo_number: "MO/10237",
    obra: "Shopping Center Norte",
    product_qty: 8,
    date_start: "2026-02-12",
    sla: "Vence em 3d",
    priority: "Normal",
    status: "Sem Solicitação",
    mrp_state: "Confirmado",
    tasks: [],
    docs: { diagrama: true, legenda: true },
  }
];

// ── Andon Justification Cycle ──

export type RootCauseCategory =
  | 'Máquina'
  | 'Material'
  | 'Mão de obra'
  | 'Método'
  | 'Meio ambiente';

export const ROOT_CAUSE_CATEGORIES: RootCauseCategory[] = [
  'Máquina',
  'Material',
  'Mão de obra',
  'Método',
  'Meio ambiente',
];

export interface AndonCall {
  id: number;
  color: 'YELLOW' | 'RED';
  category: string;
  reason: string;
  description?: string;
  workcenter_id: number;
  workcenter_name: string;
  owner_name?: string;
  work_type?: string;
  production_name?: string;
  mo_id?: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  created_at: string;
  updated_at: string;
  triggered_by: string;
  assigned_team?: string;
  resolved_note?: string;
  is_stop: boolean;
  odoo_picking_id?: number;
  odoo_activity_id?: number;
  // Campos de justificativa (Fase 1)
  downtime_minutes?: number;
  requires_justification: boolean;
  justified_at?: string;
  justified_by?: string;
  root_cause_category?: RootCauseCategory;
  root_cause_detail?: string;
  action_taken?: string;
}

export interface JustificationStats {
  total_pending: number;
  by_color: {
    RED: number;
    YELLOW: number;
  };
  oldest_pending_minutes: number | null;
}

export interface JustifyPayload {
  root_cause_category: RootCauseCategory;
  root_cause_detail: string;
  action_taken: string;
  justified_by: string;
}

export interface PendingJustificationFilters {
  workcenter_id?: number;
  color?: 'RED' | 'YELLOW';
  from_date?: string;
  to_date?: string;
}

// ── ESP32 Device Management (Fase 2) ──

export interface ESPDeviceEnriched {
  id: string;
  mac_address: string;
  device_name: string;
  location: string;
  workcenter_id: number | null;
  workcenter_name: string | null;
  status: 'online' | 'offline';
  firmware_version: string | null;
  latest_firmware: string | null;
  firmware_outdated: boolean;
  rssi: number | null;
  rssi_quality: 'Ótimo' | 'Bom' | 'Fraco' | 'Crítico' | null;
  is_root: boolean;
  mesh_node_count: number | null;
  ip_address: string | null;
  uptime_seconds: number | null;
  last_seen_at: string | null;
  offline_minutes: number | null;
  notes: string | null;
  connection_type: 'wifi' | 'mesh' | null;
  created_at: string;
}

export interface DeviceLog {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  created_at: string;
}

export interface FirmwareVersion {
  id: number;
  version: string;
  release_notes: string | null;
  file_path: string;
  file_size_bytes: number;
  is_stable: boolean;
  created_at: string;
  created_by: string;
}

// ── Notificações em tempo real ──

export interface AppNotification {
  id: string;
  type: 'andon_call' | 'justification_required' | 'device_offline' | 'batch_complete';
  title: string;
  description: string;
  href: string;
  isRead: boolean;
  createdAt: string;
}
