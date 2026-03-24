import json
from pydantic import BaseModel, Field

# --- OpenAI Function Schemas ---

# 1. get_kpi_summary
class GetKpiSummaryArgs(BaseModel):
    period_start: str = Field(..., description="Data inicial no formato YYYY-MM-DD")
    period_end: str = Field(..., description="Data final no formato YYYY-MM-DD")

get_kpi_summary_tool = {
    "type": "function",
    "function": {
        "name": "get_kpi_summary",
        "description": "Retorna o resumo global dos KPIs operacionais (Tempo Médio de Ciclo, Volumetria, Taxa de Retrabalho, Entregas no Prazo) do sistema ID Visual em um determinado período.",
        "parameters": GetKpiSummaryArgs.schema()
    }
}

# 2. get_id_details
class GetIdDetailsArgs(BaseModel):
    id_request_id: str = Field(..., description="ID uuid ou número de identificação da ID Visual.")

get_id_details_tool = {
    "type": "function",
    "function": {
        "name": "get_id_details",
        "description": "Busca dados detalhados de rastreabilidade de uma ID específica, como operador, datas (iniciado, concluído), pacote e checklist interno.",
        "parameters": GetIdDetailsArgs.schema()
    }
}

# 3. get_andon_history
class GetAndonHistoryArgs(BaseModel):
    workcenter_id: str = Field(None, description="Identificador opcional do Centro de Trabalho (Workcenter) para filtrar.")
    motivo: str = Field(None, description="Motivo opcional da parada para filtrar.")

get_andon_history_tool = {
    "type": "function",
    "function": {
        "name": "get_andon_history",
        "description": "Traz o histórico recente de paradas/chamados (Andon Vermelho ou Amarelo) no chão de fábrica, revelando gargalos e logs de erros de engenharia ou falta de material.",
        "parameters": GetAndonHistoryArgs.schema()
    }
}

# 4. get_retrabalho_analysis
class GetRetrabalhoAnalysisArgs(BaseModel):
    dummy: str = Field("none", description="Nenhum parametro exigido.")

get_retrabalho_analysis_tool = {
    "type": "function",
    "function": {
        "name": "get_retrabalho_analysis",
        "description": "Verifica todas as estatísticas recentes de Motivos de Revisão, apontando as falhas da qualidade sistêmica (ex: diagrama errado ou lista de peças falha).",
        "parameters": GetRetrabalhoAnalysisArgs.schema()
    }
}

# 5. get_obra_status
class GetObraStatusArgs(BaseModel):
    obra_id: str = Field(..., description="Identificador ou nome do projeto/obra para buscar Odoo O.F.s")

get_obra_status_tool = {
    "type": "function",
    "function": {
        "name": "get_obra_status",
        "description": "Recupera o status atrelado a uma Obra/Projeto de engenharia via middleware Odoo, listando a condição sistêmica de fabricação.",
        "parameters": GetObraStatusArgs.schema()
    }
}

# 6. get_business_rules
class GetBusinessRulesArgs(BaseModel):
    termo: str = Field(..., description="Termo de pesquisa sobre a regra (ex: SLA, Andon, 5S, etc).")

get_business_rules_tool = {
    "type": "function",
    "function": {
        "name": "get_business_rules",
        "description": "Ferramenta de busca para regras de negócios e boas práticas documentadas do ID Visual (ex: quando acionar Andon amarelo etc).",
        "parameters": GetBusinessRulesArgs.schema()
    }
}

# --- Export Aggregate ---
TOOLS_LIST = [
    get_kpi_summary_tool,
    get_id_details_tool,
    get_andon_history_tool,
    get_retrabalho_analysis_tool,
    get_obra_status_tool,
    get_business_rules_tool
]

# --- Rule Engine (Business Rules & Definitions) ---
def resolve_business_rule(termo: str) -> str:
    term_lower = termo.lower()
    if "sla" in term_lower:
        return "SLA ID Visual: Atenção em 8h, Crítico em 24h. Afeta o KPI 'Entregas no Prazo'."
    elif "andon" in term_lower:
        return "Andon: Vermelho (Para OF, gera ticket), Amarelo (Requisição de material, não para OF)."
    elif "retrabalho" in term_lower or "revisao" in term_lower:
        return "Retrabalho: Ocorre quando uma ID Visual é reprovada no QA ou pela produção. Gera métrica de 'Taxa de Retrabalho'."
    return f"Termo '{termo}' não encontrado na base de regras padrão."
