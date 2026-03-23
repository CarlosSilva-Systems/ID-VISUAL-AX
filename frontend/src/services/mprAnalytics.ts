import { api } from './api';

export interface KPIResumo {
    tempo_medio_concepcao_min: number | null;
    tempo_medio_ciclo_completo_min: number | null;
    tempo_medio_parada_of_min: number | null;
    taxa_entrega_no_prazo_pct: number | null;
    taxa_aprovacao_primeira_entrega_pct: number | null;
    taxa_retrabalho_pct: number | null;
    total_ids_solicitadas: number;
    total_ids_entregues: number;
    ofs_impactadas: number;
}

export interface FilaAtivaItem {
    id: string;
    mo_number: string;
    status: string;
    prioridade: string;
    solicitado_em: string | null;
    aging_horas: number;
    responsavel_atual: string | null;
}

export interface VolumePorPeriodoItem {
    label: string;
    solicitadas: number;
    entregues: number;
    no_prazo: int;
}

export interface EvolucaoTempoCicloItem {
    label: string;
    tempo_medio_ciclo_min: number | null;
    tempo_medio_concepcao_min: number | null;
}

export interface RankingResponsaveisItem {
    responsavel_id: number;
    nome: string;
    ids_concluidas: number;
    tempo_medio_concepcao_min: number | null;
    taxa_aprovacao_primeira_pct: number | null;
    ids_em_andamento: number;
}

export interface MotivoRevisaoItem {
    motivo: string;
    quantidade: number;
    percentual: number;
}

export interface ImpactoFabricacaoItem {
    label: string;
    horas_paradas_total: number;
    ofs_afetadas: number;
    tempo_medio_parada_min: number | null;
}

export interface MetadadosResponse {
    motivos_revisao: string[];
    status_options: string[];
    responsaveis: string[];
}

export interface MPRConfigResponse {
    sla_atencao_horas: number;
    sla_critico_horas: number;
}

const buildQuery = (start: string, end: string) => `?periodo_inicio=${encodeURIComponent(start)}&periodo_fim=${encodeURIComponent(end)}`;

export const mprAnalyticsApi = {
    getKPIsResumo: (start: string, end: string): Promise<KPIResumo> =>
        api.get(`/mpr/analytics/kpis/resumo${buildQuery(start, end)}`),

    getFilaAtiva: (): Promise<FilaAtivaItem[]> =>
        api.get('/mpr/analytics/fila-ativa'),

    getVolumePorPeriodo: (start: string, end: string): Promise<VolumePorPeriodoItem[]> =>
        api.get(`/mpr/analytics/volume-por-periodo${buildQuery(start, end)}`),

    getEvolucaoTempoCiclo: (start: string, end: string): Promise<EvolucaoTempoCicloItem[]> =>
        api.get(`/mpr/analytics/evolucao-tempo-ciclo${buildQuery(start, end)}`),

    getRankingResponsaveis: (start: string, end: string): Promise<RankingResponsaveisItem[]> =>
        api.get(`/mpr/analytics/ranking-responsaveis${buildQuery(start, end)}`),

    getMotivosRevisao: (start: string, end: string): Promise<MotivoRevisaoItem[]> =>
        api.get(`/mpr/analytics/motivos-revisao${buildQuery(start, end)}`),

    getImpactoFabricacao: (start: string, end: string): Promise<ImpactoFabricacaoItem[]> =>
        api.get(`/mpr/analytics/impacto-fabricacao${buildQuery(start, end)}`),

    getMetadados: (): Promise<MetadadosResponse> =>
        api.get('/mpr/analytics/metadados'),

    getConfig: (): Promise<MPRConfigResponse> =>
        api.get('/mpr/analytics/config'),

    updateConfig: (updates: { sla_atencao_horas?: number; sla_critico_horas?: number }): Promise<MPRConfigResponse> =>
        api.patch('/mpr/analytics/config', updates),
};
