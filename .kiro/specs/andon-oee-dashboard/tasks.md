# Plano de Implementação: Dashboard OEE / Eficiência Andon

## Visão Geral

Implementação do módulo analítico de OEE/Eficiência Andon, cobrindo backend (modelo, serviço, schemas, endpoints) e frontend (métodos de API, componentes, rotas). A lógica de cálculo é encapsulada em `oee_service.py` para facilitar testes isolados.

## Tasks

- [ ] 1. Criar modelo `AndonSettings` e migração Alembic
  - [ ] 1.1 Criar `backend/app/models/andon_settings.py` com o modelo SQLModel singleton
    - Definir campos: `id` (PK=1), `working_day_start` (default `"08:00"`), `working_day_end` (default `"17:00"`), `working_days` (JSON string, default segunda a sexta)
    - Importar e registrar o modelo em `backend/app/models/__init__.py`
    - _Requisitos: 5.1, 5.2, 8.7_

  - [ ] 1.2 Gerar migração Alembic para a tabela `andon_settings`
    - Criar arquivo em `backend/alembic/versions/` com `alembic revision --autogenerate`
    - Verificar que o `upgrade()` cria a tabela com os defaults corretos e o `downgrade()` a remove
    - _Requisitos: 5.1_

- [ ] 2. Implementar `oee_service.py` — funções puras de cálculo
  - [ ] 2.1 Criar `backend/app/services/oee_service.py` com a função `calc_working_minutes_per_day`
    - Assinatura: `(start: str, end: str) -> int`
    - Parsear strings "HH:MM" e retornar a diferença em minutos
    - _Requisitos: 5.1_

  - [ ] 2.2 Implementar `count_working_days` em `oee_service.py`
    - Assinatura: `(from_date: date, to_date: date, working_days_list: list[str]) -> int`
    - Iterar sobre o intervalo e contar apenas os dias cujo `weekday()` esteja em `working_days_list`
    - _Requisitos: 5.2_

  - [ ] 2.3 Implementar `calc_availability` em `oee_service.py`
    - Assinatura: `(total_downtime: int, working_minutes_total: int) -> float`
    - Retornar `max(0.0, (working_minutes_total - total_downtime) / working_minutes_total * 100)` arredondado para 1 decimal
    - Retornar `0.0` quando `working_minutes_total == 0`
    - _Requisitos: 2.2, 5.3_

  - [ ] 2.4 Implementar `calc_mttr` em `oee_service.py`
    - Assinatura: `(calls: list[AndonCall]) -> Optional[float]`
    - Filtrar apenas chamados com `downtime_minutes` não nulo; retornar `None` se lista vazia após filtro
    - _Requisitos: 2.3, 5.6, 5.7_

  - [ ] 2.5 Implementar `calc_mtbf` em `oee_service.py`
    - Assinatura: `(calls: list[AndonCall]) -> Optional[float]`
    - Ordenar por `created_at`, calcular média dos intervalos entre consecutivos; retornar `None` se menos de 2 chamados
    - _Requisitos: 2.4, 5.4, 5.5_

  - [ ] 2.6 Implementar `get_top_cause` em `oee_service.py`
    - Assinatura: `(calls: list[AndonCall]) -> Optional[str]`
    - Retornar a `root_cause_category` mais frequente entre chamados com categoria preenchida; `None` se nenhum
    - _Requisitos: 1.9, 3.6_

  - [ ] 2.7 Implementar `get_andon_settings` em `oee_service.py`
    - Assinatura: `async (session: AsyncSession) -> AndonSettings`
    - Buscar registro com `id=1`; retornar instância com defaults se não existir
    - _Requisitos: 8.7_

  - [ ]* 2.8 Escrever testes unitários para `oee_service.py`
    - Criar `backend/app/tests/test_oee_service.py`
    - Cobrir: `calc_working_minutes_per_day` (normal, turno de 0 min), `count_working_days` (semana completa, período de 1 dia, sem dias úteis), `calc_availability` (normal, downtime > disponível → 0.0, working=0 → 0.0), `calc_mttr` com nulos e todos nulos, `calc_mtbf` com 1 chamado e com 2 chamados, `get_top_cause` com lista vazia
    - _Requisitos: 5.1–5.7_

  - [ ]* 2.9 Escrever testes de propriedade para `oee_service.py` usando `hypothesis`
    - Criar `backend/app/tests/test_oee_service_properties.py`
    - **Propriedade 3: Disponibilidade nunca é negativa** — `@given(total_downtime=st.integers(min_value=0), working_minutes=st.integers(min_value=1))` — Valida: Requisitos 2.2, 5.3
    - **Propriedade 4: MTTR ignora chamados sem downtime** — gerar listas com alguns `downtime_minutes=None` — Valida: Requisitos 2.3, 5.6, 5.7
    - **Propriedade 5: MTBF com menos de 2 chamados é null** — `@given(n=st.integers(min_value=0, max_value=1))` — Valida: Requisitos 2.4, 5.4, 5.5
    - **Propriedade 9: Cálculo de minutos de trabalho por dia** — `@given(h1=st.integers(0,22), m1=st.integers(0,59), h2=st.integers(1,23), m2=st.integers(0,59))` com `end > start` — Valida: Requisito 5.1
    - **Propriedade 10: Contagem de dias úteis é consistente** — idempotência e resultado entre 0 e total de dias — Valida: Requisito 5.2
    - Cada teste com `@settings(max_examples=100)` e comentário `# Feature: andon-oee-dashboard, Property N: <texto>`
    - _Requisitos: 2.2–2.4, 5.1–5.7_

