# Plano de Implementação: Andon Justification Cycle (Fase 1)

## Visão Geral

Implementação incremental do ciclo de justificativa de paradas Andon, seguindo o plano de commits atômicos definido no design. Cada grupo de tasks corresponde a um commit lógico e independente.

## Tasks

- [x] 1. Adicionar campos de justificativa ao modelo AndonCall
  - Abrir `backend/app/models/andon.py`
  - Adicionar ao final da classe `AndonCall` os 7 campos: `downtime_minutes`, `requires_justification`, `justified_at`, `justified_by`, `root_cause_category`, `root_cause_detail`, `action_taken`
  - Garantir imports de `Optional` e `datetime` já presentes no arquivo
  - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 1.1 Escrever teste de propriedade para imutabilidade de `requires_justification`
    - **Property 2: `requires_justification` é imutável após a criação**
    - **Validates: Requirements 1.7**

- [x] 2. Criar migration Alembic para os novos campos
  - Criar novo arquivo em `backend/alembic/versions/` com `down_revision = 'f45dafaf98ee'`
  - Gerar um `revision` UUID único para o arquivo
  - Implementar `upgrade()`: adicionar as 7 colunas à tabela `andon_call` com os tipos e defaults corretos (`requires_justification` com `server_default='false'`, demais nullable)
  - Implementar `downgrade()`: remover as 7 colunas na ordem inversa
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Implementar `justification_service.py` com regras de negócio
  - Criar `backend/app/services/justification_service.py`
  - Definir `ROOT_CAUSE_CATEGORIES` como `frozenset`
  - Implementar `compute_requires_justification(color: str, is_stop: bool) -> bool`
  - Implementar `compute_downtime_minutes(created_at: datetime, resolved_at: datetime) -> int`
  - Implementar `validate_root_cause_category(category: str) -> bool`
  - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.8, 5.8_

  - [ ]* 3.1 Escrever teste de propriedade para `compute_requires_justification`
    - **Property 1: `compute_requires_justification` é determinístico e correto**
    - **Validates: Requirements 1.4, 1.5, 1.6, 10.1**

  - [ ]* 3.2 Escrever teste de propriedade para `compute_downtime_minutes`
    - **Property 3: `compute_downtime_minutes` é correto e não-negativo**
    - **Validates: Requirements 1.8, 3.1**

  - [ ]* 3.3 Escrever teste de propriedade para `validate_root_cause_category`
    - **Property 6: `validate_root_cause_category` aceita apenas o conjunto válido**
    - **Validates: Requirements 5.8**

- [x] 4. Atualizar endpoint `PATCH /calls/{call_id}/status` com downtime e WebSocket
  - Abrir `backend/app/api/api_v1/endpoints/andon.py`
  - Importar `compute_downtime_minutes` de `justification_service`
  - Importar `ws_manager` de `websocket_manager`
  - No handler `update_call_status`, após `call.updated_at = datetime.utcnow()`, adicionar bloco `if req.status == "RESOLVED"`:
    - Calcular e persistir `call.downtime_minutes`
    - Após commit, se `call.requires_justification`, emitir `await ws_manager.broadcast("andon_justification_required", {...})`
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 5. Checkpoint — Testar backend parcial
  - Garantir que todos os testes passam, verificar imports e que a migration aplica sem erros. Perguntar ao usuário se há dúvidas antes de continuar.

- [x] 6. Implementar endpoint `GET /calls/pending-justification`
  - Em `backend/app/api/api_v1/endpoints/andon.py`, registrar o novo endpoint **antes** do `GET /calls/{call_id}` para evitar conflito de rota
  - Aceitar query params opcionais: `workcenter_id`, `color`, `from_date`, `to_date`
  - Construir query com filtros base: `requires_justification=True`, `justified_at=None`, `status="RESOLVED"`
  - Aplicar filtros opcionais quando fornecidos
  - Ordenar por `created_at` ascendente
  - Retornar lista vazia com HTTP 200 quando não há resultados
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 6.1 Escrever teste de propriedade para filtragem de pendências
    - **Property 4: `GET /pending-justification` retorna exatamente o conjunto correto com filtros**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

