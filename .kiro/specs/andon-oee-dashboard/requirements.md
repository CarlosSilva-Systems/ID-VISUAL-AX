# Documento de Requisitos — Dashboard OEE / Eficiência Andon

## Introdução

O Dashboard OEE/Eficiência é um módulo analítico do sistema Andon que consolida métricas de disponibilidade operacional dos centros de trabalho (workcenters). A partir dos dados de acionamentos Andon já registrados (modelo `AndonCall`), o sistema calcula e exibe indicadores como Disponibilidade, MTTR e MTBF, permitindo que gestores identifiquem gargalos, acompanhem tendências e priorizem ações corretivas.

O módulo depende funcionalmente da Fase 1 do Andon (acionamentos com `downtime_minutes` preenchidos) e da Fase 2 (justificativas com `root_cause_category`). As métricas de disponibilidade são confiáveis apenas quando esses dados estão consistentemente preenchidos.

## Glossário

- **AndonCall**: Registro de um acionamento Andon com campos `workcenter_id`, `workcenter_name`, `color` (RED/YELLOW), `downtime_minutes`, `root_cause_category`, `justified`, `status`, `created_at`.
- **Dashboard_API**: Conjunto de endpoints FastAPI que calculam e retornam métricas OEE.
- **Dashboard_UI**: Interface React que consome a Dashboard_API e exibe os dados ao usuário.
- **Workcenter**: Centro de trabalho (posto de produção) identificado por `workcenter_id`.
- **Tempo_Disponível**: Janela de trabalho configurada para o dia (ex: 08:00–17:00 = 540 min). Configurável via sistema de settings (Fase 4).
- **Tempo_Produtivo**: `Tempo_Disponível` menos a soma de `downtime_minutes` de todos os `AndonCall` com status `RESOLVED` no período.
- **Disponibilidade**: `(Tempo_Produtivo / Tempo_Disponível) × 100`, expressa em percentual.
- **MTTR**: Mean Time To Resolve — média de `downtime_minutes` dos chamados resolvidos no período.
- **MTBF**: Mean Time Between Failures — tempo médio entre acionamentos consecutivos no mesmo Workcenter.
- **Período**: Intervalo de datas definido pelos parâmetros `from_date` e `to_date` nas consultas.
- **Pendência**: `AndonCall` com `requires_justification = true` e `justified_at = null`.
- **Root_Cause_Category**: Categoria de causa raiz de um chamado justificado (ex: "Máquina", "Material", "Mão de obra", "Método", "Meio ambiente").

---

## Requisitos

### Requisito 1: Endpoint de Visão Geral (Overview)

**User Story:** Como gestor de produção, quero visualizar um resumo consolidado de todos os workcenters para um período selecionado, para que eu possa ter uma visão rápida da saúde operacional da fábrica.

#### Critérios de Aceitação

1. WHEN uma requisição GET é enviada para `/api/v1/andon/dashboard/overview` com `from_date` e `to_date` válidos, THE Dashboard_API SHALL retornar um objeto JSON contendo os campos `period`, `summary` e `by_workcenter`.
2. THE Dashboard_API SHALL calcular o campo `summary.total_calls` como a contagem total de `AndonCall` com status `RESOLVED` no período informado.
3. THE Dashboard_API SHALL calcular o campo `summary.total_red` como a contagem de `AndonCall` com `color = "RED"` e status `RESOLVED` no período.
4. THE Dashboard_API SHALL calcular o campo `summary.total_yellow` como a contagem de `AndonCall` com `color = "YELLOW"` e status `RESOLVED` no período.
5. THE Dashboard_API SHALL calcular o campo `summary.total_downtime_minutes` como a soma de `downtime_minutes` de todos os `AndonCall` com status `RESOLVED` no período.
6. THE Dashboard_API SHALL calcular o campo `summary.avg_availability_percent` como a média aritmética das disponibilidades individuais de cada Workcenter no período, arredondada para uma casa decimal.
7. THE Dashboard_API SHALL calcular o campo `summary.avg_mttr_minutes` como a média de `downtime_minutes` de todos os chamados resolvidos no período, arredondada para uma casa decimal.
8. THE Dashboard_API SHALL calcular o campo `summary.pending_justifications` como a contagem de `AndonCall` com `requires_justification = true` e `justified_at = null`.
9. THE Dashboard_API SHALL retornar o campo `by_workcenter` como um array onde cada elemento contém: `workcenter_id`, `workcenter_name`, `availability_percent`, `total_calls`, `red_calls`, `yellow_calls`, `total_downtime_minutes`, `mttr_minutes`, `pending_justifications`, `top_cause` (string com a categoria de causa raiz mais frequente do Workcenter no período, ou `null` se não houver chamados justificados).
10. WHERE o parâmetro `workcenter_id` for fornecido na query string, THE Dashboard_API SHALL filtrar os resultados para incluir apenas o Workcenter correspondente.
11. IF `from_date` ou `to_date` não forem fornecidos, THEN THE Dashboard_API SHALL retornar HTTP 422 com mensagem de erro descritiva em pt-BR.
12. IF `from_date` for posterior a `to_date`, THEN THE Dashboard_API SHALL retornar HTTP 422 com mensagem de erro indicando intervalo inválido.

