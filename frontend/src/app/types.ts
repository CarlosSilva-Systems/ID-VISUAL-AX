import { LucideIcon, FileText, Tag, Layers, ClipboardCheck, Box, Settings, ShieldCheck } from "lucide-react";

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
