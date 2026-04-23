export enum TaskStatusEnum {
    nao_iniciado = "nao_iniciado",
    montado = "montado",
    impresso = "impresso",
    bloqueado = "bloqueado",
    nao_aplicavel = "nao_aplicavel",
}

export interface MatrixColumn {
    task_code: string;
    label: string;
    order: number;
}

export interface MatrixCell {
    status: TaskStatusEnum;
    version: number;
    updated_at?: string; // ISO 8601 UTC
    blocked_reason?: string;
    update_note?: string;
}

export interface MatrixRow {
    request_id: string; // UUID
    odoo_mo_id?: number; // Odoo MO ID for document fetching
    mo_number: string;
    product_name?: string; // Nome do produto (sem código AX)
    ax_code?: string;      // Código AX do produto
    fab_code?: string;     // Código FAB derivado de mo_number
    obra_nome?: string;
    package_code?: string;
    sla_text?: string;
    quantity: number;
    date_start?: string; // ISO 8601 UTC
    cells: Record<string, MatrixCell>;
}

export interface BatchStats {
    docs_pending: number;
    docs_printing: number;
    docs_printed: number;
    docs_blocked: number;
    progress_pct: number;
    count_today: number;
    count_week: number;
    total_blocked: number;
    total_rows: number;
}

export interface BatchMatrixResponse {
    batch_id: string; // UUID
    batch_name: string;
    batch_status: string;
    stats: BatchStats;
    columns: MatrixColumn[];
    rows: MatrixRow[];
}

export interface TaskUpdatePayload {
    request_id: string; // UUID
    task_code: string;
    new_status: TaskStatusEnum;
    version: number;
    update_note?: string;
    blocked_reason?: string;
}

export interface TaskUpdateResponse {
    updated_cell: MatrixCell;
    updated_stats: BatchStats;
}
