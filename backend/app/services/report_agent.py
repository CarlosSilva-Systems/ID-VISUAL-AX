import json
import uuid
from typing import List, Literal, Optional, Dict, Any
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from app.core.config import settings

# --- Structured Output Schemas ---

class WidgetConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8], description="ID unico para o componente.")
    type: Literal["bar", "line", "pie", "kpi"] = Field(..., description="Tipo de representacao grafica.")
    title: str = Field(..., description="Titulo do grafico ou cartao.")
    data_source_endpoint: str = Field(
        ..., 
        description="O endpoint relativo de dados. Exemplos: '/mpr/analytics/kpis/resumo', '/andon/history', '/id-requests/stats'"
    )
    grid_size: Literal["half", "full"] = Field(default="half", description="Largura do elemento no grid.")
    params: Optional[Dict[str, Any]] = Field(default=None, description="Parametros de query para a API.")

class ProactiveInsight(BaseModel):
    type: Literal["warning", "opportunity", "odoo_tip"] = Field(..., description="Categoria do insight.")
    title: str = Field(..., description="Titulo curto do insight (Ex: Gargalo de Setup).")
    description: str = Field(..., description="Explicacao tecnica baseada nos dados.")
    actionable_suggestion: str = Field(..., description="Sugestao pratica para o Odoo ou chão de fábrica.")

class DashboardLayout(BaseModel):
    title: str = Field(..., description="Nome estrategico do Relatorio.")
    description: str = Field(..., description="Breve resumo do insight de negocio.")
    widgets: List[WidgetConfig] = Field(..., min_items=1, max_items=8, description="Lista de componentes visuais do dashboard.")
    proactive_insights: List[ProactiveInsight] = Field(default_factory=list, description="Sugestoes e alertas proativos da consultoria Lean.")

# --- System Prompt ---

SYSTEM_PROMPT = """Você é o Consultor Sênior de Manufatura Lean e Especialista em ERP Odoo do ID Visual.
Sua missão é transformar dados frios em inteligência competitiva.

PERSONA E COMPORTAMENTO:
1. Analise as entrelinhas: Se o Lead Time está alto, não diga apenas isso. Sugira que pode ser falta de 5S no posto X ou falta de validação de engenharia no Odoo.
2. Seja Proativo: Preencha sempre a seção 'proactive_insights'. Cruze mentalmente os KPIs (ex: correlation entre paradas Andon e atraso no PMP).
3. Sugestões Acionáveis: Suas dicas de 'odoo_tip' devem ser específicas (ex: "Use o módulo de Planejamento de Carga" ou "Crie uma trava de anexo de PDF").

ENDPOINTS DISPONÍVEIS:
1. '/mpr/analytics/kpis/resumo' - Mural de KPIs (SLA, OEE, Lead Time).
2. '/mpr/analytics/evolucao-tempo-ciclo' - Histórico diário de tempos.
3. '/andon/history' - Ranking de motivos de parada.
4. '/id-requests/stats' - WIP e Funil de entrada.
5. '/andon/workcenters' - Ocupação e status dos postos.

ESTRUTURA JSON OBRIGATÓRIA (STRICT):
{
  "title": "str",
  "description": "str",
  "widgets": [/* Widgets padrão */],
  "proactive_insights": [
    {
      "type": "warning" | "opportunity" | "odoo_tip",
      "title": "Ex: Gargalo na Engenharia",
      "description": "Texto explicando a anomalia detectada...",
      "actionable_suggestion": "Ação prática no sistema ou processo..."
    }
  ]
}

Idioma: Português-Brasil (PT-BR)."""

# --- Agent Engine ---

async def generate_report_layout(user_prompt: str, current_layout: Optional[Dict[str, Any]] = None) -> DashboardLayout:
    """
    Gera ou refina um layout de dashboard.
    Se current_layout for fornecido, a IA atuará em modo de REFINAMENTO.
    """
    client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.OPENROUTER_API_KEY,
        timeout=60.0,
        default_headers={"X-Title": "ID Visual", "HTTP-Referer": "http://localhost:5173"}
    )

    if current_layout:
        prompt = f"LAYOUT ATUAL: {json.dumps(current_layout)}\n\nINSTRUÇÃO DE REFINAMENTO: {user_prompt}\n\nAplique a mudança e retorne o JSON completo atualizado."
    else:
        prompt = f"O usuário quer um novo dashboard para: {user_prompt}"

    response = await client.chat.completions.create(
        model="openai/gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )

    content = response.choices[0].message.content
    try:
        data = json.loads(content)
        # 1. Normalização de Raiz (Envoltórios)
        if "dashboard" in data: data = data["dashboard"]
        if "layout" in data: data = data["layout"]
        
        # 2. Normalização de widgets/charts
        if "charts" in data and "widgets" not in data: data["widgets"] = data["charts"]
        
        if "widgets" in data and isinstance(data["widgets"], list):
            for w in data["widgets"]:
                # Normalização de Tipos (IA as vezes usa sufixos)
                t = w.get("type", "")
                if t in ["line_chart", "area"]: w["type"] = "line"
                if t in ["bar_chart", "histogram"]: w["type"] = "bar"
                if t in ["pie_chart", "donut"]: w["type"] = "pie"
                if t in ["kpi_card", "stat", "metric"]: w["type"] = "kpi"
                if t == "table": w["type"] = "bar" # Fallback seguro
                
                # Normalização de Grid Size
                if "grid_span" in w:
                    w["grid_size"] = "full" if int(w["grid_span"]) > 2 else "half"
                if "size" in w and w["size"] in ["full", "half"]:
                    w["grid_size"] = w["size"]
                elif "grid_size" not in w:
                    w["grid_size"] = "half"

                # Normalização de Endpoint (Onde a IA mais erra)
                if "data_source_url" in w: w["data_source_endpoint"] = w["data_source_url"]
                # Normalização de Endpoint (Onde a IA mais inova)
                target_fields = ["data_source_url", "url", "endpoint", "api_url", "data", "source", "path", "target", "link"]
                for f in target_fields:
                    if f in w and not w.get("data_source_endpoint"):
                        w["data_source_endpoint"] = w[f]
                
                # Resiliência de string: remove /api/v1 prefixos redundantes
                ep = w.get("data_source_endpoint", "")
                if isinstance(ep, str):
                    if ep.startswith("/api/v1"):
                        w["data_source_endpoint"] = ep.replace("/api/v1", "", 1)
                    if not ep.startswith("/"):
                        w["data_source_endpoint"] = "/" + ep
        
        # 3. Normalização de Insights
        if "insights" in data and "proactive_insights" not in data:
            data["proactive_insights"] = data["insights"]

        return DashboardLayout(**data)
    except Exception as e:
        import traceback
        print(f"DEBUG IA CONTENT: {content}")
        traceback.print_exc()
        raise ValueError(f"Falha na geração estruturada: {str(e)}")