- [x] 7. Implementar endpoint `PATCH /calls/{call_id}/justify`
  - Adicionar schema `JustifyRequest(BaseModel)` com campos: `root_cause_category`, `root_cause_detail`, `action_taken`, `justified_by` (todos obrigatórios, `extra="forbid"`)
  - Implementar handler com as validações na ordem correta:
    1. Buscar chamado — HTTP 404 se não existe
    2. Validar `requires_justification=True` — HTTP 422 se False
    3. Validar `status="RESOLVED"` — HTTP 422 se não resolvido
    4. Validar `justified_at=None` — HTTP 409 se já justificado
    5. Validar `root_cause_category` via `validate_root_cause_category` — HTTP 422 se inválida
    6. Persistir todos os campos de justificativa + `justified_at=datetime.utcnow()`
    7. Emitir `await ws_manager.broadcast("andon_call_justified", {...})`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ]* 7.1 Escrever teste de propriedade para persistência de justificativa
    - **Property 5: `PATCH /justify` persiste todos os campos corretamente**
    - **Validates: Requirements 5.2**

  - [ ]* 7.2 Escrever teste de propriedade para transição de estado de `justified_at`
    - **Property 8: Transição de estado de `justified_at`**
    - **Validates: Requirements 5.7, 10.5**

- [x] 8. Implementar endpoint `GET /calls/justification-stats`
  - Adicionar schema `JustificationStats(BaseModel)` com campos: `total_pending: int`, `by_color: dict[str, int]`, `oldest_pending_minutes: Optional[int]`
  - Implementar handler:
    - Query base: `requires_justification=True`, `justified_at=None`, `status="RESOLVED"`
    - Calcular `total_pending`, `by_color.RED`, `by_color.YELLOW`
    - Calcular `oldest_pending_minutes` a partir do `updated_at` do chamado mais antigo e `datetime.utcnow()`
    - Retornar zeros e `null` quando não há pendências
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 8.1 Escrever teste de propriedade para cálculo de estatísticas
    - **Property 7: `GET /justification-stats` calcula corretamente todas as métricas**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**

- [x] 9. Atualizar `POST /calls` para definir `requires_justification` na criação
  - Em `backend/app/api/api_v1/endpoints/andon.py`, no handler `create_andon_call`
  - Importar `compute_requires_justification` de `justification_service`
  - Antes de instanciar `AndonCall`, calcular: `requires_justification = compute_requires_justification(req.color, req.is_stop)`
  - Passar `requires_justification=requires_justification` ao construtor de `AndonCall`
  - _Requirements: 1.4, 1.5, 1.6, 10.1_

- [ ] 10. Checkpoint — Validar backend completo
  - Garantir que todos os testes passam e que os 3 novos endpoints respondem corretamente. Perguntar ao usuário se há dúvidas antes de continuar com o frontend.

- [x] 11. Adicionar tipos TypeScript para justificativa em `types.ts`
  - Abrir `frontend/src/app/types.ts`
  - Estender a interface `AndonCall` existente com os 7 novos campos opcionais/obrigatórios: `downtime_minutes?`, `requires_justification`, `justified_at?`, `justified_by?`, `root_cause_category?`, `root_cause_detail?`, `action_taken?`
  - Adicionar interface `JustificationStats` com `total_pending`, `by_color`, `oldest_pending_minutes`
  - Adicionar tipo `RootCauseCategory` e constante `ROOT_CAUSE_CATEGORIES`
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 12. Adicionar métodos de API em `api.ts`
  - Abrir `frontend/src/services/api.ts`
  - Adicionar `getPendingJustification(filters?)` — `GET /andon/calls/pending-justification`
  - Adicionar `justifyCall(callId, payload)` — `PATCH /andon/calls/{callId}/justify`
  - Adicionar `getJustificationStats()` — `GET /andon/calls/justification-stats`
  - Tipar todos os parâmetros e retornos com as interfaces de `types.ts`
  - _Requirements: 4.1, 5.1, 6.1_

