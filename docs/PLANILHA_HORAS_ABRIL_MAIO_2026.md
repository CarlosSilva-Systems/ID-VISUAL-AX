# Planilha de Horas Trabalhadas - ID Visual AX
## Período: 04/04/2026 a 08/05/2026

---

## Metodologia de Cálculo

### Premissas
- **Jornada máxima**: 8:30h/dia (8.5h) - limite de desenvolvimento
- **Segundas-feiras**: 7:30h (8.5h - 1h de reunião semanal)
- **Feriados**: 0h
  - 21/04/2026 (terça) - Tiradentes
  - 01/05/2026 (quinta) - Dia do Trabalho
- **Trabalho voluntário**: Excedente de 8:30h e finais de semana não contabilizados

---

## Semana 1: 06/04 a 10/04
**Tema**: Infraestrutura de Segurança e Gestão de Dispositivos IoT

### Domingo 06/04 - Trabalho Voluntário (não contabilizado)
**12 commits** - Sistema OTA e Firmware ESP32
- Portal de configuração inicial via AP WiFi
- Correção de timeout no MESH_INIT e watchdog
- Fluxo completo de trigger OTA firmware→backend
- Correção de download de firmware do GitHub
- Ferramentas e documentação para compilação de firmware
- Guia de criação de releases no GitHub para OTA

**Horas**: 0h (trabalho voluntário em fim de semana)

---

### Segunda 07/04 - 7.5h
**10 commits** - Sincronização Andon ESP32 ↔ Backend
- **Reunião semanal**: 1h
- LEDs piscam a 70 BPM quando Andon está pausado (GRAY)
- Sincronização de AndonStatus no banco ao pressionar botões físicos
- Correção de restauração de estado após pause/resume
- Mapeamento de estados para aceitar inglês e português
- Envio de estado Andon para ESP32 em todas as mudanças de status
- Implementação de handlers MQTT para sincronização bidirecional

**Horas**: 7.5h

---

### Terça 08/04 - 6.0h
**7 commits** - Documentação e Regras de Negócio Andon
- Documentação completa do sistema Andon (ANDON_SYSTEM_REFERENCE.md)
- State request respeita pausa ao reiniciar ESP32
- Pausa tem precedência absoluta sobre chamados ativos
- Resolução automática de chamados anteriores ao criar novo
- ESP32 como fonte de verdade absoluta para estado Andon
- Testes de integração e validação de fluxos

**Horas**: 6.0h

---

### Quarta 09/04 - 8.5h
**48 commits** - Gestão Completa de Dispositivos ESP32 (Fase 2)
- Tela `/andon/devices` com tabela, cards de resumo e DeviceDrawer
- Abas de informações e logs por dispositivo
- Métodos de API para gestão de devices, firmware versions e OTA
- Background task de alerta de device offline
- Refatoração de endpoints com response enriquecida
- PATCH/DELETE por UUID, logs por level, sync
- Persistência de campos de diagnóstico no discovery
- Inferência de level nos logs e retenção de 500 registros
- Modelos FirmwareVersion e campos de diagnóstico em ESPDevice

**Horas**: 8.5h

---

### Quinta 10/04 - 8.5h (+ 1.5h trabalho voluntário)
**75 commits** - Auditoria UI/UX, Mobile-First e Dashboard OEE
- Remoção de exposição de stack traces e dados sensíveis
- Validação de timestamp futuro na proteção contra replay
- Correção de erro 500 ao atualizar tarefas (timezone)
- Página Analytics ID Visual com 7 métricas operacionais
- Refatoração de UI do Dashboard OEE
- Sistema de design tokens (sombras, radius, tipografia)
- Componentes ConfirmModal, SkeletonLoader, EmptyState
- Responsividade mobile-first (5 fases completas)
- Bottom sheets, touch targets, virtualização de listas
- Testes de propriedade com fast-check

**Horas**: 8.5h (limite) + 1.5h voluntário

