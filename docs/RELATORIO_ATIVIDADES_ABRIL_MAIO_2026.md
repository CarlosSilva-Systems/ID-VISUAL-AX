# Relatório de Atividades - ID Visual AX
## Período: 04/04/2026 a 20/05/2026

---

## Semana 1: 06/04 a 10/04 - Infraestrutura de Segurança e Gestão de Dispositivos IoT

### Resumo Executivo
Implementação de camada de segurança enterprise, sistema de autenticação híbrida (Odoo + local), gestão completa de dispositivos ESP32 com OTA, e dashboard OEE para monitoramento de eficiência operacional.

### Principais Entregas

#### 1. Sistema de Autenticação Híbrida e RBAC
- Autenticação dual: Odoo (SSO) + usuários locais com PBKDF2
- Sistema de controle de acesso baseado em roles (RBAC)
- Interface de gestão de usuários e permissões
- Script de provisionamento de usuários locais
- Restrições de menu por perfil (Produção, Gerência, Admin)

#### 2. Auditoria de Segurança Pre-Produção
- Bloqueio de startup com secrets inseguros em produção
- Validação de domínio e timeout no OdooClient
- Autenticação MQTT com credenciais
- Rate limiting no endpoint `/ota/trigger`
- Remoção de exposição de stack traces e dados sensíveis

#### 3. Gestão Avançada de Dispositivos ESP32 (Fase 2)
- Tela `/andon/devices` com tabela, cards de resumo e drawer detalhado
- Abas de informações e logs por dispositivo
- Restart remoto via MQTT com ACK e animação de LEDs
- Identificação física por hold do botão verde (3s)
- Badge WiFi/Mesh para identificar tipo de conexão
- Detecção de heap baixo e alertas de dispositivos offline

#### 4. Dashboard OEE/Eficiência Andon
- Cálculos de disponibilidade, MTTR e MTBF
- Gráficos de tendência e tabela de workcenters
- Modal de justificativa de paradas
- Filtros por período e workcenter
- Modelo `AndonSettings` para configurações de limiar

#### 5. Auditoria UI/UX Enterprise
- Sistema de design tokens (sombras, radius, tipografia)
- Componentes `ConfirmModal`, `SkeletonLoader`, `EmptyState`
- Skeleton loaders em dashboard, andon-grid e páginas
- Substituição de `window.confirm()` por modais acessíveis
- Testes de propriedade com `fast-check`

#### 6. Responsividade Mobile-First
- Utilitários CSS globais e hooks de responsividade
- Componentes primitivos: `BottomSheet`, `ActionMenu`, `FilterBar`
- Layout responsivo com sidebar, topbar e touch targets (44px)
- Card view mobile para dashboard, solicitações, devices
- Virtualização de listas com `@tanstack/react-virtual` (threshold 50 itens)
- Bottom sheets para modais em mobile

#### 7. Melhorias no Sistema Andon
- Ciclo de justificativa de paradas (Fase 1)
- Tela `/andon/pendencias` com filtros e tabela
- Badge de pendências no menu lateral
- Enriquecimento de pendências com responsável e tipo de montagem
- Coluna "Fabricação" nas pendências
- Registro de downtime e WebSocket de justificativa

#### 8. Otimizações de Performance
- Cache em memória com TTL para endpoints Odoo
- Paralelização de chamadas Odoo (schemas + documentos)
- Cache de 5min no endpoint `/mos` (limit 200)
- Cache de 30s no endpoint `/workcenters` (limit 500)
- Endpoint de diagnóstico de performance Odoo

### Commits Técnicos
- 98 commits no período
- Principais áreas: segurança (12), IoT (18), UI/UX (22), performance (8), Andon (15)

---

## Semana 2: 13/04 a 17/04 - Sincronização Andon e Otimizações de Cache

### Resumo Executivo
Resolução de bugs críticos de sincronização entre ESP32 e backend, implementação de WebSocket para tempo real, otimizações de cache e melhorias na experiência do Andon TV.

### Principais Entregas

#### 1. Sincronização Andon ESP32 ↔ Backend
- ESP32 como fonte de verdade absoluta para estado Andon
- Sincronização de `AndonStatus` no banco ao pressionar botões físicos
- Envio de estado Andon para ESP32 via MQTT em todas as mudanças
- Pausa tem precedência absoluta sobre chamados ativos
- State request respeita pausa ao reiniciar ESP32
- Resolução automática de chamados anteriores ao criar novo