- [x] 13. Criar componente `AndonPendenciasPage.tsx`
  - Criar `frontend/src/app/components/AndonPendenciasPage.tsx`
  - Busca inicial via `getPendingJustification()` ao montar o componente
  - Renderizar tabela com colunas: Workcenter | Cor | Categoria | Motivo | Duração | Aberto em | Resolvido em | Ações
  - Aplicar `bg-red-50` para linhas RED e `bg-yellow-50` para linhas YELLOW
  - Destacar célula de duração em vermelho quando `downtime_minutes > 60`
  - Implementar filtros controlados: `workcenter_id`, `color`, `from_date`, `to_date`
  - Ao aplicar filtro, chamar `getPendingJustification(filters)` e atualizar estado
  - Conectar ao WebSocket existente do projeto:
    - `andon_justification_required` → adicionar chamado ao estado da tabela
    - `andon_call_justified` → remover chamado correspondente do estado
  - Botão "Justificar" em cada linha → abre `JustificationModal` com o chamado selecionado
  - Registrar rota `/andon/pendencias` em `App.tsx`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [ ]* 13.1 Escrever testes de UI para `AndonPendenciasPage`
    - Testar renderização das colunas da tabela
    - Testar aplicação de filtros
    - Testar resposta a eventos WebSocket (adicionar/remover linha)
    - _Requirements: 7.1, 7.6, 7.7_

- [x] 14. Criar componente `JustificationModal.tsx`
  - Criar `frontend/src/app/components/JustificationModal.tsx`
  - Props: `call: AndonCall | null`, `currentUser: string`, `onClose: () => void`, `onSuccess: (callId: number) => void`
  - Estado local: `rootCauseCategory`, `rootCauseDetail`, `actionTaken`, `isSubmitting`
  - Dropdown "Causa Raiz" com as 5 opções de `ROOT_CAUSE_CATEGORIES`
  - Textarea "Detalhe da Causa" obrigatório
  - Textarea "Ação Tomada" obrigatório
  - Botão "Salvar" desabilitado enquanto qualquer campo obrigatório estiver vazio (após `.trim()`) ou `isSubmitting=true`
  - `justified_by` preenchido automaticamente com `currentUser`
  - Ao submeter: chamar `justifyCall(call.id, payload)`, exibir toast de sucesso via Sonner e chamar `onSuccess`, ou toast de erro sem fechar o modal em caso de falha
  - HTTP 409: toast informativo "Este chamado já foi justificado"
  - HTTP 422: toast com a mensagem de detalhe retornada pela API
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [ ]* 14.1 Escrever testes de UI para `JustificationModal`
    - **Property 9: Botão "Salvar" habilitado somente com todos os campos preenchidos**
    - Testar renderização das opções do dropdown
    - Testar estado do botão Salvar conforme preenchimento
    - **Validates: Requirements 9.4, 9.5**

- [x] 15. Adicionar badge de pendências no menu lateral
  - Localizar o componente de layout/menu lateral (ex: `Layout.tsx` ou equivalente)
  - Adicionar estado `pendingJustificationCount: number` inicializado com `0`
  - No `useEffect` de montagem: chamar `getJustificationStats()` e setar `pendingJustificationCount` com `total_pending`
  - Conectar ao WebSocket existente:
    - `andon_justification_required` → incrementar `pendingJustificationCount`
    - `andon_call_justified` → decrementar `pendingJustificationCount` (mínimo 0)
  - Renderizar badge numérico ao lado do item "Pendências" no grupo Andon quando `pendingJustificationCount > 0`
  - Ocultar badge quando `pendingJustificationCount === 0`
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 15.1 Escrever testes de UI para o badge no menu
    - Testar exibição do badge quando `total_pending > 0`
    - Testar ocultação do badge quando `total_pending = 0`
    - _Requirements: 8.1, 8.4_

- [ ] 16. Checkpoint final — Garantir que todos os testes passam
  - Garantir que todos os testes passam, ask the user if questions arise.

## Notas

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- O endpoint `GET /calls/pending-justification` **deve** ser registrado antes de `GET /calls/{call_id}` no router (FastAPI resolve rotas na ordem de registro)
- Cada task corresponde a um commit atômico conforme o plano de commits do design
- Os testes de propriedade usam `hypothesis` com `@settings(max_examples=100)`
- Todos os eventos WebSocket reutilizam o `ws_manager` existente em `websocket_manager.py`