- [ ] 3. Checkpoint — Verificar testes do serviço
  - Garantir que todos os testes de `test_oee_service.py` e `test_oee_service_properties.py` passam com `pytest backend/app/tests/test_oee_service*.py`. Perguntar ao usuário se houver dúvidas.

- [ ] 4. Criar schemas Pydantic `andon_dashboard.py`
  - [ ] 4.1 Criar `backend/app/schemas/andon_dashboard.py` com os schemas de query params
    - Implementar `DashboardPeriod` com `from_date`, `to_date`, `workcenter_id` opcional
    - Adicionar `@model_validator(mode="after")` que rejeita `from_date > to_date`
    - Todos os schemas com `model_config = ConfigDict(extra="forbid")`
    - _Requisitos: 1.11, 1.12, 8.5_

  - [ ] 4.2 Implementar schemas de response em `andon_dashboard.py`
    - `DashboardSummary`, `WorkcenterOverview`, `OverviewResponse`
    - `WorkcenterDetailMetrics`, `DowntimeByDay`, `CallByRootCause`, `RecentCall`, `WorkcenterDetailResponse`
    - `TopCauseEntry`, `TimelineEntry`
    - _Requisitos: 1.1–1.9, 2.1–2.8, 3.2, 4.2_

- [ ] 5. Implementar endpoints `andon_dashboard.py`
  - [ ] 5.1 Criar `backend/app/api/api_v1/endpoints/andon_dashboard.py` com o router e endpoint `GET /overview`
    - Prefixo do router: `/andon/dashboard`; tag: `andon_dashboard`
    - Aplicar `@limiter.limit("30/minute")` em todos os endpoints
    - Endpoint `GET /overview`: receber `DashboardPeriod` via `Depends`, buscar todos os `AndonCall` RESOLVED no período, calcular métricas por workcenter usando `oee_service`, retornar `OverviewResponse`
    - Filtrar por `workcenter_id` quando fornecido
    - _Requisitos: 1.1–1.12, 8.2–8.6_

  - [ ] 5.2 Implementar endpoint `GET /workcenter/{wc_id}` em `andon_dashboard.py`
    - Verificar existência do workcenter (retornar 404 se não encontrado)
    - Calcular `availability_percent`, `mttr_minutes`, `mtbf_minutes` via `oee_service`
    - Montar `downtime_by_day` (um entry por dia do período, mesmo com zero), `calls_by_root_cause`, `recent_calls` (últimos 20, ordenados por `created_at` desc)
    - Retornar objeto com métricas zeradas e arrays vazios se não houver chamados no período
    - _Requisitos: 2.1–2.10, 8.4_

  - [ ] 5.3 Implementar endpoint `GET /top-causes` em `andon_dashboard.py`
    - Aceitar parâmetro `limit` (default 10) além de `DashboardPeriod`
    - Filtrar apenas chamados com `root_cause_category` não nulo
    - Calcular `count`, `total_downtime_minutes`, `avg_downtime_minutes`, `affected_workcenters` por categoria
    - Ordenar por `total_downtime_minutes` decrescente e aplicar `limit`
    - Retornar array vazio se não houver chamados justificados
    - _Requisitos: 3.1–3.7_

  - [ ] 5.4 Implementar endpoint `GET /timeline` em `andon_dashboard.py`
    - Gerar uma entrada para cada dia do período (inclusive dias sem chamados, com zeros)
    - Calcular `red_calls`, `yellow_calls`, `total_downtime_minutes` por dia
    - Filtrar por `workcenter_id` quando fornecido
    - Retornar array ordenado por `date` crescente
    - _Requisitos: 4.1–4.5_

  - [ ]* 5.5 Escrever testes de integração para os endpoints
    - Criar `backend/app/tests/test_andon_dashboard_endpoints.py` usando `pytest` + `httpx.AsyncClient` com banco SQLite em memória
    - Cobrir: `test_overview_returns_correct_structure`, `test_overview_422_missing_dates`, `test_overview_422_inverted_dates`, `test_workcenter_detail_404_unknown`, `test_workcenter_detail_empty_period`, `test_top_causes_default_limit_10`, `test_timeline_covers_all_days`
    - _Requisitos: 1.1, 1.11, 1.12, 2.9, 2.10, 3.5, 4.3_

  - [ ]* 5.6 Escrever testes de propriedade para os endpoints
    - **Propriedade 1: Contagem de chamados por cor é consistente** — `total_red + total_yellow == total_calls` — Valida: Requisitos 1.2, 1.3, 1.4
    - **Propriedade 2: Soma de downtime é exata** — soma aritmética dos `downtime_minutes` — Valida: Requisito 1.5
    - **Propriedade 6: Timeline cobre todos os dias do período** — array com exatamente N entradas — Valida: Requisito 4.3
    - **Propriedade 7: Timeline está ordenada por data crescente** — datas estritamente crescentes — Valida: Requisito 4.5
    - **Propriedade 8: Top-causes respeita o limite e a ordenação** — `len(result) <= limit` e ordenado por `total_downtime_minutes` desc — Valida: Requisitos 3.3, 3.4
    - **Propriedade 11: Validação de período rejeita datas invertidas** — HTTP 422 para `from_date > to_date` — Valida: Requisito 1.12
    - _Requisitos: 1.2–1.5, 1.12, 3.3, 3.4, 4.3, 4.5_

