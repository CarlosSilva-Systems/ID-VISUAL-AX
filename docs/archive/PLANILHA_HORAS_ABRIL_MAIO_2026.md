# Planilha de Horas Trabalhadas - ID Visual AX
## Período: 06/04/2026 a 08/05/2026

---

## Semana 1: 06/04 a 10/04

### Segunda 06/04 - 7.5h
**12 commits** - Sistema OTA e Firmware ESP32
- **Reunião semanal**: 1h
- Portal de configuração inicial via AP WiFi
- Correção de timeout no MESH_INIT (15s)
- Aumento de watchdog para 60s
- Fluxo completo de trigger OTA firmware→backend
- Correção de download de firmware do GitHub
- Correção de erros de compilação no ota.cpp
- Ferramentas e documentação para compilação
- Guia de criação de releases no GitHub para OTA

**Horas**: 7.5h

---

### Terça 07/04 - 8.0h
**10 commits** - Sincronização Andon ESP32 ↔ Backend
- LEDs piscam a 70 BPM quando Andon está pausado
- Sincronização de AndonStatus no banco ao pressionar botões físicos
- Correção de restauração de estado após pause/resume
- Mapeamento de estados (inglês e português)
- Envio de estado Andon para ESP32 via MQTT
- Implementação de handlers MQTT bidirecionais
- Correção de sincronização entre firmware e backend

**Horas**: 8.0h

---

### Quarta 08/04 - 7.0h
**7 commits** - Documentação e Regras de Negócio Andon
- Documentação completa do sistema Andon (ANDON_SYSTEM_REFERENCE.md)
- State request respeita pausa ao reiniciar ESP32
- Pausa tem precedência absoluta sobre chamados ativos
- Resolução automática de chamados anteriores
- ESP32 como fonte de verdade absoluta
- Testes de integração e validação de fluxos

**Horas**: 7.0h

---

### Quinta 09/04 - 8.5h
**48 commits** - Gestão Completa de Dispositivos ESP32
- Tela /andon/devices com tabela e cards de resumo
- DeviceDrawer com abas de informações e logs
- Métodos de API para gestão de devices e firmware
- Background task de alerta de device offline
- Refatoração de endpoints com response enriquecida
- PATCH/DELETE por UUID, logs por level
- Persistência de campos de diagnóstico
- Modelo FirmwareVersion e ESPDevice
- Retenção de 500 registros de logs

**Horas**: 8.5h

---

### Sexta 10/04 - 8.5h
**75 commits** - Auditoria UI/UX e Mobile-First
- Remoção de exposição de stack traces
- Validação de timestamp futuro (replay attack)
- Correção de erro 500 (timezone)
- Página Analytics com 7 métricas operacionais
- Dashboard OEE refatorado
- Sistema de design tokens
- Componentes ConfirmModal, SkeletonLoader, EmptyState
- Responsividade mobile-first (5 fases)
- Bottom sheets e touch targets
- Virtualização de listas
- Testes de propriedade com fast-check

**Horas**: 8.5h

**Subtotal Semana 1**: **39.5h**

---

## Semana 2: 13/04 a 17/04

### Segunda 13/04 - 7.5h
**5 commits** - Analytics e Dashboard OEE
- **Reunião semanal**: 1h
- Correção de erro 500 (timezone incompatível)
- Padronização de nomenclatura (Dashboard OEE)
- Página Analytics ID Visual com métricas
- Correção de overflow de números
- Adição de Dashboard OEE ao menu Andon

**Horas**: 7.5h

---

### Terça 14/04 - 8.5h
**21 commits** - Gestão de Lotes e Visualização de Documentos
- Correção de create_batch com banco ativo
- Funcionalidade "Adicionar Fabricações" ao lote
- Registro de rotas MPR Analytics
- Correção de datetime.utcnow deprecated
- Remoção de modelos legados
- Hook useDocViewer compartilhado
- Modal popup com tela cheia e download
- Botão "Docs" na matriz do lote
- Correção de tipos e mapeamentos

**Horas**: 8.5h

---

### Quarta 15/04 - 5.0h
**0 commits** - Pesquisa e Testes
- Testes de integração do sistema de documentos
- Validação de fluxos de lote ativo
- Troubleshooting de issues em produção
- Pesquisa de otimizações de performance
- Planejamento de implementação de cache

**Horas**: 5.0h

---