---

### Requisito 2: Endpoint de Detalhe por Workcenter

**User Story:** Como gestor de produção, quero visualizar o detalhamento completo de um workcenter específico, para que eu possa analisar suas métricas individuais e identificar padrões de falha.

#### Critérios de Aceitação

1. WHEN uma requisição GET é enviada para `/api/v1/andon/dashboard/workcenter/{wc_id}` com `from_date` e `to_date` válidos, THE Dashboard_API SHALL retornar um objeto JSON com as métricas detalhadas do Workcenter.
2. THE Dashboard_API SHALL calcular `availability_percent` como `(Tempo_Produtivo / Tempo_Disponível) × 100` para o Workcenter no período, arredondado para uma casa decimal.
3. THE Dashboard_API SHALL calcular `mttr_minutes` como a média de `downtime_minutes` dos chamados resolvidos do Workcenter no período, arredondada para uma casa decimal.
4. THE Dashboard_API SHALL calcular `mtbf_minutes` como o tempo médio em minutos entre acionamentos consecutivos do Workcenter no período, arredondado para uma casa decimal.
5. THE Dashboard_API SHALL retornar `total_downtime_minutes`, `total_calls`, `red_calls`, `yellow_calls`, `justified_calls` e `pending_justification` para o Workcenter no período.
6. THE Dashboard_API SHALL retornar o campo `downtime_by_day` como um array de objetos `{date, total_downtime_minutes}` para cada dia do período.
7. THE Dashboard_API SHALL retornar o campo `calls_by_root_cause` como um array de objetos `{category, count, total_downtime_minutes}` agrupados por `root_cause_category` dos chamados justificados do Workcenter no período.
8. THE Dashboard_API SHALL retornar o campo `recent_calls` como os últimos 20 `AndonCall` do Workcenter no período, ordenados por `created_at` decrescente, incluindo os campos `id`, `color`, `reason`, `downtime_minutes`, `root_cause_category`, `justified_at`, `created_at`.
9. IF o `wc_id` fornecido não possuir nenhum `AndonCall` no período, THEN THE Dashboard_API SHALL retornar o objeto com todas as métricas numéricas zeradas e arrays vazios.
10. IF o `wc_id` não existir no banco de dados, THEN THE Dashboard_API SHALL retornar HTTP 404 com mensagem descritiva em pt-BR.

---

### Requisito 3: Endpoint de Ranking de Causas Raiz

**User Story:** Como engenheiro de qualidade, quero visualizar o ranking global das causas raiz de paradas, para que eu possa priorizar ações de melhoria contínua com base em dados.

#### Critérios de Aceitação

1. WHEN uma requisição GET é enviada para `/api/v1/andon/dashboard/top-causes` com `from_date` e `to_date` válidos, THE Dashboard_API SHALL retornar um array de objetos com o ranking de causas raiz.
2. THE Dashboard_API SHALL calcular cada entrada do ranking com os campos: `category`, `count`, `total_downtime_minutes`, `avg_downtime_minutes`, `affected_workcenters`.
3. THE Dashboard_API SHALL ordenar o array retornado por `total_downtime_minutes` de forma decrescente.
4. WHERE o parâmetro `limit` for fornecido, THE Dashboard_API SHALL retornar no máximo `limit` entradas no array.
5. IF o parâmetro `limit` não for fornecido, THEN THE Dashboard_API SHALL aplicar o valor padrão de 10.
6. THE Dashboard_API SHALL incluir apenas chamados com `root_cause_category` preenchido (não nulo) no cálculo do ranking.
7. IF nenhum chamado justificado existir no período, THEN THE Dashboard_API SHALL retornar um array vazio.

---

### Requisito 4: Endpoint de Série Temporal (Timeline)

**User Story:** Como gestor de produção, quero visualizar a evolução diária dos acionamentos Andon ao longo do período, para que eu possa identificar tendências e dias críticos.

#### Critérios de Aceitação