#### 2. Sistema de LEDs e Feedback Visual
- LEDs piscam a 70 BPM quando Andon está pausado (GRAY)
- Blink amarelo rápido para ESP32 não vinculado
- Limpeza de LEDs ao perder WiFi ou MQTT em OPERATIONAL
- Documentação completa de sequências de LED no `ANDON_SYSTEM_REFERENCE.md`
- Blink de nó-folha mesh para identificação

#### 3. WebSocket e Tempo Real no Andon TV
- Endpoint WebSocket `/andon/ws` para notificações em tempo real
- Broadcast `andon_version_changed` ao incrementar versão
- Indicador de tempo real no header quando WebSocket ativo
- Fallback de polling a cada 8s se WebSocket falhar
- Contador atômico incremental para `andon_version` (elimina colisão de timestamps)

#### 4. Otimizações de Cache e Performance
- Remoção de chamada ao Odoo do endpoint `tv-data` (reduziu 2-5s por request)
- Fetch forçado pelo WebSocket não bloqueado pelo polling
- Cache-Control no-store no endpoint `tv-data`
- Meta tags Cache-Control no `index.html`
- Timestamp na URL do `tv-data` para evitar cache do browser

#### 5. Melhorias no Andon TV
- Correção de loop infinito que impedia rotação do carrossel
- Simplificação da lógica do carrossel e aumento do tempo de exibição
- Correção de travamento durante mudanças dinâmicas de painéis
- TTS pt-BR com fallback para voz offline
- Expiração de 24h e blinking de 5min em eventos

#### 6. Gestão de Fabricações e Solicitações
- Funcionalidade "Adicionar Fabricações" ao lote ativo
- Correção de `create_batch` com banco ativo e datetime correto
- Busca parcial por número de MO e correção de race condition
- Select de mesas no formulário de nova solicitação (substituiu texto livre)
- Ordenação alfabética de mesas no select de solicitante

#### 7. Visualização de Documentos
- Hook `useDocViewer` compartilhado para visualização de documentos
- Documento abre em modal popup com tela cheia, download e nova aba
- Botão "Docs" por fabricação na matriz do lote ativo
- Botão de preview de documentos no `DrawerCaixinha`
- Cache em memória por `product_id` no endpoint de listagem

### Commits Técnicos
- 67 commits no período
- Principais áreas: sincronização Andon (15), WebSocket (8), cache (10), UI (12)

---

## Semana 3: 20/04 a 24/04 - Sistema de Impressão Zebra e Etiquetas EPLAN

### Resumo Executivo
Implementação completa do sistema de impressão de etiquetas Zebra, integração com EPLAN para etiquetas de componentes, portas e terminais, e sistema de fila de impressão com agente dedicado.

### Principais Entregas

#### 1. Sistema de Impressão Zebra
- Cliente TCP assíncrono `ZebraPrinter` com exceção customizada
- Templates ZPL: `render_technical_label` e `render_external_label`
- Endpoint `POST /id-visual/print/labels` para impressão
- Testes unitários para renderização dos templates ZPL
- Schemas `PrintLabelRequest` e `PrintLabelResponse`

#### 2. Fila de Impressão e Print Agent
- Modelos `Printer` e `PrintJob` com ciclo de vida completo
- Endpoints de fila com autenticação `X-Agent-Key`
- Polling `SELECT FOR UPDATE SKIP LOCKED` para concorrência
- Print Agent com loop de polling TCP e shutdown gracioso
- Retry logic e endpoints de frontend para status de jobs
- Hook `usePrintJobStatus` com polling de 2s e parada automática

#### 3. Componentes de Impressão no Frontend
- `PrintLabelDrawer` com select de impressora, fila de jobs e status em tempo real
- Pré-preenchimento automático de `ax_code`, `nome_quadro` e `fab_code`
- Busca automática da URL do primeiro PDF ao abrir o drawer
- Botão "Imprimir" no `LoteDoDia` e `MatrixTable`
- Script de seed idempotente para configurações da impressora Zebra

#### 4. Sistema de Etiquetas EPLAN
- Modelos: `DeviceLabel` (210-805), `DoorLabel` (210-855), `TerminalLabel` (2009-110)
- Endpoints de importação: `POST /eplan/import/devices` e `/terminals`
- Parsing de Excel com `openpyxl` e upsert por `device_tag` e `terminal_number`
- Endpoints de listagem e exclusão: `GET` e `DELETE /eplan/{mo_id}/devices` e `/terminals`
- Serviços de renderização: `render_device_labels`, `render_door_label`, `render_terminal_labels`
- 33 testes para os serviços de renderização