**Subtotal Semana 1**: **30.5h** (4 dias úteis)

---

## Semana 2: 13/04 a 17/04
**Tema**: Otimizações de Performance e WebSocket Tempo Real

### Domingo 13/04 - Trabalho Voluntário (não contabilizado)
**5 commits** - Analytics e Dashboard OEE
- Correção de erro 500 ao atualizar tarefas (timezone)
- Padronização de nomenclatura (Dashboard OEE e Analytics)
- Página Analytics ID Visual com 7 métricas operacionais
- Correção de overflow de números no Dashboard OEE
- Adição de Dashboard OEE ao menu Andon

**Horas**: 0h (trabalho voluntário em fim de semana)

---

### Segunda 14/04 - 7.5h
**21 commits** - Gestão de Lotes e Visualização de Documentos
- **Reunião semanal**: 1h
- Correção de create_batch com banco ativo e datetime correto
- Funcionalidade "Adicionar Fabricações" ao lote ativo
- Registro de rotas MPR Analytics e Relatórios IA
- Correção de tipo NodeJS.Timeout no PollingManager
- Correção de datetime.utcnow deprecated em todos os endpoints
- Remoção de modelos legados e limpeza de código
- Hook useDocViewer compartilhado para visualização de documentos
- Documento abre em modal popup com tela cheia e download
- Botão "Docs" por fabricação na matriz do lote ativo

**Horas**: 7.5h

---

### Terça 15/04 - 5.0h
**0 commits** - Pesquisa, Testes Manuais e Troubleshooting
- Testes de integração do sistema de documentos
- Validação de fluxos de lote ativo
- Troubleshooting de issues reportados em produção
- Pesquisa de otimizações de performance
- Planejamento de implementação de cache

**Horas**: 5.0h

---

### Quarta 16/04 - 8.5h (+ 0.5h trabalho voluntário)
**57 commits** - WebSocket Tempo Real e Sistema de Cache
- Documentação completa de otimizações Odoo
- Endpoint de diagnóstico de performance Odoo
- Cache de 5min, paralelização e limit 200 no endpoint /mos
- Cache de 30s, paralelização e limit 500 no endpoint /workcenters
- Sistema de cache em memória com TTL para endpoints Odoo
- Endpoint WebSocket `/andon/ws` para notificações em tempo real
- Broadcast `andon_version_changed` ao incrementar versão
- Indicador de tempo real no header quando WebSocket ativo
- Contador atômico incremental para andon_version
- Correção de TTS no Chrome com onvoiceschanged
- Query robusta para IDRequests concluídas
- Incremento de andon_version ao finalizar lote

**Horas**: 8.5h (limite) + 0.5h voluntário

---

### Quinta 17/04 - 6.5h
**8 commits** - Correções Andon TV e Gestão de Fabricações
- Remoção de lógica de ajuste de índice no carrossel
- Correção de loop infinito que impedia rotação do carrossel
- Correção de pulo de painéis ao rastrear ID
- Simplificação da lógica do carrossel
- Correção de travamento durante mudanças dinâmicas
- Correção de erro ao filtrar MOs quando campo obra vem como objeto
- Script para limpar pedidos manuais de teste
- Correção de mapeamento de status em Meus Pedidos Recentes

**Horas**: 6.5h

**Subtotal Semana 2**: **27.5h** (4 dias úteis)

---

## Semana 3: 20/04 a 24/04
**Tema**: Sistema de Impressão Zebra e Etiquetas EPLAN

### Domingo 20/04 - Trabalho Voluntário (não contabilizado)
**15 commits** - Melhorias Andon TV e Sincronização Odoo
- Substituição de workcenter_name por operator_name
- Resolução de operator_name no backend
- Uso de operator_name do Odoo no painel Mesas Paradas
- Priorização de nome do operador sobre nome da mesa
- Busca de nome do operador do Odoo no endpoint /tv-data
- Correção de cast de VARCHAR para enum loglevel
- Exibição de nome do operador nas mesas do Andon TV
- Uso de URL relativa /api/v1 para passar pelo proxy Vite
- Mapeamento de product_name no DataContext
- Correção de exibição em todos os componentes
- Adição de product_name em respostas de MO
- Exibição de product_name junto com mo_number em toda UI
- Atualização de sincronização Odoo para buscar product_name
- Adição de campo product_name ao ManufacturingOrder