- [ ] 6. Registrar router em `api.py`
  - [ ] 6.1 Adicionar import de `andon_dashboard` em `backend/app/api/api_v1/api.py`
    - Importar `from app.api.api_v1.endpoints import andon_dashboard`
    - Registrar: `api_router.include_router(andon_dashboard.router, prefix="/andon/dashboard", tags=["andon_dashboard"])`
    - _Requisitos: 8.3_

- [ ] 7. Checkpoint — Verificar backend completo
  - Garantir que todos os testes de backend passam com `pytest backend/`. Verificar que os endpoints respondem corretamente. Perguntar ao usuário se houver dúvidas.

- [ ] 8. Adicionar métodos de API no frontend (`api.ts`)
  - [ ] 8.1 Definir interfaces TypeScript para os tipos de response em `frontend/src/services/api.ts`
    - Criar interfaces: `DashboardParams`, `DashboardSummary`, `WorkcenterOverview`, `OverviewResponse`, `WorkcenterDetailMetrics`, `DowntimeByDay`, `CallByRootCause`, `RecentCall`, `WorkcenterDetailResponse`, `TopCauseEntry`, `TimelineEntry`
    - Sem uso de `any` — tipagem explícita em todos os campos
    - _Requisitos: 6.4, 7.1_

  - [ ] 8.2 Implementar os 4 métodos de API em `frontend/src/services/api.ts`
    - `getAndonDashboardOverview(params: DashboardParams): Promise<OverviewResponse>`
    - `getAndonDashboardWorkcenter(wcId: number, params: DashboardParams): Promise<WorkcenterDetailResponse>`
    - `getAndonDashboardTopCauses(params: DashboardParams & { limit?: number }): Promise<TopCauseEntry[]>`
    - `getAndonDashboardTimeline(params: DashboardParams): Promise<TimelineEntry[]>`
    - Usar o padrão existente do `api.ts` (Bearer token, base URL via env)
    - _Requisitos: 6.4, 6.5, 6.6, 7.1_