#### 5. Interface de Etiquetas no Frontend
- `LabelsDrawer` com 4 abas (210-804, 210-805, 210-855, 2009-110)
- Substituição de `PrintLabelDrawer` por `LabelsDrawer` no `ActiveBatch`
- Editor manual para adesivos de componente (210-805)
- Sistema de presets para adesivos de porta (210-855)
- Floating Viewer para documentos com UX profissional

#### 6. Sincronização de Dados Odoo
- Campo `ax_code` (código AX do produto) em `ManufacturingOrder`
- Propriedade `fab_code` calculada (formato `WH/FAB/XXXXX`)
- Busca de `default_code` do produto no Odoo durante snapshot da MO
- Endpoint `POST /id-visual/resync-mo-fields` para popular campos em MOs existentes
- Exposição de `ax_code` e `fab_code` no response da matrix do lote

### Commits Técnicos
- 45 commits no período
- Principais áreas: impressão Zebra (18), EPLAN (15), frontend (12)

---

## Semana 4: 28/04 a 30/04 - Sistema OTA e Troubleshooting

### Resumo Executivo
Correção completa do sistema OTA (Over-The-Air) para atualização de firmware ESP32, troubleshooting de bugs críticos, e documentação detalhada do processo.

### Principais Entregas

#### 1. Correção do Sistema OTA
- Correção de URL do firmware para dispositivos ESP32
- Subscrição aos tópicos MQTT de OTA no firmware
- Processamento de mensagens OTA no callback MQTT
- Correção de `get_fleet_status` que não retornava devices sem histórico OTA
- Remoção de filtro exclusivo de online no trigger OTA
- Correção de comparação de enum `DeviceStatus` no filtro de dispositivos online

#### 2. Troubleshooting e Diagnóstico
- Endpoint de diagnóstico expandido com informações detalhadas
- Correção de erro 404 no endpoint OTA devices count
- Correção de conflito de rotas e erro 500 ao deletar device
- Correção de validação e mensagens do modal de confirmação OTA
- Guia completo de troubleshooting com 8 cenários comuns

#### 3. Documentação OTA
- Guia completo de atualização OTA com 6 etapas
- Resumo executivo da correção OTA
- Documentação completa da correção de "devices não encontrados"
- Instruções urgentes de reinicialização
- Instruções detalhadas dos próximos passos

#### 4. Compilação e Build do Firmware
- Atualização do binário `andon_v1.0.0.bin` com última versão compilada
- Correção de erros de compilação do sistema OTA
- Ferramentas e documentação para compilação de firmware
- Guia de criação de releases no GitHub para OTA

### Commits Técnicos
- 18 commits no período
- Principais áreas: OTA (12), troubleshooting (4), documentação (2)

---

## Semana 5: 04/05 a 08/05 - Seleção Dinâmica de Banco Odoo e Deploy CI/CD

### Resumo Executivo
Implementação de seleção dinâmica de banco de dados Odoo, pipeline completo de CI/CD com GitHub Actions, e melhorias na experiência de produção.

### Principais Entregas

#### 1. Seleção Dinâmica de Banco Odoo
- Componente `DatabaseSelector` com dropdown de bancos disponíveis
- Endpoint `GET /odoo/databases` para listar bancos do Odoo
- Endpoint `POST /odoo/set-active-database` para trocar banco ativo
- Script `migrate_active_database.py` para migrar banco ativo
- Invalidação de cache ao trocar banco
- Guia de migração (`MIGRATION_GUIDE.md`)

#### 2. Pipeline CI/CD Completo
- Workflow de CD com build GHCR e deploy SSH automático
- Self-hosted runner no servidor de produção
- Multi-stage build do backend usando `uv`
- Frontend com build de produção e Nginx
- `docker-compose.ci.yml` com imagens GHCR
- Script de deploy manual de emergência
- Script de instalação automática do Docker no Ubuntu

#### 3. Otimizações de Produção
- Redução de workers Uvicorn para 1 (compatibilidade WebSocket)
- Correção de URL WebSocket em todos os componentes
- Utilitário `getWebSocketUrl` para URL relativa
- Desabilitação de cache do `index.html` no Nginx
- Inclusão da pasta `scripts/` no container do backend
- Força novo disparo do pipeline com Node.js 24