1. WHEN uma requisição GET é enviada para `/api/v1/andon/dashboard/timeline` com `from_date` e `to_date` válidos, THE Dashboard_API SHALL retornar um array de objetos com a série temporal de acionamentos por dia.
2. THE Dashboard_API SHALL retornar cada entrada da série com os campos: `date` (formato `YYYY-MM-DD`), `red_calls`, `yellow_calls`, `total_downtime_minutes`.
3. THE Dashboard_API SHALL incluir uma entrada para cada dia do período, mesmo que o valor de todos os campos numéricos seja zero.
4. WHERE o parâmetro `workcenter_id` for fornecido, THE Dashboard_API SHALL filtrar os dados para incluir apenas acionamentos do Workcenter correspondente.
5. THE Dashboard_API SHALL ordenar o array retornado por `date` de forma crescente.

---

### Requisito 5: Cálculo de Métricas OEE

**User Story:** Como sistema, preciso calcular corretamente as métricas de disponibilidade, MTTR e MTBF a partir dos dados de AndonCall, para que os dashboards exibam valores confiáveis.

#### Critérios de Aceitação

1. THE Dashboard_API SHALL calcular o Tempo_Disponível por dia como o valor configurado no sistema de settings (padrão: 540 minutos, equivalente a 08:00–17:00).
2. THE Dashboard_API SHALL calcular o Tempo_Produtivo como `Tempo_Disponível × número_de_dias_ÚTEIS_no_período − soma_de_downtime_minutes` dos chamados resolvidos no período, onde dias úteis são os dias da semana configurados em `AndonSettings.working_days` (ex: segunda a sexta = 5 dias em uma semana completa).
3. IF o Tempo_Produtivo calculado for negativo (downtime superior ao Tempo_Disponível), THEN THE Dashboard_API SHALL retornar `availability_percent = 0.0` sem retornar valor negativo.
4. THE Dashboard_API SHALL calcular o MTBF considerando apenas chamados com status `RESOLVED` e ordenados por `created_at` dentro do mesmo Workcenter.
5. IF um Workcenter possuir apenas 1 chamado no período, THEN THE Dashboard_API SHALL retornar `mtbf_minutes = null` (indefinido, pois não há intervalo entre falhas).
6. THE Dashboard_API SHALL utilizar apenas `AndonCall` com `downtime_minutes` não nulo no cálculo de MTTR.
7. IF nenhum chamado com `downtime_minutes` preenchido existir no período para o Workcenter, THEN THE Dashboard_API SHALL retornar `mttr_minutes = null`.

---

### Requisito 6: Tela Dashboard OEE Principal

**User Story:** Como gestor de produção, quero acessar uma tela de dashboard com filtros, cards de resumo e gráficos, para que eu possa monitorar a eficiência operacional de forma visual e interativa.

#### Critérios de Aceitação

1. THE Dashboard_UI SHALL renderizar a rota `/andon/dashboard` com três blocos verticais: Filtros e Resumo, Gráficos e Tabela por Workcenter.
2. THE Dashboard_UI SHALL exibir um seletor de período (data início e data fim) e um filtro opcional de Workcenter no Bloco 1.
3. THE Dashboard_UI SHALL exibir 5 cards de resumo no Bloco 1: "Chamados Total", "Paradas Críticas", "Tempo Parado", "Disponibilidade Média" e "MTTR Médio".
4. WHEN o usuário alterar o período ou o filtro de Workcenter, THE Dashboard_UI SHALL recarregar os dados de todos os blocos chamando o endpoint `/api/v1/andon/dashboard/overview`.
5. WHEN o usuário alterar o período ou o filtro de Workcenter, THE Dashboard_UI SHALL também chamar `/api/v1/andon/dashboard/timeline` para atualizar o gráfico de acionamentos por dia.
6. WHEN o usuário alterar o período ou o filtro de Workcenter, THE Dashboard_UI SHALL também chamar `/api/v1/andon/dashboard/top-causes` para atualizar o gráfico de causas raiz (donut).
7. THE Dashboard_UI SHALL exibir no Bloco 2 um gráfico de barras empilhadas com acionamentos por dia, onde barras vermelhas representam chamados RED e barras amarelas representam chamados YELLOW.
8. THE Dashboard_UI SHALL exibir no Bloco 2 um gráfico de rosca (donut) com as causas raiz, onde cada fatia representa uma `root_cause_category` e o tamanho é proporcional ao `total_downtime_minutes`.
9. THE Dashboard_UI SHALL exibir no Bloco 3 uma tabela com as colunas: Workcenter, Disponib., Chamados, 🔴, 🟡, Tempo Parado, MTTR, Pendências, Detalhe.
10. THE Dashboard_UI SHALL colorir a célula de Disponibilidade na tabela do Bloco 3 com: verde para valores ≥ 90%, amarelo para valores entre 75% e 89%, e vermelho para valores < 75%.
11. WHEN o usuário clicar no botão "Detalhe" (→) de um Workcenter na tabela, THE Dashboard_UI SHALL navegar para a rota `/andon/dashboard/{wc_id}`.
12. WHEN o usuário clicar no card "Pendências" no Bloco 1, THE Dashboard_UI SHALL navegar para a rota `/andon/pendencias`.
13. WHILE os dados estiverem sendo carregados, THE Dashboard_UI SHALL exibir indicadores de carregamento (skeleton ou spinner) em cada bloco.
14. IF a requisição ao endpoint retornar erro, THE Dashboard_UI SHALL exibir uma mensagem de erro em pt-BR com opção de tentar novamente.

