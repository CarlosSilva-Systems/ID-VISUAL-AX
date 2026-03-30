# Plano de Implementação: Seleção Dinâmica de Banco de Dados Odoo

## Visão Geral

Este plano implementa três features integradas:
1. Seleção dinâmica de banco de dados Odoo via interface gráfica
2. Refatoração da lógica de autenticação (separação Service_Account vs User_Credentials)
3. Polling automático de identificações visuais com lifecycle gerenciado

O plano segue o roadmap de 5 fases do design document, com tasks granulares e atômicas (um commit por task).

## Tasks

### Phase 1: Backend Infrastructure

- [ ] 1. Renomear variáveis de ambiente para Service Account
  - [ ] 1.1 Atualizar arquivo `.env.example`
    - Renomear `ODOO_LOGIN` → `ODOO_SERVICE_LOGIN`
    - Renomear `ODOO_PASSWORD` → `ODOO_SERVICE_PASSWORD`
    - Adicionar comentários explicativos sobre Service Account
    - _Requirements: 6.3_
  
  - [ ] 1.2 Atualizar `backend/app/core/config.py`
    - Renomear campos `ODOO_LOGIN` → `ODOO_SERVICE_LOGIN`
    - Renomear campos `ODOO_PASSWORD` → `ODOO_SERVICE_PASSWORD`
    - Manter retrocompatibilidade temporária se necessário
    - _Requirements: 6.4_
  
  - [ ] 1.3 Atualizar `backend/app/services/odoo_client.py`
    - Substituir todas as referências a `settings.ODOO_LOGIN` por `settings.ODOO_SERVICE_LOGIN`
    - Substituir todas as referências a `settings.ODOO_PASSWORD` por `settings.ODOO_SERVICE_PASSWORD`
    - _Requirements: 6.5_
  
  - [ ] 1.4 Atualizar `backend/app/api/deps.py`
    - Substituir referências antigas pelas novas variáveis de ambiente
    - _Requirements: 6.6_
  
  - [ ] 1.5 Realizar busca global e validação
    - Executar grep para encontrar referências a `ODOO_LOGIN` e `ODOO_PASSWORD`
    - Corrigir todas as referências encontradas
    - Validar que nenhuma referência antiga permaneceu
    - _Requirements: 6.1, 6.2, 6.7_

- [ ] 2. Implementar helper get_active_odoo_db()
  - [ ] 2.1 Criar arquivo `backend/app/services/odoo_utils.py`
    - Implementar função `get_active_odoo_db(session: AsyncSession) -> str`
    - Implementar fallback chain: system_setting → "id-visual-3" → settings.ODOO_DB
    - Adicionar logging para warnings de fallback
    - Implementar tratamento de exceções robusto
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  
  - [ ] 2.2 Implementar funções auxiliares de validação
    - Criar `validate_database_name(name: str) -> bool`
    - Criar `normalize_database_name(name: str) -> str`
    - Implementar regex para validação (apenas alfanuméricos, hífen, underscore)
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [ ]* 2.3 Escrever testes unitários para get_active_odoo_db()
    - Testar fallback para "id-visual-3" quando system_setting não existe
    - Testar fallback para settings.ODOO_DB quando database não disponível
    - Testar normalização de nomes (trim)
    - Testar recuperação de valores corrompidos
    - _Requirements: 3.1, 3.2, 3.3, 12.5_
  
  - [ ]* 2.4 Escrever property test para normalização round-trip
    - **Property 9: Database Name Normalization Round-Trip**
    - **Valida: Requirements 12.3, 12.4**
    - Usar hypothesis para gerar nomes de banco aleatórios
    - Verificar que `retrieve(store(normalize(name))) == normalize(name)`

- [ ] 3. Atualizar dependency get_odoo_client()
  - [ ] 3.1 Modificar `backend/app/api/deps.py`
    - Importar `get_active_odoo_db` de `app.services.odoo_utils`
    - Chamar `active_db = await get_active_odoo_db(session)` antes de instanciar OdooClient
    - Passar `db=active_db` ao invés de `db=settings.ODOO_DB`
    - Usar `login=settings.ODOO_SERVICE_LOGIN` e `secret=settings.ODOO_SERVICE_PASSWORD`
    - _Requirements: 3.4, 8.1_
  
  - [ ]* 3.2 Escrever teste de integração para get_odoo_client()
    - Verificar que OdooClient é instanciado com banco ativo correto
    - Verificar que Service_Account é usado
    - Testar fallback quando system_setting não existe
    - _Requirements: 3.4, 11.2_

