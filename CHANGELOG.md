# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [2.0.0] - 2025-01-XX

### Adicionado

#### Backend
- **Seleção Dinâmica de Banco de Dados Odoo**
  - Endpoint `GET /api/v1/odoo/databases` para listar bancos disponíveis
  - Endpoint `POST /api/v1/odoo/databases/select` para selecionar banco ativo
  - Helper `get_active_odoo_db()` com fallback chain robusto (system_setting → padrão → .env)
  - Funções auxiliares: `classify_database()`, `is_selectable()`, `validate_database_name()`, `normalize_database_name()`
  - Schemas Pydantic: `DatabaseInfo`, `DatabaseSelectRequest`, `DatabaseSelectResponse`
  - Persistência de banco ativo em `system_setting` com chave `active_odoo_db`

- **Refatoração de Autenticação**
  - Separação clara entre Service_Account (operações) e User_Credentials (validação de login)
  - Dependency `get_odoo_client()` atualizado para usar banco ativo dinamicamente
  - Validação de variáveis de ambiente no startup
  - Sanitização de credenciais em logs (ODOO_SERVICE_PASSWORD nunca exposta)
  - Request_ID único para rastreabilidade de erros

- **Segurança**
  - Proteção do banco de produção (`axengenharia1`) - não selecionável via UI
  - Validação de input no backend (não confiar apenas no frontend)
  - Mensagens de erro genéricas (não revelar detalhes internos)
  - Teste de conexão antes de persistir seleção de banco

#### Frontend
- **Componente DatabaseSelector**
  - Dropdown para seleção de banco de dados na tela de Configurações
  - Ícones visuais: 🟢 (production), 🟡 (test)
  - Desabilita seleção do banco de produção
  - Testa conexão antes de salvar
  - Dispara evento `database-changed` após salvar

- **Componente ConnectionBadge**
  - Indicador visual no header mostrando status da conexão Odoo
  - Estados: 🟢 CONECTADO (production), 🟡 CONECTADO (test), 🔴 DESCONECTADO
  - Atualiza automaticamente ao mudar banco de dados
  - Exibe nome do banco ativo

- **PollingManager**
  - Gerenciador de polling automático de identificações visuais
  - ID_Odoo: busca a cada 10 minutos via `GET /odoo/mos`
  - ID_Producao: busca a cada 30 segundos via `GET /id-requests/manual`
  - Lifecycle gerenciado por autenticação (start no login, stop no logout)
  - Reinicia automaticamente ao mudar banco de dados
  - Tratamento silencioso de falhas (não interrompe polling)

- **Integração no App.tsx**
  - Polling inicia automaticamente no login
  - Polling para no logout
  - Polling reinicia ao mudar banco de dados (evento `database-changed`)

#### Documentação
- README.md do backend atualizado com:
  - Documentação de novos endpoints
  - Arquitetura de banco de dados ativo
  - Fluxo de autenticação detalhado
  - Guia de troubleshooting
- README.md do frontend atualizado com:
  - Documentação de novos componentes
  - Documentação do PollingManager
  - Eventos customizados
  - Guia de troubleshooting
- Guia de migração (`docs/MIGRATION_GUIDE.md`) criado
- CHANGELOG.md criado

### Modificado

#### Backend
- **Variáveis de Ambiente (BREAKING CHANGE)**
  - `ODOO_LOGIN` → `ODOO_SERVICE_LOGIN`
  - `ODOO_PASSWORD` → `ODOO_SERVICE_PASSWORD`
  - `ODOO_DB` agora é apenas fallback de emergência

- **Endpoints Refatorados**
  - `GET /api/v1/odoo/mos` agora usa `get_odoo_client()` dependency
  - `GET /api/v1/id-requests/manual` agora usa `get_odoo_client()` dependency
  - `GET /api/v1/odoo/users` agora usa `get_odoo_client()` dependency
  - Todos os endpoints acima usam automaticamente Service_Account e Active_Database

- **Dependency get_odoo_client()**
  - Agora chama `get_active_odoo_db()` para obter banco ativo
  - Usa `ODOO_SERVICE_LOGIN` e `ODOO_SERVICE_PASSWORD`
  - Gerenciamento automático de lifecycle (close no finally)

- **Fluxo de Autenticação**
  - Login valida User_Credentials no Odoo usando Active_Database
  - Cria JWT local com apenas `uid`, `name`, `email`
  - Senha do usuário NUNCA é armazenada
  - Todas as operações pós-login usam Service_Account

#### Frontend
- **App.tsx**
  - Integração do PollingManager com lifecycle de autenticação
  - Escuta evento `database-changed` para reiniciar polling

### Segurança

- Credenciais sensíveis nunca expostas em logs ou respostas HTTP
- Validação de input no backend para todos os endpoints
- Proteção do banco de produção contra seleção acidental
- Mensagens de erro genéricas com request_id para rastreabilidade
- Teste de conexão antes de persistir seleção de banco
- Validação de variáveis de ambiente no startup

### Notas de Migração

**ATENÇÃO:** Esta versão contém breaking changes que requerem atualização de variáveis de ambiente.

#### Checklist de Migração

1. **Atualizar `.env` do backend:**
   ```bash
   # Renomear variáveis
   ODOO_SERVICE_LOGIN=seu_email@exemplo.com
   ODOO_SERVICE_PASSWORD=sua_senha_ou_apikey
   ```

2. **Popular `system_setting` (opcional):**
   ```sql
   INSERT INTO system_setting (key, value, description, updated_at)
   VALUES ('active_odoo_db', 'id-visual-3', 'Banco de dados Odoo ativo', NOW())
   ON CONFLICT (key) DO NOTHING;
   ```

3. **Reiniciar backend:**
   ```bash
   docker compose restart api
   ```

4. **Verificar logs de startup:**
   - Procurar por: `✓ Environment validation passed`

5. **Testar seleção de banco via UI:**
   - Login → Configurações → Integração Odoo
   - Selecionar banco de teste
   - Verificar que ConnectionBadge atualiza

Para mais detalhes, consulte `docs/MIGRATION_GUIDE.md`.

---

## [1.0.0] - 2024-XX-XX

### Adicionado
- Sistema de gestão de lotes de IDs visuais
- Integração com Odoo ERP via JSON-RPC
- Dashboard de IDs visuais
- Portal de produção para solicitações manuais
- Sistema Andon com alertas amarelos/vermelhos
- Analytics MPR com dashboard de produção
- Relatórios customizados via IA
- Autenticação JWT
- Workflow 5S com matriz de tarefas

### Tecnologias
- Backend: FastAPI + SQLModel + PostgreSQL
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- Integração: Odoo ERP (JSON-RPC)
- IA: OpenRouter API

---

## Formato

### Tipos de Mudanças
- `Adicionado` para novas funcionalidades
- `Modificado` para mudanças em funcionalidades existentes
- `Descontinuado` para funcionalidades que serão removidas
- `Removido` para funcionalidades removidas
- `Corrigido` para correções de bugs
- `Segurança` para vulnerabilidades corrigidas

### Versionamento
- **MAJOR** (X.0.0): Breaking changes
- **MINOR** (0.X.0): Novas funcionalidades (backward compatible)
- **PATCH** (0.0.X): Correções de bugs (backward compatible)
