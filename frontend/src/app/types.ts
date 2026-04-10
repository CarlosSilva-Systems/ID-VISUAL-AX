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

export type StatusID = "Nova" | "Triagem" | "Em Lote" | "Bloqueada" | "Concluída" | "Sem Solicitação";
export type Priority = "Normal" | "Alta" | "Urgente";

export type PackageType = "COMANDO" | "DISTRIBUIÇÃO" | "APTO" | "PERSONALIZADO";

export type MRPState = "Confirmado" | "Em Produção" | "Pronto" | "Concluído" | "Cancelado";

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
  "COMANDO": ["Diagrama+Legenda", "210-804", "210-805", "EFZ Tag Cabo", "2009-110", "210-855", "QA Final"],
  "DISTRIBUIÇÃO": ["Diagrama+Legenda", "210-804", "210-805", "EFZ Tag Cabo", "QA Final"],
  "APTO": ["Diagrama+Legenda", "EFZ Tag Cabo", "210-805", "QA Final"],
  "PERSONALIZADO": ["Diagrama+Legenda", "QA Final"]
};

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