- [ ] 4. Criar endpoints de gerenciamento de banco de dados
  - [ ] 4.1 Criar schemas Pydantic em `backend/app/schemas/odoo.py`
    - Criar `DatabaseInfo(BaseModel)` com campos: name, type, selectable, is_active
    - Criar `DatabaseSelectRequest(BaseModel)` com campo: database
    - Criar `DatabaseSelectResponse(BaseModel)` com campos: status, database, connection_ok
    - _Requirements: 1.6, 2.6_
  
  - [ ] 4.2 Implementar GET /api/v1/odoo/databases
    - Criar endpoint em `backend/app/api/api_v1/endpoints/odoo.py`
    - Consultar {ODOO_URL}/web/database/list via httpx
    - Classificar cada banco (production se "axengenharia1", senão test)
    - Marcar Production_Database com `selectable: false`
    - Buscar Active_Database de system_setting via `get_active_odoo_db()`
    - Marcar banco ativo com `is_active: true`
    - Implementar tratamento de erros (502 para falhas de rede, 504 para timeout)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  
  - [ ] 4.3 Implementar POST /api/v1/odoo/databases/select
    - Criar endpoint em `backend/app/api/api_v1/endpoints/odoo.py`
    - Validar que banco não é "axengenharia1" (retornar 403 se for)
    - Validar nome do banco com `validate_database_name()` (retornar 400 se inválido)
    - Normalizar nome com `normalize_database_name()`
    - Testar conexão com Service_Account antes de persistir
    - Persistir em system_setting com chave "active_odoo_db"
    - Retornar resposta com status, database e connection_ok
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 12.1, 12.2, 12.3_
  
  - [ ] 4.4 Implementar funções auxiliares de classificação
    - Criar `classify_database(db_name: str) -> Literal["production", "test"]`
    - Criar `is_selectable(db_type: str) -> bool`
    - Criar `test_odoo_connection(url, db, login, password) -> bool`
    - _Requirements: 1.2, 1.3, 2.4_
  
  - [ ]* 4.5 Escrever testes unitários para endpoints
    - Testar GET /databases retorna formato correto
    - Testar POST /select rejeita "axengenharia1" com 403
    - Testar POST /select rejeita nomes inválidos com 400
    - Testar POST /select persiste banco válido
    - Testar tratamento de erros de rede (502, 504)
    - _Requirements: 1.6, 1.7, 2.1, 2.2, 2.3_
  
  - [ ]* 4.6 Escrever property tests para classificação
    - **Property 1: Database Classification Consistency**
    - **Valida: Requirements 1.2**
    - Verificar que classificação é "production" iff nome == "axengenharia1"
  
  - [ ]* 4.7 Escrever property test para proteção de produção
    - **Property 2: Production Database Protection**
    - **Valida: Requirements 1.3**
    - Verificar que bancos "production" têm `selectable: false`
  
  - [ ]* 4.8 Escrever property test para banco ativo
    - **Property 3: Active Database Inclusion**
    - **Valida: Requirements 1.4**
    - Verificar que resposta tem exatamente um banco com `is_active: true`