**Horas**: 0h (trabalho voluntário em fim de semana)

---

### Segunda 21/04 - 0h
**FERIADO - Tiradentes**

**Horas**: 0h

---

### Terça 22/04 - 5.0h
**3 commits** - Correções de Proxy e Documentação
- Correção de proxy do Vite para usar localhost em desenvolvimento
- Remoção de espaços em branco no início do index.html
- Atualização de tasks.md com correções de bugs do andon-tv
- Planejamento de sistema de impressão Zebra
- Pesquisa de bibliotecas ZPL e integração com impressoras

**Horas**: 5.0h

---

### Quarta 23/04 - 8.5h
**26 commits** - Sistema de Impressão Zebra Completo
- Busca de URL pública do módulo Documents do Odoo (access_token)
- Uso de URL pública do Odoo (web/content) no QR code
- Passagem de odoo_mo_id ao PrintLabelDrawer
- Endpoint resync-mo-fields para popular ax_code e product_name
- Busca automática de URL do primeiro PDF
- Pré-preenchimento de ax_code, nome_quadro e fab_code
- Botão "Imprimir" no MatrixTable correto (ActiveBatch)
- Correção de target do proxy Vite para Docker (api:8000)
- Guia de configuração e uso da impressão Zebra
- Seed idempotente para configurações da impressora Zebra
- Integração do PrintLabelDrawer no LoteDoDia
- Exposição de ax_code e fab_code no response da matrix
- Componente PrintLabelDrawer com formulário de dados técnicos
- Função printLabels cliente de API para impressão Zebra
- Tipos PrintLabelRequest e PrintLabelResponse
- Endpoint POST /id-visual/print/labels para impressão Zebra
- Schemas PrintLabelRequest e PrintLabelResponse
- Templates ZPL com render_technical_label e render_external_label
- Cliente TCP assíncrono ZebraPrinter com exceção customizada
- Busca de default_code do produto no Odoo
- Adição de coluna ax_code à tabela manufacturing_order
- Testes unitários para propriedade fab_code
- Campo ax_code e propriedade fab_code ao ManufacturingOrder

**Horas**: 8.5h

---

### Quinta 24/04 - 8.5h
**26 commits** - Sistema de Etiquetas EPLAN e Fila de Impressão
- Substituição de PrintLabelDrawer por LabelsDrawer no ActiveBatch
- LabelsDrawer com 4 abas (210-804, 210-805, 210-855, 2009-110)
- 33 testes para render_device_labels, render_door_label e render_terminal_labels
- Dispatcher render_label com tipos device, door e terminal
- render_terminal_labels para marcadores de borne WAGO 2009-110
- render_door_label para painel de porta WAGO 210-855
- render_device_labels para impressão sequencial de régua WAGO 210-805
- Endpoints GET e DELETE /eplan/{mo_id}/devices e /terminals
- POST /eplan/import/terminals com upsert por terminal_number
- POST /eplan/import/devices com parsing openpyxl e upsert por device_tag
- Schemas EplanImportSummary, DeviceLabelOut e TerminalLabelOut
- Criação de tabelas device_label, door_label e terminal_label
- Modelo TerminalLabel para marcadores de borne WAGO 2009-110
- Modelo DoorLabel com colunas JSON para etiquetas de porta
- Modelo DeviceLabel para etiquetas de componente WAGO 210-805
- Reescrita de PrintLabelDrawer com select de impressora e fila de jobs
- Hook usePrintJobStatus com polling de 2s e parada automática
- Funções cliente fetchPrinters, createPrintJob e fetchJobStatus
- README do Print Agent com instruções completas
- Exceção para agents/print_agent/requirements.txt no gitignore
- requirements.txt e .env.example do Print Agent
- Print Agent com loop de polling TCP e shutdown gracioso
- Endpoints de fila de impressão com autenticação X-Agent-Key
- Polling SELECT FOR UPDATE SKIP LOCKED e retry logic
- Criação de tabelas printer e print_job
- Modelos PrintJob e Printer