### Quinta 16/04 - 8.5h
**57 commits** - WebSocket Tempo Real e Cache
- Documentação de otimizações Odoo
- Endpoint de diagnóstico de performance
- Cache de 5min no endpoint /mos (limit 200)
- Cache de 30s no endpoint /workcenters (limit 500)
- Sistema de cache em memória com TTL
- Endpoint WebSocket /andon/ws
- Broadcast andon_version_changed
- Indicador de tempo real no header
- Contador atômico incremental
- Correção de TTS no Chrome
- Query robusta para IDRequests

**Horas**: 8.5h

---

### Sexta 17/04 - 7.0h
**8 commits** - Correções Andon TV
- Remoção de lógica de ajuste de índice
- Correção de loop infinito no carrossel
- Correção de pulo de painéis
- Simplificação da lógica do carrossel
- Correção de travamento
- Correção de filtro de MOs
- Script para limpar pedidos de teste

**Horas**: 7.0h

**Subtotal Semana 2**: **36.5h**

---

## Semana 3: 20/04 a 24/04

### Segunda 20/04 - 7.5h
**15 commits** - Melhorias Andon TV e Sincronização
- **Reunião semanal**: 1h
- Substituição de workcenter_name por operator_name
- Resolução de operator_name no backend
- Uso de operator_name do Odoo
- Priorização de nome do operador
- Correção de cast de enum loglevel
- Mapeamento de product_name
- Adição de campo product_name
- Sincronização Odoo para buscar product_name

**Horas**: 7.5h

---

### Terça 21/04 - 0h
**FERIADO - Tiradentes**

**Horas**: 0h

---

### Quarta 22/04 - 5.0h
**3 commits** - Correções e Planejamento
- Correção de proxy do Vite
- Remoção de espaços em branco no index.html
- Atualização de tasks.md
- Planejamento de sistema de impressão Zebra
- Pesquisa de bibliotecas ZPL

**Horas**: 5.0h

---

### Quinta 23/04 - 8.5h
**26 commits** - Sistema de Impressão Zebra
- Busca de URL pública do Odoo (access_token)
- Uso de URL pública no QR code
- Endpoint resync-mo-fields
- Busca automática de PDF
- Pré-preenchimento de campos
- Botão "Imprimir" no MatrixTable
- Guia de configuração Zebra
- Seed de configurações
- PrintLabelDrawer com formulário
- Endpoint POST /id-visual/print/labels
- Templates ZPL
- Cliente TCP ZebraPrinter
- Campo ax_code e propriedade fab_code

**Horas**: 8.5h

---

### Sexta 24/04 - 8.5h
**26 commits** - Etiquetas EPLAN e Fila de Impressão
- LabelsDrawer com 4 abas
- 33 testes para renderização
- render_device_labels, render_door_label, render_terminal_labels
- Endpoints /eplan/import/devices e /terminals
- Parsing openpyxl e upsert
- Modelos DeviceLabel, DoorLabel, TerminalLabel
- Hook usePrintJobStatus
- Print Agent com polling TCP
- Endpoints de fila com autenticação
- Modelos Printer e PrintJob

**Horas**: 8.5h

**Subtotal Semana 3**: **30.0h**

---

## Semana 4: 28/04 a 30/04

### Terça 28/04 - 8.0h
**19 commits** - Correções OTA e UX
- Correção de erro 500 no schema eplan
- Correção de button-in-button
- Reescrita de FloatingDocViewer
- Aceitação de odoo_id inteiro
- Correção de redirect Docker
- Troubleshooting e instruções urgentes
- Integração de floating viewer
- Documentação de melhorias
- Sistema de presets para adesivos
- Editor manual para componentes
- Endpoints de criação manual

**Horas**: 8.0h

---

### Quarta 29/04 - 8.5h
**30 commits** - Refatoração de Arquitetura
- Correção de conflito de rotas OTA
- Correção de get_fleet_status
- Remoção de filtro exclusivo de online
- Correção de enum DeviceStatus
- Correção de animação identify-pulse
- Botão de identificação manual
- Correção de publishButtonEvent
- Card pisca em verde (device_identify)
- Identificação física por hold (3s)
- Correção de ícone IoT
- Select de mesas (substituiu texto livre)
- Busca parcial por número
- Fase 5: enfileira resume_workorder
- Fase 4: sync_service completo
- Fase 3: cache com TTL
- Fase 2: odoo_mo_id
- Fase 1: limpeza cirúrgica

**Horas**: 8.5h

---

### Quinta 30/04 - 7.5h
**14 commits** - Documentação OTA
- Instruções detalhadas dos próximos passos
- Guia completo de troubleshooting
- Expansão de endpoint de diagnóstico
- Correção de URL do firmware
- Subscrição aos tópicos MQTT de OTA
- Instruções urgentes de reinicialização
- Atualização de binário andon_v1.0.0.bin
- Correção de erro 404
- Correção de erros de compilação OTA
- Guia completo de atualização OTA
- Resumo executivo da correção
- Documentação completa
- Processamento de mensagens OTA
- Correção de validação do modal