- [ ] 5. Refatorar autenticação em auth.py
  - [ ] 5.1 Atualizar endpoint POST /api/v1/auth/login
    - Importar `get_active_odoo_db` de `app.services.odoo_utils`
    - Obter `active_db = await get_active_odoo_db(session)`
    - Criar OdooClient temporário com User_Credentials (form_data.username, form_data.password)
    - Usar `active_db` ao invés de `settings.ODOO_DB`
    - Chamar `_jsonrpc_authenticate()` para validar credenciais
    - Criar JWT local com apenas uid, name, email (NUNCA armazenar senha)
    - Implementar tratamento de erros genérico (não revelar detalhes internos)
    - Adicionar request_id único para rastreabilidade
    - Fechar cliente temporário no finally
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 10.1, 10.2, 10.3, 10.4_
  
  - [ ] 5.2 Implementar sanitização de logs
    - Criar função `sanitize_error_message(error: str) -> str`
    - Substituir ODOO_SERVICE_PASSWORD e ODOO_SERVICE_LOGIN por "***"
    - Aplicar sanitização em todos os logs de erro
    - _Requirements: 10.1, 10.2_
  
  - [ ] 5.3 Implementar validação de startup
    - Adicionar evento `@app.on_event("startup")` em `backend/app/main.py`
    - Validar que ODOO_URL, ODOO_SERVICE_LOGIN, ODOO_SERVICE_PASSWORD existem
    - Lançar RuntimeError se variáveis faltando
    - Adicionar log de sucesso
    - _Requirements: 10.5_
  
  - [ ]* 5.4 Escrever testes unitários para autenticação
    - Testar login com credenciais válidas retorna JWT
    - Testar login com credenciais inválidas retorna 401
    - Testar que senha do usuário não aparece em sessão
    - Testar que mensagens de erro são genéricas
    - Testar que request_id é incluído em erros
    - _Requirements: 7.3, 7.4, 7.5, 10.3, 10.4_
  
  - [ ]* 5.5 Escrever property test para senha nunca armazenada
    - **Property 13: User Password Never Stored**
    - **Valida: Requirements 7.5**
    - Gerar senhas aleatórias e verificar que não aparecem em session_data
  
  - [ ]* 5.6 Escrever property test para sanitização de credenciais
    - **Property 16: Credential Sanitization in Logs**
    - **Valida: Requirements 10.1, 10.2**
    - Verificar que ODOO_SERVICE_PASSWORD nunca aparece em logs

- [ ] 6. Checkpoint - Validar backend completo
  - Executar todos os testes unitários e property tests
  - Verificar que nenhuma referência antiga a ODOO_LOGIN/ODOO_PASSWORD permaneceu
  - Testar endpoints manualmente via Swagger UI
  - Garantir que working tree está limpa (sem arquivos pendentes)
  - Perguntar ao usuário se há dúvidas ou ajustes necessários

### Phase 2: Frontend UI

- [ ] 7. Criar componente DatabaseSelector
  - [ ] 7.1 Criar arquivo `frontend/src/app/components/DatabaseSelector.tsx`
    - Criar interface `Database` com campos: name, type, selectable, is_active
    - Implementar estado para databases, selectedDb, loading
    - Implementar `loadDatabases()` que chama GET /api/v1/odoo/databases
    - Implementar `handleSave()` que chama POST /api/v1/odoo/databases/select
    - Renderizar dropdown com ícones (🟢 para production, 🟡 para test)
    - Desabilitar opções com `selectable: false`
    - Pré-selecionar banco ativo
    - Exibir warning para banco de produção
    - Disparar evento 'database-changed' após salvar com sucesso
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7_
  
  - [ ] 7.2 Implementar tratamento de erros no DatabaseSelector
    - Tratar erro 502 (servidor indisponível)
    - Tratar erro 504 (timeout)
    - Tratar erro 403 (banco de produção)
    - Exibir toasts com mensagens em pt-BR
    - _Requirements: 4.7_
  
  - [ ]* 7.3 Escrever testes unitários para DatabaseSelector
    - Testar que banco production exibe ícone verde e está desabilitado
    - Testar que banco test exibe ícone amarelo e está habilitado
    - Testar que botão Salvar chama API corretamente
    - Testar que toasts são exibidos em caso de erro
    - _Requirements: 4.2, 4.3, 4.6_

