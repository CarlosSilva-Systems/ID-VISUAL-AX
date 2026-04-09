# Requirements Document

## Introduction

O Ciclo de Justificativa de Paradas (Fase 1 do módulo Andon) estende o sistema ID Visual AX com rastreabilidade completa de paradas de produção. Quando um chamado Andon exige justificativa (vermelho ou amarelo com parada), o sistema calcula automaticamente o tempo de parada ao resolver o chamado, enfileira o chamado para justificativa e permite que o supervisor registre a causa raiz e a ação tomada. Um painel dedicado (`/andon/pendencias`) exibe as pendências em tempo real via WebSocket, com badge de contagem no menu lateral.

## Glossary

- **AndonCall**: Registro estruturado de um acionamento Andon (modelo existente na tabela `andon_call`).
- **Justification_Cycle**: Fluxo que vai da resolução de um chamado que requer justificativa até o preenchimento da causa raiz pelo supervisor.
- **Justification_Service**: Serviço de backend responsável pelas regras de negócio do ciclo de justificativa.
- **Pending_Justification_View**: Tela frontend `/andon/pendencias` que lista chamados resolvidos aguardando justificativa.
- **Justification_Modal**: Modal frontend para preenchimento da justificativa de um chamado.
- **WebSocket_Manager**: Serviço existente (`websocket_manager.py`) que gerencia conexões WebSocket e faz broadcast de eventos.
- **Downtime**: Tempo de parada em minutos, calculado como `(resolved_at - created_at) / 60`, arredondado para baixo.
- **Root_Cause_Category**: Categoria da causa raiz, restrita ao conjunto: `Máquina`, `Material`, `Mão de obra`, `Método`, `Meio ambiente`.
- **Supervisor**: Usuário com permissão para justificar chamados Andon.
- **RESOLVED**: Status de um AndonCall que foi encerrado pelo operador ou supervisor.

## Requirements

### Requirement 1: Campos de Parada e Justificativa no Modelo

**User Story:** Como supervisor, quero que o sistema registre automaticamente o tempo de parada e os campos de justificativa em cada chamado Andon, para que eu tenha rastreabilidade completa das ocorrências.

#### Acceptance Criteria

1. THE `AndonCall` SHALL incluir o campo `downtime_minutes` do tipo inteiro opcional, inicialmente nulo.
2. THE `AndonCall` SHALL incluir o campo `requires_justification` do tipo booleano, não nulo, definido no momento da criação.
3. THE `AndonCall` SHALL incluir os campos opcionais `justified_at` (datetime), `justified_by` (string), `root_cause_category` (string), `root_cause_detail` (string) e `action_taken` (string), todos inicialmente nulos.
4. WHEN um `AndonCall` é criado com `color = "RED"`, THE `Justification_Service` SHALL definir `requires_justification = True`.
5. WHEN um `AndonCall` é criado com `color = "YELLOW"` e `is_stop = True`, THE `Justification_Service` SHALL definir `requires_justification = True`.
6. WHEN um `AndonCall` é criado com `color = "YELLOW"` e `is_stop = False`, THE `Justification_Service` SHALL definir `requires_justification = False`.
7. THE `Justification_Service` SHALL garantir que o campo `requires_justification` nunca seja alterado após a criação do chamado.
8. WHEN o status de um `AndonCall` é alterado para `"RESOLVED"`, THE `Justification_Service` SHALL calcular `downtime_minutes` como a diferença em minutos inteiros entre `updated_at` e `created_at` e persistir o valor no registro.

---

### Requirement 2: Migração de Banco de Dados

**User Story:** Como engenheiro de backend, quero uma migração Alembic que adicione os novos campos ao modelo existente, para que o banco de dados reflita o esquema atualizado sem perda de dados.

#### Acceptance Criteria

