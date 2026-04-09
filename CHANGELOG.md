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

- **OTA (Over-The-Air) Management**
  - Modelos de dados: `FirmwareRelease`, `OTAUpdateLog` com enums e validações
  - Migration Alembic para tabelas `firmware_releases` e `ota_update_logs`
  - Integração com GitHub Releases API para download automático de firmware
  - Cliente GitHub (`GitHubClient`) com streaming de download e validação de tamanho
  - Serviço OTA (`OTAService`) com lógica de negócio completa
  - Endpoints REST:
    - `GET /api/v1/ota/firmware/releases` - Listar versões disponíveis
    - `POST /api/v1/ota/firmware/check-github` - Verificar nova versão no GitHub
    - `POST /api/v1/ota/firmware/download-github` - Baixar firmware do GitHub
    - `POST /api/v1/ota/firmware/upload` - Upload manual de firmware
    - `POST /api/v1/ota/trigger` - Disparar atualização OTA em massa
    - `GET /api/v1/ota/status` - Status de atualização de todos os dispositivos
    - `GET /api/v1/ota/history/{mac}` - Histórico de atualizações por dispositivo
    - `DELETE /api/v1/ota/firmware/{release_id}` - Deletar firmware release
  - Hospedagem estática de firmware via `/static/ota/` (HTTP puro, sem SSL)
  - Handler MQTT para progresso OTA no tópico `andon/ota/progress/#`
  - Publicação MQTT de comandos OTA no tópico `andon/ota/trigger`
  - Broadcast WebSocket de eventos OTA (`ota_triggered`, `ota_progress`)
  - Validações de segurança: extensão .bin, tamanho 100KB-2MB, formato de versão X.Y.Z
  - Proteção contra path traversal em nomes de arquivo
  - Rate limiting no endpoint de trigger (1 req/segundo)
  - Auditoria completa com username e timestamp em todos os logs

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

- **Melhorias na Tela de Pendências Andon**
  - Endpoint `/calls/pending-justification` agora retorna campos enriquecidos do Odoo:
    - `owner_name`: Nome do responsável pela mesa (extraído do campo `user_id` da Work Order)
    - `work_type`: Tipo de montagem em execução (extraído do campo `name` da Work Order)
  - Lógica de enriquecimento com priorização de Work Orders em progresso
  - Parsing inteligente de tipos de montagem: "Pré Montagem", "Completo", "Montagem"
  - Fallback para "—" quando dados do Odoo não estão disponíveis
  - Tratamento robusto de erros sem interromper funcionalidade principal

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

- **Melhorias na Tela de Pendências Andon**
  - Cabeçalho de grupos agora exibe:
    - Nome do responsável pela mesa (com ícone de usuário 👤)
    - Tipo de montagem em execução (com ícone de ferramenta 🔧)
  - Nova coluna "Tipo" na tabela de paradas expandida
  - Coluna posicionada entre "Responsável" e "Parou às"
  - Exibição de "—" quando dados não estão disponíveis
  - Interface TypeScript atualizada com campos `owner_name` e `work_type`

- **OTA Management UI**
  - Componente `OTASettings` - Aba de gerenciamento de firmware em Configurações
    - Card de "Versão Atual da Frota" com cálculo automático
    - Card de "Nova Versão Disponível" quando há update no GitHub
    - Botão "Verificar GitHub" para buscar novas versões
    - Botão "Upload Manual" para upload de firmware .bin
    - Tabela de versões disponíveis com origem, tamanho e contagem de dispositivos
    - Botão "Atualizar Todos" por versão
  - Componente `OTAUploadModal` - Modal de upload manual
    - Input de arquivo (.bin, 100KB-2MB)
    - Input de versão (formato X.Y.Z)
    - Validação de extensão, tamanho e formato
    - Barra de progresso durante upload
    - Toast de sucesso/erro
  - Componente `OTAConfirmModal` - Modal de confirmação de atualização
    - Ícone de alerta
    - Mensagem com quantidade de dispositivos e versão
    - Botões Cancelar e Confirmar
    - Navegação automática para dashboard de progresso
  - Componente `OTAProgressDashboard` - Dashboard de progresso em tempo real
    - Cabeçalho com versão alvo
    - Contadores: Concluídos, Em Progresso, Falharam, Total
    - Lista de dispositivos agrupada (Gateways e Nós)
    - Ícones de status coloridos (🟢🟡🔴⚪)
    - Barras de progresso com animação de pulso
    - Atualização em tempo real via WebSocket
    - Botão "Fechar" quando todos os dispositivos terminarem
  - API Client estendido com métodos OTA:
    - `getFirmwareReleases()`, `checkGitHub()`, `downloadFromGitHub()`
    - `uploadFirmware()`, `triggerOTAUpdate()`, `getOTAStatus()`, `getOTAHistory()`

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
  - Rota `/admin/ota-progress` para dashboard de progresso OTA