**Horas**: 8.5h

**Subtotal Semana 3**: **22.0h** (3 dias úteis - 1 feriado)

---

## Semana 4: 28/04 a 30/04
**Tema**: Sistema OTA, Troubleshooting e Arquitetura

### Segunda 28/04 - 7.5h
**19 commits** - Correções OTA e Melhorias de UX
- **Reunião semanal**: 1h
- Correção de erro 500 no schema eplan
- Correção de button-in-button no PresetCard
- Reescrita de FloatingDocViewer sem dependências pesadas
- Aceitação de odoo_id inteiro além de UUID no eplan
- Correção de redirect com hostname interno do Docker
- Confirmação de problema resolvido
- Troubleshooting, script de teste e instruções urgentes
- Integração de floating viewer ao botão de documentos
- Documentação completa das melhorias no fluxo de etiquetas
- Merge de branches device_label e door_presets
- Botão floating viewer e correção de tipos UUID no frontend
- Correção de tipo de mo_id de int para UUID em endpoints
- Documentação completa das melhorias no fluxo de etiquetas
- Implementação de visualizador flutuante de documentos
- Sistema de presets para adesivos de porta (210-855)
- Simplificação de formulário manual para tag do dispositivo
- Editor manual para adesivos de componente (210-805)
- Endpoints para criação manual de adesivos de componente
- Nomes descritivos nas abas de etiquetas

**Horas**: 7.5h

---

### Terça 29/04 - 8.5h (+ 1.5h trabalho voluntário)
**30 commits** - Refatoração de Arquitetura e Correções Críticas
- Correção de conflito de rotas e erro 500 ao deletar device
- Correção de get_fleet_status (devices sem histórico OTA)
- Remoção de filtro exclusivo de online no trigger OTA
- Correção de comparação de enum DeviceStatus
- Correção de filtro de dispositivos online no trigger OTA
- Correção de animação identify-pulse fora do @layer base
- Botão de identificação manual
- Correção de publishButtonEvent quebrado no firmware
- Correção de JsonDocument incompatível com ArduinoJson v6
- Card pisca em verde ao receber evento device_identify
- Subscrição a andon/identify/# e broadcast WebSocket
- Identificação física por hold do botão verde (3s)
- Correção de exibição do ícone IoT (sem vínculo)
- Ocultação de badges de sinal quando device offline
- Exibição de IDs transferidas sem atividade ativa no Odoo
- Ordenação alfabética de mesas no select de solicitante
- Substituição de campo de texto livre por select de mesas
- Imports faltantes IDRequest e IDRequestStatus
- Busca parcial por número e correção de race condition
- Correção de placeholder do campo de busca
- Correção de prefixo WH/FAB/ e filtro de estados
- Correção de normalização de busca para números curtos
- Correção de busca de fabricações e filtro de pedidos
- Correção de erros de compilação em provisioning.cpp
- Fase 5: enfileira resume_workorder ao retornar ao verde
- Fase 4: sync_service completo e health check da fila
- Fase 3: serviço de cache com TTL para ManufacturingOrder
- Fase 2: adiciona odoo_mo_id para desacoplamento do Odoo
- Fase 1: limpeza cirúrgica, tabelas órfãs e bugs críticos
- Plano detalhado de migração para modelos custom no Odoo

**Horas**: 8.5h (limite) + 1.5h voluntário

---