1. THE migration script SHALL adicionar as colunas `downtime_minutes`, `requires_justification`, `justified_at`, `justified_by`, `root_cause_category`, `root_cause_detail` e `action_taken` à tabela `andon_call`.
2. THE migration script SHALL definir `requires_justification` com valor padrão `False` para registros existentes.
3. THE migration script SHALL definir `downtime_minutes`, `justified_at`, `justified_by`, `root_cause_category`, `root_cause_detail` e `action_taken` como nullable para registros existentes.
4. IF a migration script falhar durante a execução, THEN THE migration script SHALL executar o downgrade sem corromper dados existentes.

---

### Requirement 3: Atualização do Endpoint de Status (PATCH /calls/{call_id}/status)

**User Story:** Como sistema, quero que ao resolver um chamado o tempo de parada seja calculado e o evento WebSocket correto seja emitido, para que o painel de pendências seja atualizado em tempo real.

#### Acceptance Criteria

1. WHEN o endpoint `PATCH /api/v1/andon/calls/{call_id}/status` recebe `status = "RESOLVED"`, THE endpoint SHALL calcular e persistir `downtime_minutes` no `AndonCall`.
2. WHEN o endpoint `PATCH /api/v1/andon/calls/{call_id}/status` recebe `status = "RESOLVED"` e o `AndonCall` tem `requires_justification = True`, THE `WebSocket_Manager` SHALL emitir o evento `andon_justification_required` com o payload contendo `call_id`, `workcenter_name`, `color`, `reason` e `downtime_minutes`.
3. WHEN o endpoint `PATCH /api/v1/andon/calls/{call_id}/status` recebe `status = "RESOLVED"` e o `AndonCall` tem `requires_justification = False`, THE `WebSocket_Manager` SHALL NOT emitir o evento `andon_justification_required`.
4. IF o `AndonCall` com o `call_id` fornecido não existir, THEN THE endpoint SHALL retornar HTTP 404 com mensagem descritiva.

---

### Requirement 4: Endpoint de Listagem de Pendências (GET /calls/pending-justification)

**User Story:** Como supervisor, quero consultar todos os chamados resolvidos que ainda aguardam justificativa, com filtros por workcenter, cor e período, para que eu possa priorizar as justificativas pendentes.

#### Acceptance Criteria

1. THE endpoint `GET /api/v1/andon/calls/pending-justification` SHALL retornar somente `AndonCall` com `requires_justification = True`, `justified_at = null` e `status = "RESOLVED"`.
2. WHEN o parâmetro `workcenter_id` é fornecido, THE endpoint SHALL filtrar os resultados pelo `workcenter_id` informado.
3. WHEN o parâmetro `color` é fornecido, THE endpoint SHALL filtrar os resultados pela cor informada.
4. WHEN os parâmetros `from_date` e `to_date` são fornecidos, THE endpoint SHALL filtrar os resultados cujo `created_at` esteja dentro do intervalo inclusivo `[from_date, to_date]`.
5. THE endpoint SHALL retornar os resultados ordenados por `created_at` ascendente, do mais antigo para o mais recente.
6. IF nenhum chamado pendente for encontrado, THEN THE endpoint SHALL retornar uma lista vazia com HTTP 200.

---

### Requirement 5: Endpoint de Justificativa (PATCH /calls/{call_id}/justify)

**User Story:** Como supervisor, quero registrar a causa raiz e a ação tomada em um chamado resolvido, para que a ocorrência seja documentada e saia da fila de pendências.

#### Acceptance Criteria