- [ ] 8. Criar componente ConnectionBadge
  - [ ] 8.1 Criar arquivo `frontend/src/app/components/ConnectionBadge.tsx`
    - Criar type `ConnectionStatus = 'production' | 'test' | 'disconnected'`
    - Implementar estado para status e dbName
    - Implementar `checkConnection()` que chama GET /api/v1/odoo/databases
    - Determinar status baseado no banco ativo (production, test, disconnected)
    - Implementar `getStatusConfig()` para cores e ícones
    - Renderizar badge com ícone animado, texto e nome do banco
    - Escutar evento 'database-changed' para atualizar
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 8.2 Escrever testes unitários para ConnectionBadge
    - Testar que badge exibe verde para production
    - Testar que badge exibe amarelo para test
    - Testar que badge exibe vermelho para disconnected
    - Testar que badge atualiza ao receber evento 'database-changed'
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 9. Integrar componentes na UI existente
  - [ ] 9.1 Integrar ConnectionBadge no Layout.tsx
    - Importar ConnectionBadge
    - Adicionar no header ao lado do nome do usuário
    - Garantir que badge é visível em todas as páginas
    - _Requirements: 5.1, 5.5_
  
  - [ ] 9.2 Integrar DatabaseSelector em Configuracoes.tsx
    - Importar DatabaseSelector
    - Adicionar seção "Integração Odoo" no card de configurações
    - Adicionar título e descrição em pt-BR
    - Garantir layout responsivo
    - _Requirements: 4.1_
  
  - [ ]* 9.3 Testar integração visual completa
    - Verificar que ConnectionBadge aparece no header
    - Verificar que DatabaseSelector aparece em Configurações
    - Testar fluxo completo: selecionar banco → salvar → badge atualiza
    - _Requirements: 4.7, 5.4_

- [ ] 10. Checkpoint - Validar frontend completo
  - Executar todos os testes unitários do frontend
  - Testar manualmente no navegador (Chrome, Firefox)
  - Verificar responsividade em diferentes resoluções
  - Garantir que working tree está limpa
  - Perguntar ao usuário se há ajustes de UI necessários

### Phase 3: Polling System

- [ ] 11. Implementar PollingManager
  - [ ] 11.1 Criar arquivo `frontend/src/services/pollingManager.ts`
    - Criar classe PollingManager com campos privados para intervals
    - Implementar método `start()` que inicia ambos os pollings
    - ID_Odoo: intervalo de 10 minutos, chama GET /api/v1/odoo/mos
    - ID_Producao: intervalo de 30 segundos, chama GET /api/v1/id-requests/manual
    - Implementar método `stop()` que limpa ambos os intervals
    - Implementar método `restart()` que para e reinicia
    - Garantir que apenas uma instância de cada polling está ativa
    - Implementar logging no console para debug
    - _Requirements: 13.1, 13.2, 13.9_
  
  - [ ] 11.2 Implementar tratamento de erros silencioso
    - Envolver chamadas de API em try-catch
    - Fazer log de erros no console (não exibir toasts)
    - Continuar polling mesmo após falhas
    - _Requirements: 13.8_
  
  - [ ]* 11.3 Escrever testes unitários para PollingManager
    - Testar que start() inicia ambos os pollings
    - Testar que stop() limpa ambos os intervals
    - Testar que restart() para e reinicia corretamente
    - Testar que apenas uma instância está ativa
    - _Requirements: 13.1, 13.2, 13.9_
  
  - [ ]* 11.4 Escrever property test para instância única
    - **Property 19: Polling Instance Uniqueness**
    - **Valida: Requirements 13.9**
    - Tentar iniciar polling múltiplas vezes e verificar que apenas uma instância está ativa
  
  - [ ]* 11.5 Escrever property test para falhas silenciosas
    - **Property 22: Polling Silent Failure Handling**
    - **Valida: Requirements 13.8**
    - Simular padrões de falha aleatórios e verificar que polling continua

- [ ] 12. Integrar PollingManager no App.tsx
  - [ ] 12.1 Importar pollingManager em `frontend/src/app/App.tsx`
    - Importar `pollingManager` de `services/pollingManager`
    - Adicionar useEffect que monitora `isAuthenticated`
    - Chamar `pollingManager.start()` quando usuário faz login
    - Chamar `pollingManager.stop()` quando usuário faz logout
    - Escutar evento 'database-changed' e chamar `pollingManager.restart()`
    - Limpar listeners no cleanup do useEffect
    - _Requirements: 13.3, 13.4, 13.7_
  
  - [ ]* 12.2 Escrever teste de integração para lifecycle
    - Testar que polling inicia no login
    - Testar que polling para no logout
    - Testar que polling reinicia ao mudar banco
    - _Requirements: 13.3, 13.4, 13.7_