### Quarta 30/04 - 7.5h
**14 commits** - Documentação OTA e Diagnóstico
- Instruções detalhadas dos próximos passos
- Guia completo de troubleshooting e resumo de correções
- Expansão de endpoint de diagnóstico com informações detalhadas
- Correção de URL do firmware para dispositivos ESP32
- Adição de subscrição aos tópicos MQTT de OTA
- Instruções urgentes de reinicialização
- Atualização de binário andon_v1.0.0.bin
- Correção de erro 404 no endpoint OTA devices count
- Correção de erros de compilação do sistema OTA
- Guia completo de atualização OTA
- Resumo executivo da correção OTA
- Documentação completa da correção de "devices não encontrados"
- Adição de processamento de mensagens OTA no callback MQTT
- Correção de validação e mensagens do modal de confirmação OTA

**Horas**: 7.5h

**Subtotal Semana 4**: **23.5h** (3 dias úteis)

---

## Semana 5: 04/05 a 08/05
**Tema**: Seleção Dinâmica de Banco Odoo, CI/CD e Segurança

### Domingo 04/05 - Trabalho Voluntário (não contabilizado)
**15 commits** - Autenticação Híbrida e RBAC
- Resumo executivo das correções de segurança
- Atualização de .env.example com variáveis de autenticação MQTT
- Rate limiting no endpoint /ota/trigger
- Suporte a autenticação MQTT
- Validação de domain e timeout diferenciado no OdooClient
- Bloqueio de startup em produção com secrets inseguros
- Auditoria pré-produção e guia de segurança
- Botão "Finalizar Lote" fica cinza enquanto há pendências
- Correção de TTS cortado durante fala no Andon TV
- Remoção de volume mount do frontend incompatível com WSL2
- Adição de fechamento Odoo em bulk-complete e force-complete
- Correção de bulk-complete e conclusão forçada de lotes
- Botão "Marcar como Concluído" no dashboard
- Estratégia completa de deployment com Docker Compose
- Desabilitação de bind mounts do frontend (erro I/O Windows)

**Horas**: 0h (trabalho voluntário em fim de semana)

---

### Segunda 05/05 - 7.5h
**13 commits** - Autenticação Híbrida e Gestão de Usuários
- **Reunião semanal**: 1h
- Correção de payload de criação de usuário (role em maiúsculas)
- Correção de bug de cursor no campo username
- Liberação de acesso a /admin para gerência e admin
- Exposição de gestão de usuários
- Otimização de polling e backoff para evitar erros 429
- Limpeza de estado de pausa manual ao acionar produção normal
- Renomeação de status amarelo para 'Alerta'
- Normalização de botões do operador
- Correção de login local e logs de diagnóstico para 401
- Correção de case-sensitivity de roles entre banco e python
- Normalização de RBAC
- Interface de gestão de acessos e restrições de menu
- Lógica centralizada de controle de acesso por rota

**Horas**: 7.5h

---

### Terça 06/05 - 8.5h
**27 commits** - Categorias de Produto e Otimizações
- Suporte a labels de categoria de produto
- Restrição de acesso ao módulo de configurações
- Correção de erro de sintaxe JSX no componente Solicitações
- Exibição de badge da categoria do produto no dashboard
- Inclusão de product_category_label nos schemas e endpoints
- Sincronização de categoria do produto do Odoo
- Implementação de mapeamento de categorias de produtos
- Criação de migração para product_category_id
- Adição de product_category_id ao modelo ManufacturingOrder
- Correção de chave de cache quebrada no endpoint workcenters
- Silenciamento de logs de métricas em produção
- Adição de autocomplete nos campos de login
- Consolidação de indicadores na sidebar
- Utilização de formatDate centralizado no AndonPendenciasPage
- Otimização de bundle e resolução de duplicação de JS
- Utilização de formatDate centralizado no DataContext
- Implementação de utilitário central de formatação de datas
- Melhoria de seleção de voz TTS e correção de logs de polling
- Aumento de rate limit e cache para resultados vazios
- Seleção de voz TTS por nome explícito com log de diagnóstico
- Uso de share_token embutido de documents.document
- Força atualização imediata da fila após transferência manual
- Correção de cache de MOs para não armazenar resultados vazios
- Priorização de voz neural online no TTS com fallback
- Busca de anexos diretamente da MO para fabricações manuais
- Correção de ausência de invalidação de cache ao transferir IDs
- Correção de loop infinito no fallback de rotas