- [ ] 9. Implementar componente `AndonOEEDashboard.tsx`
  - [ ] 9.1 Criar `frontend/src/app/components/AndonOEEDashboard.tsx` com estrutura base e estado
    - Definir estado: `period` (últimos 30 dias), `wcFilter`, `overview`, `timeline`, `topCauses`, `loading`, `error`
    - Implementar `useEffect` que chama `getAndonDashboardOverview`, `getAndonDashboardTimeline` e `getAndonDashboardTopCauses` em paralelo ao mudar `period` ou `wcFilter`
    - Exibir skeleton loaders durante carregamento e toast de erro via `sonner` em caso de falha
    - _Requisitos: 6.1, 6.4, 6.5, 6.6, 6.13, 6.14_

  - [ ] 9.2 Implementar Bloco 1: filtros e cards de resumo em `AndonOEEDashboard.tsx`
    - Seletor de data início/fim e select de workcenter opcional
    - 5 cards: "Chamados Total", "Paradas Críticas", "Tempo Parado", "Disponibilidade Média", "MTTR Médio"
    - Card "Pendências" clicável que navega para `/andon/pendencias`
    - _Requisitos: 6.2, 6.3, 6.12_

  - [ ] 9.3 Implementar Bloco 2: gráficos em `AndonOEEDashboard.tsx`
    - BarChart empilhado (Recharts) com `timeline`: barras vermelhas (RED) e amarelas (YELLOW) por dia
    - DonutChart (Recharts PieChart) com `topCauses`: fatias proporcionais a `total_downtime_minutes`
    - _Requisitos: 6.7, 6.8_

  - [ ] 9.4 Implementar Bloco 3: tabela por workcenter em `AndonOEEDashboard.tsx`
    - Colunas: Workcenter, Disponib., Chamados, 🔴, 🟡, Tempo Parado, MTTR, Pendências, Detalhe
    - Colorir célula de Disponibilidade: verde ≥ 90%, amarelo 75–89%, vermelho < 75%
    - Botão "→" que navega para `/andon/dashboard/{wc_id}`
    - _Requisitos: 6.9, 6.10, 6.11_

- [ ] 10. Implementar componente `AndonWorkcenterDetail.tsx`
  - [ ] 10.1 Criar `frontend/src/app/components/AndonWorkcenterDetail.tsx` com estrutura base e estado
    - Ler `wcId` via `useParams`, inicializar `period` com os mesmos valores da tela principal (via `useSearchParams` ou `useLocation`)
    - Chamar `getAndonDashboardWorkcenter` ao montar e ao mudar período
    - Exibir skeleton loaders e toast de erro via `sonner`
    - _Requisitos: 7.1, 7.10, 7.11_

  - [ ] 10.2 Implementar cabeçalho e cards de métricas em `AndonWorkcenterDetail.tsx`
    - Botão "← Voltar" que navega para `/andon/dashboard` preservando filtros
    - Nome do workcenter no cabeçalho e seletor de período
    - 4 cards: Disponibilidade, MTTR, MTBF, Pendências — exibir "N/A" para valores `null`
    - _Requisitos: 7.2, 7.9, 7.10, 7.11_

  - [ ] 10.3 Implementar gráficos em `AndonWorkcenterDetail.tsx`
    - BarChart vertical (Recharts) com `downtime_by_day` + linha tracejada horizontal da média
    - BarChart horizontal (Recharts) com `calls_by_root_cause` ordenado por `total_downtime_minutes` desc
    - _Requisitos: 7.3, 7.4_

  - [ ] 10.4 Implementar tabela de chamados recentes e integração com `JustificationModal`
    - Tabela com colunas: Data/Hora, Cor, Motivo, Tempo Parado, Causa Raiz, Justificado
    - Exibir ⚠️ para chamados com `requires_justification=true` e `justified_at=null`
    - Ao clicar em ⚠️, abrir `JustificationModal` com o chamado selecionado
    - Após submissão bem-sucedida, fechar modal e recarregar dados da tela
    - _Requisitos: 7.5, 7.6, 7.7, 7.8_

- [ ] 11. Registrar rotas em `App.tsx`
  - [ ] 11.1 Adicionar imports e rotas de dashboard em `frontend/src/app/App.tsx`
    - Importar `AndonOEEDashboard` e `AndonWorkcenterDetail`
    - Adicionar dentro do layout protegido: `<Route path="/andon/dashboard" element={<AndonOEEDashboard />} />` e `<Route path="/andon/dashboard/:wcId" element={<AndonWorkcenterDetail />} />`
    - _Requisitos: 6.1, 7.1_

- [ ] 12. Checkpoint final — Verificar implementação completa
  - Garantir que todos os testes passam com `pytest backend/`. Verificar que as rotas frontend estão acessíveis. Perguntar ao usuário se houver dúvidas antes de finalizar.

## Notas

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada task referencia requisitos específicos para rastreabilidade
- Os checkpoints garantem validação incremental a cada fase
- Testes de propriedade usam `hypothesis` (já disponível no ecossistema Python do projeto)
- Testes unitários e de propriedade são complementares — ambos cobrem `oee_service.py`
