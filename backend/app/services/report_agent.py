import json
from typing import List, Literal, Optional, Dict, Any
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from app.core.config import settings

# --- Structured Output Schemas ---

class ChartConfig(BaseModel):
    type: Literal["bar", "line", "pie", "kpi_card"] = Field(..., description="Tipo de representacao grafica.")
    title: str = Field(..., description="Titulo do grafico ou cartao.")
    data_source_url: str = Field(
        ..., 
        description="A URL relativa do endpoint de dados. Exemplos validos: '/api/v1/mpr/analytics/kpis', '/api/v1/andon/history', '/api/v1/pmp/analytics/cycle-time'"
    )
    grid_span: int = Field(default=1, description="Largura do elemento no grid (1 a 4).")
    params: Optional[Dict[str, Any]] = Field(default=None, description="Parametros de query para a API (ex: filter_days=7)")

class DashboardLayout(BaseModel):
    title: str = Field(..., description="Nome curto e impactante para o Relatorio.")
    description: str = Field(..., description="Breve resumo do que este dashboard analisa.")
    charts: List[ChartConfig] = Field(..., min_items=1, max_items=8, description="Lista de componentes visuais do dashboard.")

# --- System Prompt ---

SYSTEM_PROMPT = """Você é o Gerador de Dashboards do ID Visual.
Sua única função é processar a intenção do usuário e transformar em um JSON de layout de BI.

ENDPOINT DE DADOS DISPONÍVEIS:
1. '/api/v1/mpr/analytics/kpis' - KPIs globais (SLA, Tempo Ciclo).
2. '/api/v1/andon/history' - Paradas de linha e gargalos.
3. '/api/v1/id-requests/stats' - Volumetria de IDs e rastreabilidade.
4. '/api/v1/production/workcenters' - Status dos centros de trabalho.

REGRAS:
- Seja analítico: se o usuário quer saber sobre atrasos, use Andon e MPR KPIs.
- Grid Span: Use 4 para dashboards largos, 2 para meio a meio, 1 para cartões pequenos.
- Não converse. Saída deve ser EXCLUSIVAMENTE o JSON estruturado seguindo o esquema fornecido."""

# --- Agent Engine ---

async def generate_report_layout(user_prompt: str) -> DashboardLayout:
    """
    Chama o gpt-4o-mini via OpenRouter forçando a saída estruturada do Layout.
    """
    client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.OPENROUTER_API_KEY,
    )

    response = await client.beta.chat.completions.parse(
        model="openai/gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format=DashboardLayout,
    )

    return response.choices[0].message.parsed