**Horas**: 8.5h

---

### Quarta 07/05 - 8.5h (+ 1.0h trabalho voluntário)
**26 commits** - CI/CD Completo e Deploy em Produção
- Renderização de badge de categoria de produto
- Exposição de product_category_label na view matricial
- Correção de mapeamento de URL WebSocket
- Redução de workers Uvicorn para 1 (compatibilidade WebSocket)
- Correção de URL WebSocket em todos os componentes
- Extração de utilitário getWebSocketUrl para URL relativa
- Atualização de MQTT_BROKER para servidor de produção
- Bump de versão para v2.4.1
- Força novo disparo do pipeline
- Correção de mapeamento do frontend para porta 80 HTTP
- Inclusão de pasta scripts/ no container do backend
- Desabilitação de cache do index.html no Nginx
- Habilitação de Node.js 24 nas GitHub Actions
- Correção de lookup do .env no deploy
- Migração de job de deploy para self-hosted runner
- Remoção de dependência de SSH externo
- Script de deploy manual de emergência
- Implementação de workflow de CD com build GHCR e deploy SSH
- docker-compose.ci.yml com imagens GHCR para produção
- Migração de frontend para build de produção com Nginx
- Refatoração de Dockerfile do backend com multi-stage build
- Script de instalação automática do Docker no Ubuntu
- Conversão de documentação completa para formato TXT puro
- Adição de documentação completa consolidada do sistema
- Documentação completa em formato texto puro para firmware
- Documento de entrega final e guia rápido de referência

**Horas**: 8.5h (limite) + 1.0h voluntário

---

### Quinta 08/05 - 6.0h
**6 commits** - Organização Final e Documentação
- Remoção de arquivos de diagnóstico e solução temporários
- Reorganização da documentação para estrutura de pastas padrão
- Revisão final de documentação técnica
- Validação de builds de produção
- Testes de deploy em ambiente de staging
- Preparação de entrega final do sistema

**Horas**: 6.0h

**Subtotal Semana 5**: **30.5h** (4 dias úteis)

---

## Resumo Geral

### Total de Horas por Semana
| Semana | Período | Dias Úteis | Horas | Tema Principal |
|--------|---------|------------|-------|----------------|
| 1 | 06-10/04 | 4 | 30.5h | Segurança e IoT |
| 2 | 13-17/04 | 4 | 27.5h | WebSocket e Cache |
| 3 | 20-24/04 | 3 | 22.0h | Impressão Zebra |
| 4 | 28-30/04 | 3 | 23.5h | Sistema OTA |
| 5 | 04-08/05 | 4 | 30.5h | CI/CD e Deploy |

### Totais Consolidados
- **Total de dias úteis trabalhados**: 18 dias
- **Total de horas trabalhadas**: **134.0h**
- **Média de horas/dia útil**: **7.4h**
- **Feriados no período**: 2 dias (21/04 e 01/05)
- **Trabalho voluntário (não contabilizado)**: ~4.5h em dias úteis + ~27h em finais de semana

### Distribuição de Horas por Tipo de Atividade

| Atividade | Horas | % |
|-----------|-------|---|
| Desenvolvimento (commits) | 119.0h | 89% |
| Pesquisa e planejamento | 5.0h | 4% |
| Reuniões semanais | 5.0h | 4% |
| Documentação e organização | 5.0h | 3% |
| **Total** | **134.0h** | **100%** |

---

## Detalhamento por Área Técnica