1. THE endpoint `PATCH /api/v1/andon/calls/{call_id}/justify` SHALL aceitar no corpo da requisição os campos obrigatórios `root_cause_category`, `root_cause_detail`, `action_taken` e `justified_by`.
2. WHEN todos os campos obrigatórios são fornecidos e o chamado é válido, THE `Justification_Service` SHALL persistir `root_cause_category`, `root_cause_detail`, `action_taken`, `justified_by` e `justified_at` (timestamp UTC atual) no `AndonCall`.
3. WHEN a justificativa é persistida com sucesso, THE `WebSocket_Manager` SHALL emitir o evento `andon_call_justified` com o payload contendo `call_id`, `workcenter_name` e `justified_by`.
4. IF o `AndonCall` com o `call_id` fornecido não existir, THEN THE endpoint SHALL retornar HTTP 404 com mensagem descritiva.
5. IF o `AndonCall` tem `requires_justification = False`, THEN THE endpoint SHALL retornar HTTP 422 com mensagem indicando que o chamado não requer justificativa.
6. IF o `AndonCall` tem `status != "RESOLVED"`, THEN THE endpoint SHALL retornar HTTP 422 com mensagem indicando que o chamado precisa estar resolvido antes de ser justificado.
7. IF o `AndonCall` já possui `justified_at` preenchido, THEN THE endpoint SHALL retornar HTTP 409 com mensagem indicando que o chamado já foi justificado.
8. WHEN `root_cause_category` é fornecido, THE `Justification_Service` SHALL validar que o valor pertence ao conjunto `["Máquina", "Material", "Mão de obra", "Método", "Meio ambiente"]` e retornar HTTP 422 se inválido.

---

### Requirement 6: Endpoint de Estatísticas (GET /calls/justification-stats)

**User Story:** Como supervisor, quero visualizar um resumo das justificativas pendentes, incluindo total, distribuição por cor e a pendência mais antiga, para que eu possa avaliar a criticidade da fila.

#### Acceptance Criteria

1. THE endpoint `GET /api/v1/andon/calls/justification-stats` SHALL retornar um objeto JSON com os campos `total_pending`, `by_color` e `oldest_pending_minutes`.
2. THE endpoint SHALL calcular `total_pending` como o número de `AndonCall` com `requires_justification = True`, `justified_at = null` e `status = "RESOLVED"`.
3. THE endpoint SHALL calcular `by_color.RED` como o número de chamados pendentes com `color = "RED"`.
4. THE endpoint SHALL calcular `by_color.YELLOW` como o número de chamados pendentes com `color = "YELLOW"`.
5. THE endpoint SHALL calcular `oldest_pending_minutes` como a diferença em minutos inteiros entre o `updated_at` do chamado pendente mais antigo e o timestamp UTC atual.
6. IF não houver chamados pendentes, THEN THE endpoint SHALL retornar `{ "total_pending": 0, "by_color": { "RED": 0, "YELLOW": 0 }, "oldest_pending_minutes": null }`.

---

### Requirement 7: Tela de Pendências (/andon/pendencias)

**User Story:** Como supervisor, quero uma tela dedicada que liste todos os chamados aguardando justificativa em formato de tabela, com filtros e atualização em tempo real, para que eu possa gerenciar as pendências de forma eficiente.

#### Acceptance Criteria

1. THE `Pending_Justification_View` SHALL exibir uma tabela com as colunas: Workcenter, Cor, Categoria, Motivo, Duração da Parada, Aberto em, Resolvido em e Ações.
2. THE `Pending_Justification_View` SHALL renderizar linhas com fundo vermelho para chamados com `color = "RED"` e fundo amarelo para chamados com `color = "YELLOW"`.
3. WHEN o valor de `downtime_minutes` de um chamado é maior que 60, THE `Pending_Justification_View` SHALL exibir a célula de duração com destaque visual em vermelho.
4. THE `Pending_Justification_View` SHALL exibir filtros de workcenter, cor e período (data inicial e data final).
5. WHEN o usuário aplica um filtro, THE `Pending_Justification_View` SHALL recarregar a lista chamando `GET /api/v1/andon/calls/pending-justification` com os parâmetros correspondentes.
6. WHEN o evento WebSocket `andon_justification_required` é recebido, THE `Pending_Justification_View` SHALL adicionar o novo chamado à tabela sem recarregar a página.
7. WHEN o evento WebSocket `andon_call_justified` é recebido, THE `Pending_Justification_View` SHALL remover o chamado correspondente da tabela sem recarregar a página.
8. THE `Pending_Justification_View` SHALL exibir um botão "Justificar" em cada linha da tabela.
9. WHEN o usuário clica no botão "Justificar", THE `Pending_Justification_View` SHALL abrir o `Justification_Modal` com os dados do chamado selecionado.