**Horas**: 7.5h

**Subtotal Semana 4**: **24.0h**

---

## Semana 5: 04/05 a 08/05

### Segunda 04/05 - 7.5h
**15 commits** - Segurança e Autenticação
- **Reunião semanal**: 1h
- Resumo executivo de correções de segurança
- Atualização de .env.example (MQTT)
- Rate limiting no /ota/trigger
- Suporte a autenticação MQTT
- Validação de domain no OdooClient
- Bloqueio de startup com secrets inseguros
- Auditoria pré-produção
- Botão "Finalizar Lote" condicional
- Correção de TTS cortado
- Fechamento Odoo em bulk-complete
- Correção de bulk-complete
- Botão "Marcar como Concluído"
- Estratégia de deployment Docker

**Horas**: 7.5h

---

### Terça 05/05 - 8.0h
**13 commits** - Autenticação Híbrida e RBAC
- Correção de payload de criação de usuário
- Correção de bug de cursor
- Liberação de acesso /admin
- Exposição de gestão de usuários
- Otimização de polling (evitar 429)
- Limpeza de estado de pausa manual
- Renomeação de status amarelo
- Normalização de botões
- Correção de login local
- Correção de case-sensitivity de roles
- Interface de gestão de acessos
- Lógica centralizada de RBAC

**Horas**: 8.0h

---

### Quarta 06/05 - 8.5h
**27 commits** - Categorias de Produto e Otimizações
- Suporte a labels de categoria
- Restrição de acesso a configurações
- Correção de erro JSX
- Badge de categoria no dashboard
- product_category_label nos schemas
- Sincronização de categoria do Odoo
- Mapeamento de categorias
- Migração product_category_id
- Correção de cache quebrada
- Silenciamento de logs em produção
- Autocomplete nos campos de login
- Consolidação de indicadores
- formatDate centralizado
- Otimização de bundle
- Melhoria de seleção de voz TTS
- Aumento de rate limit
- share_token embutido
- Força atualização de fila
- Correção de cache de MOs
- Priorização de voz neural
- Busca de anexos diretos
- Correção de invalidação de cache
- Correção de loop infinito

**Horas**: 8.5h

---

### Quinta 07/05 - 8.5h
**26 commits** - CI/CD Completo e Deploy
- Badge de categoria de produto
- product_category_label na view
- Correção de URL WebSocket
- Redução de workers Uvicorn (1)
- Correção de WebSocket em componentes
- getWebSocketUrl para URL relativa
- Atualização de MQTT_BROKER (produção)
- Bump v2.4.1
- Força disparo do pipeline
- Correção de mapeamento porta 80
- Inclusão de pasta scripts/
- Desabilitação de cache index.html
- Node.js 24 nas GitHub Actions
- Correção de lookup .env
- Self-hosted runner
- Script de deploy manual
- Workflow de CD com GHCR
- docker-compose.ci.yml
- Frontend com Nginx
- Multi-stage build backend
- Script de instalação Docker
- Documentação TXT puro
- Documentação consolidada
- Documento de entrega final

**Horas**: 8.5h

---

### Sexta 08/05 - 6.0h
**6 commits** - Organização Final
- Remoção de arquivos temporários
- Reorganização da documentação
- Revisão final de documentação técnica
- Validação de builds de produção
- Testes de deploy em staging
- Preparação de entrega final

**Horas**: 6.0h

**Subtotal Semana 5**: **38.5h**

---

## Resumo Geral

### Total de Horas por Semana
| Semana | Período | Dias Úteis | Horas |
|--------|---------|------------|-------|
| 1 | 06-10/04 | 5 | 39.5h |
| 2 | 13-17/04 | 5 | 36.5h |
| 3 | 20-24/04 | 4 | 30.0h |
| 4 | 28-30/04 | 3 | 24.0h |
| 5 | 04-08/05 | 5 | 38.5h |

### Totais Consolidados
- **Total de horas trabalhadas**: **168.5h**
- **Total de dias úteis**: 22 dias
- **Média de horas/dia**: **7.7h**
- **Feriados**: 1 dia (21/04 - Tiradentes)
- **Reuniões semanais**: 5h (5 segundas × 1h)

---

**Planilha gerada em**: 20/05/2026  
**Responsável**: Carlo  
**Projeto**: ID Visual AX v2.4.1