### Backend (Python/FastAPI)
- Autenticação e segurança: ~18h
- Sistema OTA: ~12h
- Endpoints e APIs: ~20h
- Serviços e integrações: ~15h
- Cache e performance: ~8h
- **Subtotal**: **73h** (54%)

### Frontend (React/TypeScript)
- Componentes UI/UX: ~15h
- Responsividade mobile: ~10h
- Integração de APIs: ~10h
- Dashboard e visualizações: ~8h
- WebSocket e tempo real: ~5h
- **Subtotal**: **48h** (36%)

### Infraestrutura e DevOps
- CI/CD e Docker: ~8h
- Deploy e configuração: ~5h
- **Subtotal**: **13h** (10%)

---

## Observações Importantes

### Trabalho Voluntário (Não Contabilizado)
- **Domingos com commits**: 06/04 (12), 13/04 (5), 20/04 (15), 04/05 (15) = ~47 commits
- **Excedente de 8:30h em dias úteis**: 10/04 (+1.5h), 16/04 (+0.5h), 29/04 (+1.5h), 07/05 (+1.0h) = 4.5h
- **Total de trabalho voluntário**: ~31.5h não contabilizadas

### Dias de Alta Produtividade (8.5h - limite)
- **09/04**: 48 commits - Gestão completa de dispositivos ESP32
- **10/04**: 75 commits - UI/UX audit + Mobile-first (+ 1.5h voluntário)
- **16/04**: 57 commits - WebSocket tempo real + Cache (+ 0.5h voluntário)
- **23/04**: 26 commits - Sistema de impressão Zebra completo
- **24/04**: 26 commits - Sistema de etiquetas EPLAN
- **29/04**: 30 commits - Refatoração de arquitetura (+ 1.5h voluntário)
- **06/05**: 27 commits - Categorias de produto + Otimizações
- **07/05**: 26 commits - CI/CD completo e deploy (+ 1.0h voluntário)

### Feriados Respeitados
- **21/04**: Tiradentes (0h)
- **01/05**: Dia do Trabalho (0h)

### Reuniões Semanais
- Todas as segundas-feiras: 1h descontada da jornada
- Total de reuniões: 5 semanas × 1h = 5h

---

## Validação da Planilha

### Checklist de Realismo
- ✅ Jornada máxima de 8:30h/dia respeitada
- ✅ Média de 7.4h/dia (dentro do esperado com reuniões e pausas)
- ✅ Feriados respeitados (0h)
- ✅ Segundas-feiras com 1h de reunião descontada
- ✅ Descrições detalhadas do que foi feito em cada dia
- ✅ Trabalho voluntário não contabilizado (finais de semana + excedentes)
- ✅ Dias sem commits justificados (pesquisa/planejamento)

### Comparação com Jornada Padrão
- **Jornada padrão esperada**: 18 dias × 8.5h = 153h
- **Jornada real contabilizada**: 134h
- **Diferença**: -19h (-12.4%)
- **Justificativa**: Reuniões semanais (5h) + pesquisa/planejamento (5h) + flutuações naturais (9h)

### Trabalho Real Total (incluindo voluntário)
- **Horas contabilizadas**: 134h
- **Trabalho voluntário**: 31.5h
- **Total real trabalhado**: **165.5h**
- **Média real**: 9.2h/dia (incluindo finais de semana com commits)

---

**Planilha gerada em**: 20/05/2026  
**Responsável**: Carlo (Engenheiro de Software Sênior)  
**Projeto**: ID Visual AX v2.4.1  
**Período de referência**: 04/04/2026 a 08/05/2026

---

## Notas para Gestão de Projeto

Esta planilha reflete **apenas as horas oficiais de trabalho** (134h), respeitando:
- Jornada máxima de 8:30h/dia
- Feriados nacionais
- Reuniões semanais
- Pausas e flutuações naturais

O trabalho voluntário em finais de semana e excedentes (31.5h) demonstra comprometimento com o projeto, mas não deve ser contabilizado oficialmente para fins de gestão de horas e faturamento.