---

### Requirement 8: Badge de Pendências no Menu

**User Story:** Como supervisor, quero ver um badge com o número de justificativas pendentes no menu lateral, para que eu seja alertado sobre pendências sem precisar acessar a tela específica.

#### Acceptance Criteria

1. THE menu lateral SHALL exibir um badge numérico ao lado do item "Pendências" com o valor de `total_pending` retornado por `GET /api/v1/andon/calls/justification-stats`.
2. WHEN o evento WebSocket `andon_justification_required` é recebido, THE menu lateral SHALL incrementar o valor do badge em 1.
3. WHEN o evento WebSocket `andon_call_justified` é recebido, THE menu lateral SHALL decrementar o valor do badge em 1.
4. WHEN o valor do badge é 0, THE menu lateral SHALL ocultar o badge.
5. THE menu lateral SHALL buscar o valor inicial do badge ao carregar a aplicação chamando `GET /api/v1/andon/calls/justification-stats`.

---

### Requirement 9: Modal de Justificativa

**User Story:** Como supervisor, quero um modal com campos obrigatórios para registrar a causa raiz e a ação tomada, para que o preenchimento seja guiado e completo antes do envio.

#### Acceptance Criteria

1. THE `Justification_Modal` SHALL exibir um campo dropdown "Causa Raiz" com as opções: `Máquina`, `Material`, `Mão de obra`, `Método`, `Meio ambiente`.
2. THE `Justification_Modal` SHALL exibir um campo textarea "Detalhe da Causa" de preenchimento obrigatório.
3. THE `Justification_Modal` SHALL exibir um campo textarea "Ação Tomada" de preenchimento obrigatório.
4. WHILE qualquer campo obrigatório estiver vazio, THE `Justification_Modal` SHALL manter o botão "Salvar" desabilitado.
5. WHEN todos os campos obrigatórios estão preenchidos, THE `Justification_Modal` SHALL habilitar o botão "Salvar".
6. WHEN o usuário clica em "Salvar" com todos os campos válidos, THE `Justification_Modal` SHALL chamar `PATCH /api/v1/andon/calls/{call_id}/justify` com os dados preenchidos.
7. WHEN a requisição de justificativa retorna HTTP 200, THE `Justification_Modal` SHALL fechar o modal e exibir uma notificação de sucesso via Sonner toast.
8. IF a requisição de justificativa retorna erro HTTP, THEN THE `Justification_Modal` SHALL exibir uma notificação de erro via Sonner toast sem fechar o modal.
9. THE `Justification_Modal` SHALL preencher automaticamente o campo `justified_by` com o login do usuário autenticado na sessão atual.

---

### Requirement 10: Fluxo Completo de Ponta a Ponta

**User Story:** Como operador e supervisor, quero que o ciclo completo — do acionamento à justificativa — funcione de forma integrada e sem intervenção manual no banco de dados, para que o processo seja confiável e auditável.

#### Acceptance Criteria

1. WHEN um operador cria um `AndonCall` com `color = "RED"`, THE `Justification_Service` SHALL definir `requires_justification = True` no momento da criação.
2. WHEN um supervisor resolve o chamado via `PATCH /api/v1/andon/calls/{call_id}/status` com `status = "RESOLVED"`, THE `Justification_Service` SHALL calcular `downtime_minutes` e THE `WebSocket_Manager` SHALL emitir `andon_justification_required`.
3. WHEN o evento `andon_justification_required` é recebido pelo frontend, THE `Pending_Justification_View` SHALL exibir o chamado na tabela de pendências.
4. WHEN o supervisor preenche e salva a justificativa via `Justification_Modal`, THE `WebSocket_Manager` SHALL emitir `andon_call_justified` e THE `Pending_Justification_View` SHALL remover o chamado da tabela.
5. FOR ALL chamados com `requires_justification = True` e `status = "RESOLVED"`, THE `Justification_Service` SHALL garantir que `justified_at` seja nulo antes da justificativa e não nulo após a justificativa (propriedade de transição de estado).