#### Hardware (Firmware ESP32)
- **OTA (Over-The-Air) Updates**
  - Subscrição ao tópico MQTT `andon/ota/trigger`
  - Handler `handleOTATrigger()` para processar comandos OTA
  - Validação de versão (ignora se já está na versão solicitada)
  - Delay aleatório de 0-60s antes de download (evita sobrecarga em rede Mesh)
  - Download de firmware via HTTP com progresso reportado a cada 10%
  - Publicação de progresso no tópico `andon/ota/progress/{mac}`
  - Instalação de firmware na OTA partition
  - Reboot automático após instalação
  - Validação de boot bem-sucedido
  - Rollback automático se novo firmware falhar
  - Timeout de download de 5 minutos
  - Constante `FIRMWARE_VERSION` para identificação de versão

#### Documentação
- README.md do backend atualizado com:
  - Documentação de novos endpoints
  - Arquitetura de banco de dados ativo
  - Fluxo de autenticação detalhado
  - Seção completa de OTA Management com endpoints, tópicos MQTT e troubleshooting
  - Guia de troubleshooting
- README.md do hardware atualizado com:
  - Documentação completa de OTA
  - Tópicos MQTT de OTA
  - Fluxo de atualização OTA
  - Segurança e resiliência
  - Logs esperados
  - Guia de teste OTA
- Guia de migração (`docs/MIGRATION_GUIDE.md`) criado
- CHANGELOG.md atualizado com todas as mudanças

### Modificado

#### Backend
- **Variáveis de Ambiente (BREAKING CHANGE)**
  - `ODOO_LOGIN` → `ODOO_SERVICE_LOGIN`
  - `ODOO_PASSWORD` → `ODOO_SERVICE_PASSWORD`
  - `ODOO_DB` agora é apenas fallback de emergência
  - Adicionadas variáveis OTA:
    - `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_TOKEN` (opcional)
    - `OTA_STORAGE_PATH` (caminho de armazenamento de firmware)
    - `BACKEND_HOST` (host para construção de URLs de firmware)

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

- **MQTT Service**
  - Estendido com handler de progresso OTA (`_handle_ota_progress`)
  - Subscrição ao tópico `andon/ota/progress/#`
  - Atualização de `OTAUpdateLog` ao receber mensagens de progresso
  - Broadcast de eventos WebSocket `ota_progress`

#### Frontend
- **App.tsx**
  - Integração do PollingManager com lifecycle de autenticação
  - Escuta evento `database-changed` para reiniciar polling
  - Rota para dashboard de progresso OTA

- **Configuracoes.tsx**
  - Nova aba "Atualizações" com componente `OTASettings`

### Segurança

- Credenciais sensíveis nunca expostas em logs ou respostas HTTP
- Validação de input no backend para todos os endpoints
- Proteção do banco de produção contra seleção acidental
- Mensagens de erro genéricas com request_id para rastreabilidade
- Teste de conexão antes de persistir seleção de banco
- Validação de variáveis de ambiente no startup
- **OTA Security**:
  - Validação de extensão .bin e tamanho 100KB-2MB
  - Proteção contra path traversal em nomes de arquivo
  - Validação de formato de versão semântica (X.Y.Z)
  - Rate limiting no endpoint de trigger (1 req/segundo)
  - Auditoria completa com username e timestamp
  - Rollback automático no ESP32 se firmware falhar

### Notas de Migração

**ATENÇÃO:** Esta versão contém breaking changes que requerem atualização de variáveis de ambiente.

#### Checklist de Migração

1. **Atualizar `.env` do backend:**
   ```bash
   # Renomear variáveis
   ODOO_SERVICE_LOGIN=seu_email@exemplo.com
   ODOO_SERVICE_PASSWORD=sua_senha_ou_apikey
   
   # Adicionar variáveis OTA (opcional para GitHub integration)
   GITHUB_REPO_OWNER=
   GITHUB_REPO_NAME=
   GITHUB_TOKEN=
   OTA_STORAGE_PATH=/app/storage/ota/firmware
   BACKEND_HOST=localhost:8000
   ```

2. **Popular `system_setting` (opcional):**
   ```sql
   INSERT INTO system_setting (key, value, description, updated_at)
   VALUES ('active_odoo_db', 'id-visual-3', 'Banco de dados Odoo ativo', NOW())
   ON CONFLICT (key) DO NOTHING;
   ```

3. **Executar migrations:**
   ```bash
   cd backend
   alembic upgrade head
   ```

4. **Reiniciar backend:**
   ```bash
   docker compose restart api
   ```

5. **Verificar logs de startup:**
   - Procurar por: `✓ Environment validation passed`

6. **Testar seleção de banco via UI:**
   - Login → Configurações → Integração Odoo
   - Selecionar banco de teste
   - Verificar que ConnectionBadge atualiza

7. **Testar OTA Management:**
   - Login → Configurações → Atualizações
   - Fazer upload manual de firmware ou verificar GitHub
   - Disparar atualização OTA e monitorar progresso

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