---

### Requisito 7: Tela de Detalhe do Workcenter

**User Story:** Como gestor de produção, quero visualizar o detalhamento completo de um workcenter específico com gráficos e tabela de chamados, para que eu possa analisar o histórico de paradas e justificar pendências diretamente nessa tela.

#### Critérios de Aceitação

1. THE Dashboard_UI SHALL renderizar a rota `/andon/dashboard/{wc_id}` com o nome do Workcenter no cabeçalho e os dados do período selecionado.
2. THE Dashboard_UI SHALL exibir 4 cards de métricas: Disponibilidade, MTTR, MTBF e Pendências.
3. THE Dashboard_UI SHALL exibir um gráfico de barras verticais com o tempo parado por dia (`downtime_by_day`), incluindo uma linha tracejada horizontal representando a média do período.
4. THE Dashboard_UI SHALL exibir um gráfico de barras horizontais com as top causas raiz (`calls_by_root_cause`), ordenado por `total_downtime_minutes` decrescente.
5. THE Dashboard_UI SHALL exibir uma tabela com os chamados do período (`recent_calls`), incluindo as colunas: Data/Hora, Cor, Motivo, Tempo Parado, Causa Raiz, Justificado.
6. THE Dashboard_UI SHALL exibir o ícone ⚠️ na coluna "Justificado" para chamados com `requires_justification = true` e `justified_at = null`.
7. WHEN o usuário clicar em um chamado com ícone ⚠️ na tabela, THE Dashboard_UI SHALL abrir o modal de justificativa existente (`JustificationModal`) para o chamado selecionado.
8. WHEN a justificativa for submetida com sucesso, THE Dashboard_UI SHALL recarregar os dados da tela de detalhe e atualizar os cards e gráficos.
9. THE Dashboard_UI SHALL exibir o valor `null` de MTBF como "N/A" e o valor `null` de MTTR como "N/A" nos cards.
10. THE Dashboard_UI SHALL exibir um seletor de período na tela de detalhe do Workcenter, inicializado com o mesmo período selecionado na tela principal (`/andon/dashboard`).
11. WHEN o usuário clicar no botão "Voltar", THE Dashboard_UI SHALL navegar de volta para `/andon/dashboard` preservando os filtros de período anteriores.

---

### Requisito 8: Serviço de Cálculo OEE (Backend)

**User Story:** Como sistema, preciso de um serviço dedicado de cálculo OEE que encapsule toda a lógica de negócio das métricas, para que os endpoints sejam simples e a lógica seja testável de forma isolada.

#### Critérios de Aceitação

1. THE Dashboard_API SHALL implementar um módulo `oee_service.py` em `backend/app/services/` contendo todas as funções de cálculo de métricas OEE.
2. THE Dashboard_API SHALL implementar os endpoints de dashboard em um arquivo dedicado `backend/app/api/api_v1/endpoints/andon_dashboard.py`, separado do arquivo `andon.py` existente.
3. THE Dashboard_API SHALL registrar o router do dashboard com o prefixo `/andon/dashboard` no arquivo `api.py`.
4. THE Dashboard_API SHALL implementar todos os endpoints como funções `async` utilizando `AsyncSession`.
5. THE Dashboard_API SHALL utilizar schemas Pydantic com `extra="forbid"` para todos os modelos de request e response do dashboard.
6. THE Dashboard_API SHALL aplicar rate limiting nos endpoints de dashboard utilizando `slowapi`.
7. THE `oee_service.py` SHALL consultar `AndonSettings` para obter `working_minutes_per_day` e `working_days` ao calcular o Tempo_Disponível global.
8. THE `oee_service.py` SHALL consultar `AndonWorkCenterSettings.working_day_start_override` e `working_day_end_override` ao calcular o Tempo_Disponível de um Workcenter específico, utilizando os valores globais de `AndonSettings` como fallback quando o override for nulo.