#### 4. Melhorias no Sistema de Produção
- Campo `product_name` em `ManufacturingOrder`
- Sincronização de `product_name` do Odoo
- Exibição de `product_name` junto com `mo_number` em toda UI
- Campo `product_category_id` e mapeamento de categorias
- Badge de categoria do produto no dashboard
- Restrição de acesso ao módulo de configurações (perfil gerência)

#### 5. Correções de Bugs e UX
- Correção de erro de sintaxe JSX no componente Solicitações
- Correção de chave de cache quebrada no endpoint de workcenters
- Silenciamento de logs de métricas em produção
- Autocomplete nos campos de login
- Consolidação de indicadores na sidebar
- Utilização de `formatDate` centralizado

#### 6. Melhorias no Andon
- Priorização de voz neural online no TTS com fallback
- Correção de cache de MOs para não armazenar resultados vazios
- Força atualização imediata da fila após transferência de ID manual
- Correção de ausência de invalidação de cache ao transferir IDs
- Correção de loop infinito no fallback de rotas para perfil produção

### Commits Técnicos
- 52 commits no período
- Principais áreas: CI/CD (12), banco dinâmico (8), produção (15), UX (10)

---

## Semana 6: 06/05 a 08/05 - Documentação e Organização Final

### Resumo Executivo
Consolidação da documentação técnica, reorganização da estrutura de pastas, e preparação para entrega final do sistema.

### Principais Entregas

#### 1. Documentação Completa do Sistema
- `DOCUMENTACAO_COMPLETA.txt` consolidada (formato TXT puro para Odoo)
- Documentação completa do sistema Andon ESP32
- Resumo executivo da documentação
- Guia rápido de referência
- Documento de entrega final
- Documentação em formato texto puro para firmware

#### 2. Reorganização da Estrutura
- Reorganização da documentação para estrutura de pastas padrão
- Remoção de arquivos de diagnóstico e solução temporários obsoletos
- Limpeza de arquivos de documentação duplicados

### Commits Técnicos
- 6 commits no período
- Principais áreas: documentação (5), organização (1)

---

## Resumo Geral do Período

### Estatísticas
- **Total de commits**: 286 commits
- **Período**: 04/04/2026 a 08/05/2026 (34 dias úteis)
- **Média**: 8,4 commits/dia

### Principais Conquistas

1. **Segurança Enterprise**: Autenticação híbrida, RBAC, auditoria de segurança
2. **Gestão IoT Completa**: Dispositivos ESP32, OTA, restart remoto, identificação física
3. **Sistema de Impressão**: Zebra, EPLAN, fila de impressão, Print Agent
4. **Dashboard OEE**: Métricas de eficiência, MTTR, MTBF, justificativa de paradas
5. **Responsividade Mobile**: Bottom sheets, touch targets, virtualização de listas
6. **CI/CD Completo**: GitHub Actions, GHCR, deploy automático
7. **Seleção Dinâmica de Banco**: Troca de banco Odoo em tempo real
8. **Sincronização Andon**: ESP32 ↔ Backend, WebSocket, tempo real

### Tecnologias e Ferramentas Utilizadas

#### Backend
- FastAPI, SQLModel, PostgreSQL, Alembic
- Celery, Redis, MQTT (Mosquitto)
- OpenAI SDK (OpenRouter), Odoo JSON-RPC
- `uv` (package manager), `pytest`, `hypothesis`

#### Frontend
- React 18, TypeScript, Vite 6
- Tailwind CSS v4, MUI v7, Radix UI
- React Router v7, Recharts, Sonner
- `@tanstack/react-virtual`, `fast-check`

#### Infraestrutura
- Docker Compose, GitHub Actions, GHCR
- Nginx, Self-hosted runner
- ESP32 (Arduino, ESP-MESH, OTA)

### Próximos Passos Sugeridos

1. **Testes de Carga**: Validar performance com 100+ dispositivos ESP32
2. **Monitoramento**: Implementar Prometheus + Grafana para métricas
3. **Backup Automatizado**: Rotina de backup do PostgreSQL
4. **Documentação de API**: Swagger/OpenAPI completo
5. **Treinamento de Usuários**: Manuais operacionais e vídeos tutoriais

---

**Documento gerado em**: 20/05/2026  
**Responsável**: Carlo (Engenheiro de Software Sênior)  
**Projeto**: ID Visual AX v2.4.1