- [ ] 13. Validar que polling usa Service Account e Active Database
  - [ ] 13.1 Verificar que endpoints usam get_odoo_client()
    - Confirmar que GET /api/v1/odoo/mos usa dependency get_odoo_client()
    - Confirmar que GET /api/v1/id-requests/manual usa dependency get_odoo_client()
    - Garantir que ambos usam Service_Account e Active_Database automaticamente
    - _Requirements: 13.5, 13.6, 8.1, 8.2_
  
  - [ ]* 13.2 Escrever property test para uso de Service Account
    - **Property 20: Polling Uses Service Account**
    - **Valida: Requirements 13.5**
    - Verificar que polling usa ODOO_SERVICE_LOGIN/PASSWORD
  
  - [ ]* 13.3 Escrever property test para uso de Active Database
    - **Property 21: Polling Uses Active Database**
    - **Valida: Requirements 13.6**
    - Verificar que polling usa valor atual de Active_Database

- [ ] 14. Checkpoint - Validar polling completo
  - Executar todos os testes de polling
  - Testar manualmente: fazer login → verificar console → ver logs de polling
  - Testar mudança de banco → verificar que polling reinicia
  - Testar logout → verificar que polling para
  - Garantir que working tree está limpa
  - Perguntar ao usuário se há problemas de performance

### Phase 4: Testing & Documentation

- [ ] 15. Implementar testes de integração end-to-end
  - [ ] 15.1 Criar teste de fluxo completo de seleção de banco
    - Testar: listar bancos → selecionar banco test → verificar ativo mudou
    - Testar: tentar selecionar banco production → verificar 403
    - Testar: selecionar banco inválido → verificar 400
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 12.1, 12.2_
  
  - [ ] 15.2 Criar teste de fluxo completo de autenticação
    - Testar: login com credenciais válidas → verificar JWT criado
    - Testar: login com credenciais inválidas → verificar 401
    - Testar: operações após login usam Service_Account
    - Testar: logout não destrói sessão de Service_Account
    - _Requirements: 7.1, 7.3, 7.4, 8.1, 9.2_
  
  - [ ] 15.3 Criar teste de fluxo completo de polling
    - Testar: login → polling inicia → verificar chamadas de API
    - Testar: mudar banco → polling reinicia com novo banco
    - Testar: logout → polling para
    - _Requirements: 13.3, 13.4, 13.7_
  
  - [ ]* 15.4 Executar todos os property tests com 100 iterações
    - Configurar hypothesis com profile "ci" (max_examples=100)
    - Configurar fast-check com numRuns=100
    - Executar todos os property tests e verificar sucesso
    - _Requirements: Todas as propriedades do design_

- [ ] 16. Criar documentação técnica
  - [ ] 16.1 Atualizar README.md do backend
    - Documentar novas variáveis de ambiente (ODOO_SERVICE_LOGIN/PASSWORD)
    - Documentar novos endpoints (/api/v1/odoo/databases)
    - Adicionar seção sobre seleção dinâmica de banco
    - Adicionar exemplos de uso
    - _Requirements: 11.5_
  
  - [ ] 16.2 Atualizar README.md do frontend
    - Documentar novos componentes (DatabaseSelector, ConnectionBadge)
    - Documentar PollingManager e lifecycle
    - Adicionar screenshots dos componentes
    - _Requirements: 11.5_
  
  - [ ] 16.3 Criar guia de migração
    - Documentar mudanças de breaking changes (se houver)
    - Criar checklist para administradores
    - Documentar processo de rollback
    - Adicionar troubleshooting comum
    - _Requirements: 11.4, 11.5_
  
  - [ ] 16.4 Atualizar CHANGELOG.md
    - Adicionar seção para nova versão
    - Listar todas as features adicionadas
    - Listar breaking changes (renomeação de variáveis)
    - Adicionar notas de migração
    - _Requirements: 11.5_

- [ ] 17. Checkpoint - Validar testes e documentação
  - Executar suite completa de testes (unit + property + integration)
  - Verificar cobertura de código (backend ≥80%, frontend ≥70%)
  - Revisar documentação para clareza e completude
  - Garantir que working tree está limpa
  - Perguntar ao usuário se documentação está adequada

### Phase 5: Deployment & Monitoring

- [ ] 18. Preparar ambiente para deploy
  - [ ] 18.1 Atualizar docker-compose.yml (se necessário)
    - Verificar se novas variáveis de ambiente estão mapeadas
    - Adicionar ODOO_SERVICE_LOGIN e ODOO_SERVICE_PASSWORD
    - Remover ODOO_LOGIN e ODOO_PASSWORD (deprecated)
    - _Requirements: 6.1, 6.2_
  
  - [ ] 18.2 Criar script de migração de dados
    - Criar script para popular system_setting com "active_odoo_db" = "id-visual-3"
    - Adicionar validação de dados existentes
    - Adicionar rollback em caso de falha
    - _Requirements: 2.3, 3.1_
  
  - [ ] 18.3 Atualizar .gitignore
    - Garantir que arquivos .db locais estão ignorados
    - Garantir que logs de erro estão ignorados
    - Garantir que arquivos temporários estão ignorados
    - _Requirements: Diretrizes Globais - Zero Pendências_

- [ ] 19. Implementar monitoramento e logging
  - [ ] 19.1 Adicionar métricas de polling
    - Adicionar contador de requisições de polling
    - Adicionar contador de falhas de polling
    - Adicionar log estruturado com timestamps
    - _Requirements: 13.8_
  
  - [ ] 19.2 Adicionar logs de seleção de banco
    - Adicionar log quando banco é selecionado
    - Adicionar log quando teste de conexão falha
    - Adicionar log quando fallback é usado
    - Incluir request_id para rastreabilidade
    - _Requirements: 10.4, 12.5_
  
  - [ ] 19.3 Adicionar alertas de falha de conexão
    - Implementar detecção de falhas consecutivas
    - Adicionar log de warning após 3 falhas consecutivas
    - Adicionar log de error após 10 falhas consecutivas
    - _Requirements: 13.8_

- [ ] 20. Validação final e deploy
  - [ ] 20.1 Executar checklist de segurança
    - Verificar que ODOO_SERVICE_PASSWORD nunca aparece em logs
    - Verificar que User_Credentials nunca são armazenadas
    - Verificar que mensagens de erro são genéricas
    - Verificar que banco de produção não pode ser selecionado
    - Verificar que validação de input está no backend
    - _Requirements: 10.1, 10.2, 10.3, 7.5, 2.2_
  
  - [ ] 20.2 Testar em ambiente de staging
    - Deploy em staging
    - Executar testes manuais completos
    - Verificar logs e métricas
    - Coletar feedback de usuários T.I
    - _Requirements: 11.3_
  
  - [ ] 20.3 Deploy em produção
    - Executar script de migração de dados
    - Deploy da aplicação
    - Monitorar logs por 24h
    - Verificar que polling está funcionando
    - Verificar que seleção de banco está funcionando
    - _Requirements: 11.3_

- [ ] 21. Checkpoint final - Validar deploy completo
  - Verificar que todos os serviços estão rodando
  - Verificar que não há erros nos logs
  - Verificar que métricas estão sendo coletadas
  - Verificar que usuários conseguem usar a feature
  - Garantir que working tree está limpa
  - Documentar lições aprendidas

## Notas

- Tasks marcadas com `*` são opcionais (testes) e podem ser puladas para MVP mais rápido
- Cada task deve resultar em um commit atômico seguindo Conventional Commits em PT-BR
- Checkpoints garantem validação incremental e oportunidade para feedback do usuário
- Property tests usam hypothesis (backend) e fast-check (frontend) com mínimo 100 iterações
- Todas as tasks referenciam requirements específicos para rastreabilidade
- Working tree deve estar limpa ao final de cada fase (sem arquivos pendentes)

## Dependências entre Tasks

- Phase 2 depende de Phase 1 (frontend precisa de endpoints backend)
- Phase 3 depende de Phase 1 (polling usa get_odoo_client() atualizado)
- Phase 4 pode ser executada em paralelo com Phase 3
- Phase 5 depende de todas as anteriores

## Estimativa de Esforço

- Phase 1: ~8-10 horas (backend infrastructure)
- Phase 2: ~4-6 horas (frontend UI)
- Phase 3: ~3-4 horas (polling system)
- Phase 4: ~6-8 horas (testing & documentation)
- Phase 5: ~4-6 horas (deployment & monitoring)
- **Total: ~25-34 horas**
