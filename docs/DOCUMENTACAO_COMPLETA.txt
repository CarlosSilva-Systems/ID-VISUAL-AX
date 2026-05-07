═══════════════════════════════════════════════════════════════════════════════
                    ID VISUAL AX - DOCUMENTAÇÃO COMPLETA
                        Sistema de Gestão de Manufatura
═══════════════════════════════════════════════════════════════════════════════

VERSÃO: 2.0.0
DATA: Janeiro 2025
EMPRESA: AX Engenharia

═══════════════════════════════════════════════════════════════════════════════
                              ÍNDICE
═══════════════════════════════════════════════════════════════════════════════

1. VISÃO GERAL DO SISTEMA
2. ARQUITETURA E TECNOLOGIAS
3. MÓDULOS PRINCIPAIS
4. INTEGRAÇÃO COM ODOO
5. SISTEMA ANDON (IoT)
6. GESTÃO DE FIRMWARE OTA
7. BANCO DE DADOS
8. API REST - ENDPOINTS
9. SEGURANÇA
10. DEPLOY E INFRAESTRUTURA
11. TROUBLESHOOTING
12. GUIA PARA DESENVOLVEDORES



═══════════════════════════════════════════════════════════════════════════════
1. VISÃO GERAL DO SISTEMA
═══════════════════════════════════════════════════════════════════════════════

O ID Visual AX é um sistema de gestão de manufatura que integra com o ERP Odoo
para gerenciar o ciclo de vida completo de "IDs Visuais" (documentações técnicas)
para ordens de fabricação.

PRINCIPAIS FUNCIONALIDADES:
---------------------------
✓ Gestão de Lotes de IDs Visuais com workflow 5S
✓ Portal de Produção para solicitações manuais
✓ Sistema Andon com alertas de chão de fábrica (IoT ESP32)
✓ Analytics MPR com dashboards de produção
✓ Relatórios customizados via IA (OpenRouter)
✓ Seleção dinâmica de banco de dados Odoo
✓ Atualização OTA (Over-The-Air) de firmware ESP32
✓ Impressão de etiquetas Zebra (ZPL)
✓ Integração completa com Odoo ERP

CONCEITOS-CHAVE:
----------------
• BATCH (Lote): Agrupamento de ordens de manufatura processadas juntas
• ID REQUEST: Solicitação de produção de ID Visual para uma MO específica
• ID REQUEST TASK: Tarefas individuais do workflow 5S (ex: DOCS_Epson, QA_FINAL)
• ANDON: Sistema de alertas em tempo real do chão de fábrica
• WORKCENTER: Mesa/estação de trabalho no chão de fábrica
• ESP32: Dispositivo IoT com botões físicos e LEDs para Andon
• OTA: Atualização remota de firmware dos dispositivos ESP32

FLUXO PRINCIPAL:
----------------
1. Odoo cria Ordem de Fabricação (MO)
2. Sistema cria IDRequest automaticamente ou via solicitação manual
3. IDRequest é adicionada a um Batch (lote)
4. Operadores executam tarefas 5S (concepção, diagramação, impressão, QA)
5. ID Visual é entregue ao chão de fábrica
6. Sistema Andon monitora produção em tempo real
7. Analytics MPR rastreia métricas e KPIs

═══════════════════════════════════════════════════════════════════════════════
2. ARQUITETURA E TECNOLOGIAS
═══════════════════════════════════════════════════════════════════════════════

STACK TECNOLÓGICO:
------------------

BACKEND:
  • Runtime: Python 3.11+
  • Framework: FastAPI (async/await)
  • ORM: SQLModel (SQLAlchemy + Pydantic)
  • Database: PostgreSQL (asyncpg) / SQLite (desenvolvimento)
  • Migrations: Alembic
  • Auth: JWT (python-jose) + bcrypt (passlib)
  • Task Queue: Celery + Redis
  • Rate Limiting: slowapi
  • AI: OpenRouter API (OpenAI-compatible)
  • IoT: MQTT (aiomqtt)
  • Package Manager: uv

FRONTEND:
  • Framework: React 18 + TypeScript
  • Build Tool: Vite 6
  • Styling: Tailwind CSS v4
  • UI Components: MUI v7 + Radix UI + shadcn
  • Routing: React Router v7
  • Charts: Recharts
  • Forms: React Hook Form
  • Notifications: Sonner
  • Package Manager: npm

INFRAESTRUTURA:
  • Containerization: Docker Compose
  • MQTT Broker: Mosquitto
  • Database: PostgreSQL 15
  • Cache/Queue: Redis 7
  • Reverse Proxy: Nginx (produção)

INTEGRAÇÕES EXTERNAS:
  • Odoo ERP: JSON-RPC / JSON-2 API Key
  • GitHub API: Download de firmware releases
  • OpenRouter: Geração de relatórios via IA
  • Impressoras Zebra: Protocolo ZPL

ARQUITETURA DE COMUNICAÇÃO:
----------------------------
┌─────────────┐
│   Frontend  │ ←──HTTP/WebSocket──→ ┌──────────┐
│  React/TS   │                       │ Backend  │
└─────────────┘                       │ FastAPI  │
                                      └────┬─────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
              ┌─────▼─────┐          ┌────▼────┐           ┌─────▼─────┐
              │PostgreSQL │          │  Redis  │           │   MQTT    │
              │  Database │          │  Cache  │           │  Broker   │
              └───────────┘          └─────────┘           └─────┬─────┘
                                                                  │
                                                            ┌─────▼─────┐
                                                            │  ESP32    │
                                                            │  Devices  │
                                                            └───────────┘

═══════════════════════════════════════════════════════════════════════════════
3. MÓDULOS PRINCIPAIS
═══════════════════════════════════════════════════════════════════════════════

3.1 GESTÃO DE LOTES (BATCHES)
------------------------------
Agrupa múltiplas solicitações de ID Visual para processamento em lote.

STATUS DE LOTE:
  • ativo: Lote em andamento, aceita novas solicitações
  • concluido: Todas as tarefas finalizadas, aguardando finalização
  • finalizado: Lote fechado, não aceita mais alterações
  • cancelado: Lote cancelado

WORKFLOW:
  1. Criar lote (status: ativo)
  2. Adicionar IDRequests ao lote
  3. Operadores executam tarefas 5S
  4. Marcar lote como concluído
  5. Finalizar lote (imutável)

3.2 SOLICITAÇÕES DE ID VISUAL (ID REQUESTS)
--------------------------------------------
Representa uma solicitação de produção de ID Visual para uma MO.

STATUS DE SOLICITAÇÃO:
  • nova: Recém-criada, aguardando triagem
  • triagem: Em análise para adição a lote
  • em_lote: Adicionada a um lote ativo
  • em_progresso: Tarefas sendo executadas
  • bloqueada: Bloqueada por algum motivo (falta de info, etc.)
  • concluida: Todas as tarefas finalizadas
  • entregue: ID Visual entregue ao chão de fábrica
  • cancelada: Solicitação cancelada

TIPOS DE PACOTE:
  • comando: Quadro de comando
  • potencia: Quadro de potência
  • barragem: Quadro de barragem
  • outro: Outros tipos

PRIORIDADE:
  • normal: Prioridade padrão
  • urgente: Prioridade alta

ORIGEM:
  • odoo: Criada automaticamente via integração Odoo
  • manual: Criada manualmente pelo operador

3.3 TAREFAS 5S (ID REQUEST TASKS)
----------------------------------
Tarefas individuais do workflow de produção de ID Visual.

STATUS DE TAREFA:
  • nao_iniciado: Tarefa não iniciada
  • montado: Tarefa em andamento/montada
  • impresso: Tarefa impressa/concluída
  • bloqueado: Tarefa bloqueada (requer justificativa)
  • nao_aplicavel: Tarefa não se aplica a esta solicitação

EXEMPLOS DE TAREFAS:
  • DOCS_Epson: Impressão de documentos
  • QA_FINAL: Controle de qualidade final
  • WAGO_210_804: Montagem de componentes WAGO
  • CONCEPCAO: Concepção do projeto
  • DIAGRAMACAO: Diagramação elétrica

3.4 SISTEMA ANDON
-----------------
Sistema de alertas em tempo real para o chão de fábrica.

CORES DE ALERTA:
  • VERDE: Produção normal
  • AMARELO: Alerta (falta de material, dúvida técnica)
  • VERMELHO: Parada crítica (quebra de equipamento, problema grave)
  • CINZA: Produção pausada (pausa para almoço, reunião)

TIPOS DE CHAMADO:
  • Alerta: Chamado amarelo sem parada de produção
  • Material: Falta de material
  • Técnico: Dúvida técnica
  • Parada Crítica: Chamado vermelho com parada de produção

DISPOSITIVOS ESP32:
  • Botões físicos: Verde, Amarelo, Vermelho, Pause
  • LEDs coloridos: Indicam status atual
  • Conectividade: WiFi direto ou ESP-MESH (fallback)
  • Comunicação: MQTT

3.5 ANALYTICS MPR
-----------------
Dashboard de análise de produção e performance.

MÉTRICAS PRINCIPAIS:
  • Lead Time Médio: Tempo médio de concepção até entrega
  • Taxa de Retrabalho: % de IDs que precisaram ser refeitas
  • SLA: % de entregas no prazo
  • Taxa de Aprovação: % de IDs aprovadas na primeira entrega
  • Tempo de Ciclo: Tempo médio por etapa do processo

DASHBOARDS:
  • Resumo de KPIs
  • Fila Ativa de Solicitações
  • Volume por Período
  • Evolução de Tempo de Ciclo
  • Ranking de Responsáveis (produtividade)
  • Análise de Pareto de Retrabalhos
  • Impacto de Fabricação por Motivo

3.6 RELATÓRIOS CUSTOMIZADOS (IA)
---------------------------------
Geração de relatórios dinâmicos via agente de IA.

FUNCIONALIDADES:
  • Geração de dashboards personalizados
  • Insights proativos Lean Manufacturing
  • Análise de tendências
  • Recomendações de melhoria

MODELO: OpenAI GPT-4o-mini via OpenRouter

═══════════════════════════════════════════════════════════════════════════════
4. INTEGRAÇÃO COM ODOO
═══════════════════════════════════════════════════════════════════════════════

4.1 AUTENTICAÇÃO
----------------
O sistema usa dois tipos de credenciais:

SERVICE ACCOUNT (Conta de Serviço):
  • Usada pelo sistema para todas as operações no Odoo
  • Configurada em ODOO_SERVICE_LOGIN e ODOO_SERVICE_PASSWORD
  • Permanece autenticada durante toda a execução do backend
  • NUNCA é deslogada

USER CREDENTIALS (Credenciais de Usuário):
  • Fornecidas pelo usuário no login
  • Usadas APENAS para validar login
  • NUNCA são armazenadas no banco de dados
  • Após validação, sistema usa Service Account

FLUXO DE AUTENTICAÇÃO:
  1. Usuário fornece email e senha
  2. Sistema valida credenciais no Odoo usando banco ativo
  3. Se válido, cria JWT local com uid, name, email
  4. Todas as operações pós-login usam Service Account

4.2 SELEÇÃO DINÂMICA DE BANCO DE DADOS
---------------------------------------
Sistema permite alternar entre bancos Odoo (produção/teste) via interface.

CADEIA DE FALLBACK:
  1. system_setting.active_odoo_db (prioridade máxima)
  2. "id-visual-3" (padrão hardcoded)
  3. settings.ODOO_DB do .env (fallback de emergência)

PROTEÇÃO DO BANCO DE PRODUÇÃO:
  • Banco "axengenharia1" não pode ser selecionado via UI
  • Validação no backend com HTTP 403
  • Classificação automática: production vs test

ENDPOINTS:
  • GET /api/v1/odoo/databases - Lista bancos disponíveis
  • POST /api/v1/odoo/databases/select - Seleciona banco ativo

4.3 MODELOS ODOO UTILIZADOS
----------------------------
• mrp.production: Ordens de Fabricação (MOs)
• mrp.workorder: Ordens de Trabalho (WOs)
• product.product: Produtos
• product.document: Documentos de produtos
• documents.document: Módulo Documents
• ir.attachment: Anexos
• mail.activity: Atividades
• res.users: Usuários

4.4 OPERAÇÕES PRINCIPAIS
-------------------------
• search_read: Busca e leitura de registros
• call_kw: Chamada de métodos do modelo
• pause_workorder: Pausa ordem de trabalho
• resume_workorder: Retoma ordem de trabalho
• get_product_documents: Busca documentos de produto
• get_document_share_urls: Gera URLs de compartilhamento
• close_activities: Fecha atividades

4.5 WEBHOOK
-----------
Odoo pode enviar webhooks para o sistema quando há mudanças em MOs.

ENDPOINT: POST /api/v1/webhook/odoo
AUTENTICAÇÃO: ODOO_WEBHOOK_SECRET (header X-Webhook-Secret)

EVENTOS:
  • MO criada: Cria IDRequest automaticamente
  • MO atualizada: Atualiza dados da IDRequest
  • MO cancelada: Cancela IDRequest



═══════════════════════════════════════════════════════════════════════════════
5. SISTEMA ANDON (IoT)
═══════════════════════════════════════════════════════════════════════════════

5.1 HARDWARE - ESP32
--------------------
PINAGEM:
  • Botão Verde: GPIO 12 (INPUT_PULLUP)
  • Botão Amarelo: GPIO 13 (INPUT_PULLUP)
  • Botão Vermelho: GPIO 32 (INPUT_PULLUP)
  • Botão Pause: GPIO 33 (INPUT_PULLUP)
  • LED Verde: GPIO 19 (OUTPUT)
  • LED Amarelo: GPIO 18 (OUTPUT)
  • LED Vermelho: GPIO 17 (OUTPUT)
  • LED Onboard: GPIO 2 (OUTPUT)

MÁQUINA DE ESTADOS:
  BOOT → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL (nó raiz)
                         ↘ MESH_NODE (folha) → WIFI_CONNECTING (retry 60s)

CONECTIVIDADE:
  • WiFi Direto: Tenta conectar ao AP "AX-CORPORATIVO" primeiro
  • ESP-MESH: Fallback se WiFi falhar ou RSSI < -80dBm
  • Mesh ID: IDVISUAL_ANDON, canal 6, porta 5555
  • Máximo 4 filhos diretos por nó

PADRÕES DE LED:
  • Boot: Onda verde→amarelo→vermelho (3 ciclos, 200ms)
  • WIFI_CONNECTING: Onda contínua (250ms)
  • MQTT_CONNECTING: Vermelho/amarelo alternados (300ms)
  • MESH_NODE: Amarelo pisca lento (1s on/off)
  • UNASSIGNED: Amarelo pisca rápido (200ms on/off)
  • GRAY (pausado): Todos piscam juntos ~70 BPM (428ms on/off)
  • GREEN: Verde sólido
  • YELLOW: Amarelo sólido
  • RED: Vermelho sólido

DEBOUNCE E WATCHDOG:
  • Debounce de botões: 50ms
  • Watchdog: 60s (reinicia se loop travar)
  • Heap mínimo: 10KB (loga aviso se abaixo)

5.2 TÓPICOS MQTT
----------------
PUBLICADOS PELO ESP32:
  • andon/discovery - Anúncio de presença ao conectar
  • andon/status/{mac} - LWT online/offline + heartbeat (5min)
  • andon/logs/{mac} - Logs de diagnóstico
  • andon/button/{mac}/green - Botão verde pressionado
  • andon/button/{mac}/yellow - Botão amarelo pressionado
  • andon/button/{mac}/red - Botão vermelho pressionado
  • andon/button/{mac}/pause - Botão pause pressionado
  • andon/state/request/{mac} - Solicita estado atual (boot/reconexão)
  • andon/ota/progress/{mac} - Progresso de atualização OTA

PUBLICADOS PELO BACKEND:
  • andon/state/{mac} - Estado atual (GREEN/YELLOW/RED/GRAY/UNASSIGNED)
  • andon/led/{mac}/command - Comando direto de LED (legado)
  • andon/ota/trigger - Dispara atualização OTA
  • andon/ota/cancel - Cancela atualização OTA

5.3 MODELOS DE DADOS
---------------------
ESPDevice:
  • id: UUID (PK)
  • mac_address: str (unique) - ex: "24:DC:C3:A1:77:14"
  • device_name: str - ex: "ESP32-Andon-7714"
  • location: str - localização física
  • workcenter_id: int | None - ID do workcenter no Odoo
  • status: "online" | "offline"
  • last_seen_at: datetime
  • firmware_version: str
  • connection_type: "wifi" | "mesh"

AndonStatus:
  • id: int (PK)
  • workcenter_odoo_id: int (unique)
  • workcenter_name: str
  • status: str - verde|amarelo|vermelho|cinza
  • updated_at: datetime
  • updated_by: str | None - quem atualizou ou "prev:{status}" na pausa

AndonCall:
  • id: int (PK)
  • color: "YELLOW" | "RED"
  • category: str - ex: "Alerta", "Parada Crítica", "Material"
  • reason: str - motivo do chamado
  • description: str | None
  • workcenter_id: int
  • workcenter_name: str
  • mo_id: int | None - ID da MO no Odoo
  • status: "OPEN" | "IN_PROGRESS" | "RESOLVED"
  • triggered_by: str - quem acionou
  • is_stop: bool - se a produção está parada
  • resolved_note: str | None
  • created_at: datetime
  • updated_at: datetime

5.4 LÓGICA DE NEGÓCIO
----------------------
REGRA DE PRECEDÊNCIA DE STATUS:
  1. CINZA (pausado) - AndonStatus.status == "cinza"
  2. VERMELHO - há AndonCall OPEN com color="RED"
  3. AMARELO (parado) - há AndonCall OPEN com color="YELLOW" e is_stop=True
  4. AMARELO_SUAVE - há AndonCall OPEN com color="YELLOW" e is_stop=False + WO ativa
  5. AMARELO - há AndonCall OPEN com color="YELLOW" e is_stop=False + sem WO
  6. VERDE - há WO ativa no Odoo, sem chamados
  7. CINZA - sem WO ativa (aguardando)

REGRA DE SUBSTITUIÇÃO:
  • Novo acionamento resolve TODOS os chamados anteriores do workcenter
  • Garante que nunca haja estados conflitantes
  • Exceção: Botão verde não cria chamado, apenas resolve

FLUXO DO BOTÃO VERDE:
  1. ESP32 publica andon/button/{mac}/green PRESSED
  2. Backend resolve todos os AndonCall abertos
  3. Backend atualiza AndonStatus.status = "verde"
  4. Backend envia GREEN via MQTT
  5. Backend emite WebSocket andon_resolved
  6. Frontend atualiza imediatamente

FLUXO DO BOTÃO AMARELO/VERMELHO:
  1. ESP32 publica andon/button/{mac}/yellow ou red
  2. Backend verifica se device está vinculado
  3. Backend resolve chamados anteriores
  4. Backend cria novo AndonCall
  5. Backend atualiza AndonStatus
  6. Backend envia estado via MQTT
  7. Backend emite WebSocket andon_call_created
  8. Backend integra com Odoo em background

FLUXO DO BOTÃO PAUSE:
  AO PAUSAR (status ≠ "cinza"):
    1. Salva status atual em AndonStatus.updated_by = "prev:{status}"
    2. Define AndonStatus.status = "cinza"
    3. Tenta pausar WO no Odoo
    4. Envia GRAY via MQTT
    5. ESP32 pisca todos os LEDs a 70 BPM

  AO RETOMAR (status == "cinza"):
    1. Lê AndonStatus.updated_by para obter status anterior
    2. Restaura AndonStatus.status = {status_anterior}
    3. Tenta retomar WO no Odoo
    4. Mapeia status e envia via MQTT
    5. ESP32 acende LED correspondente

DEDUPLICAÇÃO:
  • Eventos de botões: janela de 3 segundos
  • Eventos de pause: janela de 5 segundos
  • Dicionário em memória _button_dedup

5.5 INTEGRAÇÃO COM ODOO
------------------------
BOTÃO AMARELO (is_stop=True):
  • Pausa WO ativa via pause_workorder(wo_id)
  • Posta no chatter: "🟡 Andon Amarelo — PRODUÇÃO PARADA: {motivo}"

BOTÃO AMARELO (is_stop=False):
  • Não pausa WO
  • Posta no chatter: "🟡 Andon Amarelo: {motivo}"

BOTÃO VERMELHO:
  • Pausa WO ativa
  • Cria atividade para engenheiro (ANDON_ENGINEERING_USER_ID)
  • Posta no chatter: "🔴 Andon Vermelho — PARADA CRÍTICA: {motivo}"

BOTÃO PAUSE:
  • Pausa ou retoma WO via pause_workorder/resume_workorder
  • Falhas não bloqueiam atualização local

5.6 API REST - ENDPOINTS ANDON
-------------------------------
• GET /api/v1/andon/workcenters - Lista workcenters com status
• GET /api/v1/andon/workcenters/{wc_id}/current_order - WO ativa
• POST /api/v1/andon/trigger/{color} - Acionamento básico
• POST /api/v1/andon/calls - Cria chamado estruturado
• GET /api/v1/andon/calls - Lista chamados ativos
• PATCH /api/v1/andon/calls/{call_id}/status - Atualiza status
• GET /api/v1/andon/tv-data - Dados para painel TV
• GET /api/v1/andon/history - Histórico de chamados

═══════════════════════════════════════════════════════════════════════════════
6. GESTÃO DE FIRMWARE OTA
═══════════════════════════════════════════════════════════════════════════════

6.1 VISÃO GERAL
---------------
Sistema OTA (Over-The-Air) permite atualização remota de firmware dos
dispositivos ESP32 sem necessidade de acesso físico.

ARQUITETURA:
  Frontend → Backend API → MQTT Broker → ESP32 Devices
                  ↓
          Static File Server (HTTP)
                  ↓
          ESP32 Downloads Firmware

6.2 MODELOS DE DADOS
---------------------
FirmwareRelease:
  • id: UUID (PK)
  • version: str - formato X.Y.Z (semântico)
  • filename: str - nome do arquivo .bin
  • file_size: int - tamanho em bytes
  • source: "manual" | "github"
  • github_release_url: str | None
  • created_by: str
  • created_at: datetime

OTAUpdateLog:
  • id: UUID (PK)
  • device_id: UUID (FK → ESPDevice)
  • firmware_release_id: UUID (FK → FirmwareRelease)
  • status: "pending" | "downloading" | "installing" | "success" | "failed" | "timeout"
  • progress: int (0-100)
  • error_message: str | None
  • started_at: datetime
  • completed_at: datetime | None
  • triggered_by: str

6.3 ENDPOINTS DA API
--------------------
GERENCIAMENTO DE FIRMWARE:
  • GET /api/v1/ota/firmware/releases - Lista versões disponíveis
  • POST /api/v1/ota/firmware/check-github - Verifica nova versão no GitHub
  • POST /api/v1/ota/firmware/download-github - Baixa do GitHub
  • POST /api/v1/ota/firmware/upload - Upload manual (.bin, 100KB-2MB)
  • DELETE /api/v1/ota/firmware/{release_id} - Deleta release

OPERAÇÕES OTA:
  • POST /api/v1/ota/trigger - Dispara atualização em massa
  • GET /api/v1/ota/status - Status de todos os dispositivos
  • GET /api/v1/ota/history/{mac} - Histórico de atualizações

6.4 TÓPICOS MQTT OTA
--------------------
andon/ota/trigger (Backend → ESP32):
  Payload: {
    "version": "1.2.0",
    "url": "http://192.168.10.55:8000/static/ota/firmware-1.2.0.bin",
    "size": 1234567
  }

andon/ota/progress/{mac} (ESP32 → Backend):
  Payload: {
    "status": "downloading",  // downloading, installing, success, failed
    "progress": 45,           // 0-100
    "error": null
  }

andon/ota/cancel (Backend → ESP32):
  Cancela atualização em andamento

6.5 FLUXO DE ATUALIZAÇÃO OTA
-----------------------------
1. PREPARAÇÃO:
   • Gestor faz upload manual ou baixa do GitHub
   • Firmware salvo em storage/ota/firmware/
   • Registro criado em FirmwareRelease

2. TRIGGER:
   • Gestor clica "Atualizar Todos" na interface
   • Backend cria OTAUpdateLog para cada dispositivo
   • Backend publica comando MQTT em andon/ota/trigger

3. DOWNLOAD (ESP32):
   • ESP32 recebe comando MQTT
   • Valida que não está na versão solicitada
   • Publica progresso: status=downloading
   • Inicia download via HTTP
   • Publica progresso a cada 10%

4. INSTALAÇÃO (ESP32):
   • Download completo
   • Publica status=installing
   • Valida firmware
   • Instala e marca como válido
   • Publica status=success
   • Reinicia

5. VALIDAÇÃO (ESP32):
   • Primeiro boot após OTA
   • Marca firmware como válido (evita rollback)
   • Conecta ao MQTT
   • Envia discovery com nova versão

6. CONFIRMAÇÃO (Backend):
   • Recebe heartbeat com nova versão
   • Atualiza ESPDevice.firmware_version
   • Marca OTAUpdateLog como success

6.6 SEGURANÇA OTA
-----------------
VALIDAÇÕES:
  • Extensão .bin obrigatória
  • Tamanho: 100KB - 2MB
  • Versão semântica (X.Y.Z)
  • Path traversal prevention (rejeita .., /, \)
  • Rate limiting: 1 req/segundo no endpoint de trigger

AUDITORIA:
  • Todos os logs incluem username e timestamp
  • Histórico completo por dispositivo
  • Tracking de progresso em tempo real

RESILIÊNCIA:
  • Rollback automático se firmware falhar
  • Timeout de 10 minutos
  • Validação de boot bem-sucedido
  • Delay aleatório 0-60s para evitar sobrecarga de rede

6.7 HOSPEDAGEM ESTÁTICA
------------------------
Arquivos .bin servidos via HTTP puro (sem SSL) para otimizar performance:
  • Rota: /static/ota/firmware-{version}.bin
  • Headers: Content-Type: application/octet-stream, Cache-Control: no-cache
  • Storage: Volume Docker em /app/storage/ota/firmware/

IMPORTANTE: BACKEND_HOST deve ser configurado com IP real, não localhost!
  Exemplo: BACKEND_HOST=192.168.10.55:8000

6.8 INTEGRAÇÃO COM GITHUB
--------------------------
Configure variáveis de ambiente:
  GITHUB_REPO_OWNER=seu_usuario
  GITHUB_REPO_NAME=seu_repositorio
  GITHUB_TOKEN=ghp_xxx  # Necessário apenas para repos privados

Sistema busca asset .bin no release mais recente e baixa automaticamente.



═══════════════════════════════════════════════════════════════════════════════
7. BANCO DE DADOS
═══════════════════════════════════════════════════════════════════════════════

7.1 PRINCIPAIS TABELAS
-----------------------

GESTÃO DE LOTES:
  • batch - Lotes de IDs visuais
  • batch_item - Itens de um lote (relação N:N com id_request)

SOLICITAÇÕES:
  • id_request - Solicitações de ID Visual
  • id_request_task - Tarefas individuais 5S
  • task_blueprint - Templates de tarefas
  • package_blueprint - Templates de pacotes

ANDON:
  • esp_device - Dispositivos ESP32 cadastrados
  • andon_status - Cache de status atual por workcenter
  • andon_call - Chamados estruturados
  • andon_event - Eventos históricos (legado)
  • andon_settings - Configurações do sistema Andon

OTA:
  • firmware_release - Versões de firmware disponíveis
  • ota_update_log - Histórico de atualizações OTA
  • firmware_version - Versões de firmware (legado)
  • esp_device_diagnostic - Diagnósticos de dispositivos

MANUFATURA:
  • manufacturing_order - Cache de MOs do Odoo
  • production_tracking - Tracking de produção
  • factory_block - Bloqueios de fabricação

IMPRESSÃO:
  • printer - Impressoras cadastradas
  • print_job - Fila de impressão
  • label_device - Dispositivos de etiqueta
  • label_door - Etiquetas de porta
  • label_terminal - Etiquetas de terminal
  • door_label_preset - Presets de etiquetas de porta

ANALYTICS:
  • custom_report - Relatórios customizados
  • mpr_config - Configurações de SLA do MPR

SISTEMA:
  • user - Usuários locais
  • system_setting - Configurações do sistema (chave-valor)
  • odoo_connection - Configurações de conexão Odoo
  • audit_log - Log de auditoria

7.2 CAMPOS IMPORTANTES
----------------------

TIMESTAMPS DE LIFECYCLE (id_request):
  • solicitado_em: Quando foi solicitada
  • iniciado_em: Quando começou a ser produzida
  • concluido_em: Quando foi concluída
  • entregue_em: Quando foi entregue
  • aprovado_em: Quando foi aprovada

TRACKING DE PRODUÇÃO:
  • started_at: Início da produção
  • finished_at: Fim da produção
  • version: Versão para optimistic locking

RASTREAMENTO DE "NÃO CONSTA":
  • nao_consta_em: Timestamp da ocorrência
  • nao_consta_items: Lista JSON dos task_codes que não chegaram
  • nao_consta_registrado_por: Nome do operador

7.3 ENUMS PRINCIPAIS
--------------------

BatchStatus: ativo, concluido, finalizado, cancelado
IDRequestStatus: nova, triagem, em_lote, em_progresso, bloqueada, concluida, entregue, cancelada
PackageType: comando, potencia, barragem, outro
TaskStatus: nao_iniciado, montado, impresso, bloqueado, nao_aplicavel
AndonCallStatus: OPEN, IN_PROGRESS, RESOLVED
AndonCallColor: YELLOW, RED
DeviceStatus: online, offline
ConnectionType: wifi, mesh
OTAStatus: pending, downloading, installing, success, failed, timeout
FirmwareSource: manual, github

7.4 ÍNDICES E PERFORMANCE
--------------------------

ÍNDICES PRINCIPAIS:
  • id_request.mo_id (FK)
  • id_request.batch_id (FK)
  • id_request.status
  • id_request.odoo_mo_id
  • id_request.solicitado_em
  • id_request_task.request_id (FK)
  • id_request_task.task_code
  • esp_device.mac_address (unique)
  • andon_status.workcenter_odoo_id (unique)
  • ota_update_log.device_id (FK)

OPTIMISTIC LOCKING:
  • Campos version em id_request e id_request_task
  • Previne race conditions em atualizações concorrentes

7.5 MIGRAÇÕES (ALEMBIC)
------------------------

COMANDOS:
  • alembic upgrade head - Aplica todas as migrações
  • alembic downgrade -1 - Reverte última migração
  • alembic revision --autogenerate -m "descrição" - Cria nova migração
  • alembic current - Mostra versão atual
  • alembic history - Mostra histórico de migrações

IMPORTANTE:
  • Alembic usa driver sync (remove +asyncpg da URL)
  • Migrações devem ser testadas antes de aplicar em produção
  • Sempre fazer backup antes de migrar

═══════════════════════════════════════════════════════════════════════════════
8. API REST - ENDPOINTS
═══════════════════════════════════════════════════════════════════════════════

BASE URL: /api/v1

8.1 AUTENTICAÇÃO
----------------
POST /auth/login
  Body: { username, password }
  Response: { access_token, token_type, user: { uid, name, email } }

GET /auth/me
  Headers: Authorization: Bearer {token}
  Response: { uid, name, email }

POST /auth/logout
  Remove token local (frontend), não desloga Service Account

8.2 ODOO
--------
GET /odoo/databases
  Lista bancos de dados disponíveis
  Response: [{ name, type, selectable, is_active }]

POST /odoo/databases/select
  Body: { database }
  Seleciona banco ativo
  Response: { status, database, connection_ok }

GET /odoo/mos
  Lista Manufacturing Orders do Odoo
  Query: ?state=confirmed&limit=100

GET /odoo/users
  Lista usuários do Odoo

POST /webhook/odoo
  Headers: X-Webhook-Secret
  Recebe webhooks do Odoo

8.3 LOTES (BATCHES)
-------------------
GET /batches
  Lista lotes
  Query: ?status=ativo&limit=50

POST /batches
  Body: { name }
  Cria novo lote

GET /batches/{batch_id}
  Detalhes de um lote

PATCH /batches/{batch_id}
  Body: { status }
  Atualiza status do lote

POST /batches/{batch_id}/items
  Body: { request_ids: [uuid, ...] }
  Adiciona solicitações ao lote

DELETE /batches/{batch_id}/items/{request_id}
  Remove solicitação do lote

8.4 SOLICITAÇÕES (ID REQUESTS)
-------------------------------
GET /id-requests
  Lista solicitações
  Query: ?status=nova&priority=urgente&limit=100

POST /id-requests
  Body: { mo_id, package_code, priority, notes }
  Cria solicitação manual

GET /id-requests/{request_id}
  Detalhes de uma solicitação

PATCH /id-requests/{request_id}
  Body: { status, notes }
  Atualiza solicitação

GET /id-requests/manual
  Lista solicitações manuais (polling)

POST /id-requests/{request_id}/transfer
  Body: { note }
  Transfere para fila padrão

8.5 TAREFAS
-----------
GET /id-requests/{request_id}/tasks
  Lista tarefas de uma solicitação

PATCH /id-requests/{request_id}/tasks/{task_id}
  Body: { status, blocked_reason, blocked_note }
  Atualiza status de tarefa

8.6 ANDON
---------
GET /andon/workcenters
  Lista workcenters com status calculado

GET /andon/workcenters/{wc_id}/current_order
  WO ativa de um workcenter

POST /andon/trigger/{color}
  Body: { workcenter_id, workcenter_name, status, triggered_by }
  Acionamento básico (verde/cinza)

POST /andon/calls
  Body: { color, category, reason, workcenter_id, mo_id, triggered_by, is_stop }
  Cria chamado estruturado

GET /andon/calls
  Query: ?active_only=true
  Lista chamados

PATCH /andon/calls/{call_id}/status
  Body: { status, resolved_note }
  Atualiza status de chamado

GET /andon/tv-data
  Dados consolidados para painel TV

GET /andon/history
  Query: ?days=7
  Histórico de chamados

8.7 DISPOSITIVOS IoT
--------------------
GET /devices
  Lista dispositivos ESP32

POST /devices
  Body: { mac_address, device_name, location, workcenter_id }
  Cadastra dispositivo

PATCH /devices/{device_id}
  Body: { device_name, location, workcenter_id }
  Atualiza dispositivo

DELETE /devices/{device_id}
  Remove dispositivo

GET /devices/ws
  WebSocket para eventos em tempo real

8.8 OTA
-------
GET /ota/firmware/releases
  Lista versões de firmware

POST /ota/firmware/check-github
  Verifica nova versão no GitHub

POST /ota/firmware/download-github
  Body: { version } (opcional)
  Baixa firmware do GitHub

POST /ota/firmware/upload
  Form-data: file (.bin), version (X.Y.Z)
  Upload manual de firmware

DELETE /ota/firmware/{release_id}
  Deleta firmware release

POST /ota/trigger
  Body: { firmware_release_id }
  Rate limit: 1 req/s
  Dispara atualização OTA em massa

GET /ota/status
  Status de atualização de todos os dispositivos

GET /ota/history/{mac_address}
  Histórico de atualizações de um dispositivo

GET /ota/devices/count
  Contagem de dispositivos (total, online, offline, root, mesh)

GET /ota/devices/diagnostics
  Diagnóstico detalhado de todos os dispositivos

8.9 ANALYTICS MPR
-----------------
GET /mpr-analytics/resumo
  Query: ?data_inicio=2024-01-01&data_fim=2024-12-31
  KPIs de resumo

GET /mpr-analytics/fila-ativa
  Fila de solicitações pendentes

GET /mpr-analytics/volume-por-periodo
  Volume diário de solicitações

GET /mpr-analytics/evolucao-tempo-ciclo
  Tendência de Lead Time

GET /mpr-analytics/ranking-responsaveis
  Produtividade de responsáveis

GET /mpr-analytics/motivos-revisao
  Análise de Pareto de retrabalhos

GET /mpr-analytics/impacto-fabricacao
  Gargalos de fabricação

GET /mpr-analytics/config
  Configurações de SLA

PATCH /mpr-analytics/config
  Body: { sla_dias, meta_taxa_retrabalho }
  Atualiza configurações

8.10 RELATÓRIOS CUSTOMIZADOS
-----------------------------
GET /custom-reports
  Lista relatórios salvos

POST /custom-reports
  Body: { title, prompt, dashboard_json }
  Cria relatório

GET /custom-reports/{report_id}
  Detalhes de um relatório

DELETE /custom-reports/{report_id}
  Deleta relatório

POST /agent/generate-dashboard
  Body: { prompt, context_data }
  Gera dashboard via IA

8.11 IMPRESSÃO
--------------
POST /print-labels/component
  Body: { mo_id, tag, component_data }
  Imprime etiqueta de componente

POST /print-labels/door
  Body: { mo_id, door_data }
  Imprime etiqueta de porta

GET /door-presets
  Lista presets de porta

POST /door-presets
  Body: { name, template_data }
  Cria preset de porta

POST /eplan/import
  Form-data: file (Excel)
  Importa dados do EPLAN

8.12 CONFIGURAÇÕES
------------------
GET /settings
  Configurações gerais do sistema

PATCH /settings
  Body: { key, value }
  Atualiza configuração

GET /user-config
  Configurações do usuário logado

PATCH /user-config
  Body: { test_mode, test_database }
  Atualiza configurações do usuário

8.13 HEALTH CHECK
-----------------
GET /health
  Response: { status: "ok", backend: "running" }

GET /diagnostics
  Diagnóstico completo do sistema

═══════════════════════════════════════════════════════════════════════════════
9. SEGURANÇA
═══════════════════════════════════════════════════════════════════════════════

9.1 AUTENTICAÇÃO E AUTORIZAÇÃO
-------------------------------

JWT (JSON Web Tokens):
  • Algoritmo: HS256
  • Secret: SECRET_KEY (variável de ambiente)
  • Expiração: Configurável (padrão 7 dias)
  • Payload: { sub: username, exp: timestamp }

SENHAS:
  • Hash: bcrypt via passlib
  • Rounds: 12 (padrão)
  • NUNCA armazenadas em texto plano

ROLES (RBAC):
  • admin: Acesso total
  • producao: Acesso limitado à produção
  • gerencia: Acesso a analytics e gestão
  • operador: Acesso básico

9.2 PROTEÇÃO DE CREDENCIAIS
----------------------------

SERVICE ACCOUNT:
  • ODOO_SERVICE_PASSWORD NUNCA exposta em logs
  • Substituída por *** em stack traces
  • Mensagens de erro genéricas

USER CREDENTIALS:
  • Senha do usuário NUNCA armazenada
  • Usada apenas para validação de login
  • Descartada imediatamente após validação

SECRETS MANAGEMENT:
  • Todas as credenciais em variáveis de ambiente
  • Arquivo .env NUNCA commitado no git
  • .env.example fornecido como template

9.3 VALIDAÇÃO DE INPUT
-----------------------

PYDANTIC SCHEMAS:
  • extra="forbid" - Rejeita campos não mapeados
  • Field(pattern=...) - Validação regex
  • @field_validator - Validação customizada
  • min_length, gt, ge, le - Validações numéricas

VALIDAÇÃO DE BANCO DE DADOS:
  • Apenas alfanuméricos, hífen, underscore
  • Regex: ^[a-zA-Z0-9_-]+$
  • Trim aplicado antes de persistir

PATH TRAVERSAL PREVENTION:
  • Rejeita nomes de arquivo com .., /, \
  • Validação em uploads de firmware

SQL INJECTION PREVENTION:
  • SQLModel usa queries parametrizadas
  • Validação de domain e fields (Odoo)

9.4 RATE LIMITING
-----------------

SLOWAPI:
  • Endpoint /ota/trigger: 1 req/segundo
  • Baseado em IP do cliente
  • Resposta HTTP 429 se excedido

9.5 CORS
--------

ORIGENS PERMITIDAS:
  • http://localhost:5173 (desenvolvimento)
  • http://127.0.0.1:5173 (desenvolvimento)
  • Configurável via CORS_ORIGINS (produção)

MÉTODOS: Todos (*)
HEADERS: Todos (*)
CREDENTIALS: True

9.6 CRIPTOGRAFIA
----------------

AES-GCM:
  • Chave: ENCRYPTION_KEY (variável de ambiente)
  • Usado para credenciais sensíveis
  • Implementação: cryptography.fernet

HTTPS:
  • Obrigatório em produção
  • Certificado SSL via Let's Encrypt
  • Nginx como reverse proxy

9.7 AUDITORIA
-------------

AUDIT_LOG:
  • Registra operações críticas
  • Campos: user, action, resource, timestamp
  • Retenção: Configurável

REQUEST_ID:
  • UUID único por requisição
  • Incluído em logs de erro
  • Permite rastreabilidade sem expor dados

9.8 PROTEÇÃO DO BANCO DE PRODUÇÃO
----------------------------------

VALIDAÇÃO NO BACKEND:
  • Banco "axengenharia1" não selecionável via UI
  • HTTP 403 se tentativa de seleção
  • Classificação automática: production vs test

VALIDAÇÃO NO FRONTEND:
  • Opção desabilitada no dropdown
  • Tooltip explicativo
  • Warning visual

9.9 CHECKLIST DE SEGURANÇA
---------------------------

ANTES DE DEPLOY EM PRODUÇÃO:
  ☐ Alterar SECRET_KEY
  ☐ Alterar ENCRYPTION_KEY
  ☐ Alterar ODOO_WEBHOOK_SECRET
  ☐ Alterar senhas de banco de dados
  ☐ Alterar senha do Redis
  ☐ Configurar HTTPS
  ☐ Configurar firewall (ufw)
  ☐ Limitar acesso SSH (chave pública apenas)
  ☐ Configurar backup automático
  ☐ Testar restore dos backups
  ☐ Revisar logs de acesso
  ☐ Validar que credenciais não aparecem em logs
  ☐ Testar rate limiting
  ☐ Validar CORS origins



═══════════════════════════════════════════════════════════════════════════════
10. DEPLOY E INFRAESTRUTURA
═══════════════════════════════════════════════════════════════════════════════

10.1 DOCKER COMPOSE
-------------------

SERVIÇOS:
  • db: PostgreSQL 15-alpine
  • redis: Redis 7-alpine
  • mosquitto: MQTT Broker (custom Dockerfile)
  • api: Backend FastAPI
  • frontend: Frontend React/Vite

VOLUMES:
  • postgres_data: Dados do PostgreSQL
  • ota_firmware: Armazenamento de firmware OTA

PORTAS:
  • 5432: PostgreSQL
  • 6379: Redis
  • 1883: MQTT
  • 8000: Backend API
  • 5173: Frontend

COMANDOS:
  # Desenvolvimento
  docker compose up -d

  # Produção
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

  # Logs
  docker compose logs -f api

  # Restart
  docker compose restart api

  # Stop
  docker compose down

10.2 VARIÁVEIS DE AMBIENTE
---------------------------

OBRIGATÓRIAS:
  # Banco de Dados
  DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/id_visual

  # Segurança (MUDAR EM PRODUÇÃO!)
  SECRET_KEY=<gerar com: openssl rand -hex 32>
  ENCRYPTION_KEY=<gerar com: openssl rand -base64 32>
  ODOO_WEBHOOK_SECRET=<gerar com: openssl rand -hex 32>

  # Odoo
  ODOO_URL=https://axengenharia1.odoo.com
  ODOO_DB=axengenharia1  # Fallback de emergência
  ODOO_SERVICE_LOGIN=service_account@exemplo.com
  ODOO_SERVICE_PASSWORD=sua_senha_ou_apikey
  ODOO_AUTH_TYPE=jsonrpc_password  # ou json2_apikey

OPCIONAIS:
  # GitHub (para OTA)
  GITHUB_REPO_OWNER=seu_usuario
  GITHUB_REPO_NAME=seu_repositorio
  GITHUB_TOKEN=ghp_xxx  # Apenas para repos privados

  # OTA
  OTA_STORAGE_PATH=/app/storage/ota/firmware
  BACKEND_HOST=192.168.10.55:8000  # IP REAL, não localhost!

  # OpenRouter (para IA)
  OPENROUTER_API_KEY=sua_chave

  # MQTT
  MQTT_BROKER_HOST=192.168.10.55
  MQTT_BROKER_PORT=1883
  MQTT_USERNAME=usuario  # Opcional
  MQTT_PASSWORD=senha    # Opcional

  # Andon
  ANDON_ENGINEERING_USER_ID=123  # ID do engenheiro no Odoo

10.3 HARDWARE MÍNIMO
--------------------

DESENVOLVIMENTO:
  • CPU: 2 cores
  • RAM: 4 GB
  • Disco: 20 GB

PRODUÇÃO:
  • CPU: 4 cores (mínimo 2)
  • RAM: 8 GB (mínimo 4)
  • Disco: 50 GB SSD (mínimo 20 GB)
  • Rede: 100 Mbps

10.4 SISTEMA OPERACIONAL
------------------------

RECOMENDADO:
  • Ubuntu 22.04 LTS
  • Debian 12

INSTALAÇÃO DO DOCKER:
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker $USER

10.5 FIREWALL
-------------

PORTAS A ABRIR:
  sudo ufw allow 22/tcp    # SSH
  sudo ufw allow 80/tcp    # HTTP
  sudo ufw allow 443/tcp   # HTTPS
  sudo ufw allow 1883/tcp  # MQTT
  sudo ufw enable

10.6 NGINX (REVERSE PROXY)
---------------------------

INSTALAÇÃO:
  sudo apt install -y nginx certbot python3-certbot-nginx

CONFIGURAÇÃO:
  # /etc/nginx/sites-available/idvisual
  server {
      listen 80;
      server_name seu-dominio.com;
      return 301 https://$server_name$request_uri;
  }

  server {
      listen 443 ssl http2;
      server_name seu-dominio.com;

      ssl_certificate /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;

      # Frontend
      location / {
          proxy_pass http://localhost:5173;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
          proxy_cache_bypass $http_upgrade;
      }

      # API
      location /api/ {
          proxy_pass http://localhost:8000;
          proxy_http_version 1.1;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }

      # WebSocket
      location /ws {
          proxy_pass http://localhost:8000;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
      }
  }

ATIVAR:
  sudo ln -s /etc/nginx/sites-available/idvisual /etc/nginx/sites-enabled/
  sudo nginx -t
  sudo systemctl reload nginx

CERTIFICADO SSL:
  sudo certbot --nginx -d seu-dominio.com

10.7 BACKUP
-----------

BACKUP MANUAL:
  # Banco de dados
  docker compose exec db pg_dump -U ${POSTGRES_USER} ${POSTGRES_DB} > backup_$(date +%Y%m%d_%H%M%S).sql

  # Restaurar
  docker compose exec -T db psql -U ${POSTGRES_USER} ${POSTGRES_DB} < backup_20240504_120000.sql

BACKUP AUTOMATIZADO (CRON):
  # /opt/scripts/backup_idvisual.sh
  #!/bin/bash
  BACKUP_DIR="/opt/backups/idvisual"
  DATE=$(date +%Y%m%d_%H%M%S)
  mkdir -p $BACKUP_DIR

  # Backup do banco
  docker compose -f /opt/id_visual_2/docker-compose.yml exec -T db \
    pg_dump -U idvisual_prod idvisual_production > $BACKUP_DIR/db_$DATE.sql

  # Backup dos volumes
  docker run --rm -v id_visual_2_postgres_data:/data -v $BACKUP_DIR:/backup \
    alpine tar czf /backup/volumes_$DATE.tar.gz /data

  # Manter apenas últimos 7 dias
  find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
  find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

CRON:
  sudo crontab -e
  0 2 * * * /opt/scripts/backup_idvisual.sh

10.8 ATUALIZAÇÃO
----------------

PROCESSO:
  1. Backup antes de atualizar
  2. git pull origin main
  3. docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  4. docker compose exec api alembic upgrade head
  5. Verificar logs

ROLLBACK:
  1. git checkout <commit-hash>
  2. docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  3. docker compose exec api alembic downgrade -1 (se necessário)

10.9 MONITORAMENTO
------------------

LOGS:
  # Todos os serviços
  docker compose logs -f

  # Serviço específico
  docker compose logs -f api

  # Últimas 100 linhas
  docker compose logs --tail=100 api

RECURSOS:
  # Uso de CPU/RAM por container
  docker stats

  # Espaço em disco
  docker system df

HEALTH CHECKS:
  # API
  curl http://localhost:8000/api/v1/health

  # Frontend
  curl http://localhost:5173

  # MQTT
  docker compose logs mosquitto

═══════════════════════════════════════════════════════════════════════════════
11. TROUBLESHOOTING
═══════════════════════════════════════════════════════════════════════════════

11.1 BACKEND NÃO INICIA
------------------------

ERRO: "Missing required environment variables"
SOLUÇÃO:
  • Verifique .env contém ODOO_URL, ODOO_SERVICE_LOGIN, ODOO_SERVICE_PASSWORD
  • Copie de .env.example se necessário

ERRO: "Database connection failed"
SOLUÇÃO:
  • Verifique DATABASE_URL está correto
  • Verifique PostgreSQL está rodando: docker compose ps db
  • Teste conexão: docker compose exec db psql -U postgres

ERRO: "Port 8000 already in use"
SOLUÇÃO:
  • Mate processo na porta: lsof -ti:8000 | xargs kill -9
  • Ou use porta diferente: uvicorn app.main:app --port 8001

11.2 FRONTEND NÃO CARREGA
--------------------------

ERRO: "Failed to fetch"
SOLUÇÃO:
  • Verifique backend está rodando: curl http://localhost:8000/api/v1/health
  • Verifique VITE_API_URL no .env do frontend
  • Limpe cache: Ctrl+Shift+R

ERRO: "ODOO DESCONECTADO"
SOLUÇÃO:
  • Verifique configurações Odoo no backend
  • Teste conexão: GET /api/v1/odoo/databases
  • Verifique logs do backend

11.3 MQTT NÃO CONECTA
---------------------

ERRO: "Connection refused"
SOLUÇÃO:
  • Verifique broker está rodando: docker compose ps mosquitto
  • Verifique porta 1883 está aberta: telnet 192.168.10.55 1883
  • Verifique MQTT_BROKER_HOST está correto

ERRO: "Authentication failed"
SOLUÇÃO:
  • Verifique MQTT_USERNAME e MQTT_PASSWORD
  • Verifique configuração do Mosquitto

11.4 ESP32 NÃO CONECTA
----------------------

PROBLEMA: LED amarelo piscando rápido (UNASSIGNED)
SOLUÇÃO:
  • Device não está vinculado a workcenter
  • Acesse /admin/iot-devices e vincule

PROBLEMA: LED amarelo piscando lento (MESH_NODE)
SOLUÇÃO:
  • Device está em modo mesh (sem WiFi direto)
  • Verifique qualidade do sinal WiFi
  • Aproxime do AP ou adicione repetidor

PROBLEMA: Onda de LEDs contínua (WIFI_CONNECTING)
SOLUÇÃO:
  • Não consegue conectar ao WiFi
  • Verifique SSID "AX-CORPORATIVO" existe
  • Verifique senha do WiFi no firmware

PROBLEMA: Vermelho/amarelo alternados (MQTT_CONNECTING)
SOLUÇÃO:
  • WiFi ok, mas MQTT não conecta
  • Verifique broker MQTT está acessível
  • Verifique IP do broker no firmware

11.5 OTA NÃO FUNCIONA
---------------------

PROBLEMA: "Nenhum dispositivo conectado"
SOLUÇÃO:
  • Verifique dispositivos estão online
  • Execute: python backend/test_ota_diagnostics.py
  • Verifique last_seen_at no diagnóstico

PROBLEMA: "Download failed"
SOLUÇÃO:
  • Verifique BACKEND_HOST está com IP real (não localhost)
  • Teste: curl http://192.168.10.55:8000/static/ota/firmware-2.4.0.bin
  • Verifique firewall do servidor

PROBLEMA: "Timeout"
SOLUÇÃO:
  • Timeout padrão é 10 minutos
  • Verifique qualidade do sinal WiFi (RSSI)
  • Dispositivos mesh dependem do gateway
  • Cancele e tente novamente

11.6 POLLING NÃO FUNCIONA
--------------------------

PROBLEMA: Dados não atualizam automaticamente
SOLUÇÃO:
  • Verifique console do navegador para erros
  • Verifique usuário está autenticado
  • Verifique endpoints /odoo/mos e /id-requests/manual respondem
  • Force restart: pollingManager.restart()

11.7 BANCO DE DADOS CORROMPIDO
-------------------------------

SOLUÇÃO:
  1. Pare todos os serviços: docker compose down
  2. Remova volume: docker volume rm id_visual_2_postgres_data
  3. Suba banco: docker compose up -d db
  4. Aguarde inicialização
  5. Restaure backup: docker compose exec -T db psql -U postgres < backup.sql
  6. Suba todos: docker compose up -d

11.8 PERFORMANCE RUIM
---------------------

PROBLEMA: API lenta
SOLUÇÃO:
  • Verifique recursos: docker stats
  • Aumente workers: uvicorn app.main:app --workers 8
  • Verifique queries lentas no PostgreSQL
  • Adicione índices se necessário

PROBLEMA: Frontend lento
SOLUÇÃO:
  • Limpe cache do navegador
  • Verifique Network tab no DevTools
  • Verifique polling não está muito frequente
  • Build para produção: npm run build

11.9 LOGS E DIAGNÓSTICO
-----------------------

COMANDOS ÚTEIS:
  # Logs do backend
  docker compose logs -f api

  # Logs do ESP32
  pio device monitor

  # Diagnóstico OTA
  python backend/test_ota_diagnostics.py

  # Diagnóstico completo
  curl http://localhost:8000/api/v1/diagnostics

  # Verificar dispositivos
  curl http://localhost:8000/api/v1/ota/devices/diagnostics

═══════════════════════════════════════════════════════════════════════════════
12. GUIA PARA DESENVOLVEDORES
═══════════════════════════════════════════════════════════════════════════════

12.1 SETUP DE DESENVOLVIMENTO
------------------------------

BACKEND:
  cd backend
  uv sync  # ou pip install -r requirements.txt
  alembic upgrade head
  uvicorn app.main:app --reload --port 8000

FRONTEND:
  cd frontend
  npm install
  npm run dev

HARDWARE (ESP32):
  cd hardware
  pio run -t upload -e esp32dev
  pio device monitor

12.2 ESTRUTURA DE CÓDIGO
-------------------------

BACKEND:
  backend/
  ├── app/
  │   ├── api/api_v1/endpoints/  # Endpoints REST
  │   ├── core/                  # Config, security
  │   ├── db/                    # Database session
  │   ├── models/                # SQLModel tables
  │   ├── schemas/               # Pydantic schemas
  │   ├── services/              # Business logic
  │   └── main.py                # FastAPI app
  ├── alembic/                   # Migrations
  └── scripts/                   # Utility scripts

FRONTEND:
  frontend/src/
  ├── app/
  │   ├── components/            # Page components
  │   ├── pages/                 # Route pages
  │   ├── contexts/              # Global state
  │   └── App.tsx                # Root component
  ├── services/
  │   ├── api.ts                 # API client
  │   └── pollingManager.ts      # Polling manager
  └── lib/                       # Utilities

HARDWARE:
  hardware/
  ├── src/
  │   ├── main.cpp               # Firmware principal
  │   ├── ota.cpp                # OTA logic
  │   ├── provisioning.cpp       # Provisioning
  │   └── crypto.cpp             # Cryptography
  ├── include/
  │   └── config.h               # Configuration
  └── platformio.ini             # PlatformIO config

12.3 CONVENÇÕES DE CÓDIGO
--------------------------

COMMITS:
  • Padrão: Conventional Commits em PT-BR
  • Tipos: feat, fix, refactor, docs, chore, style, test
  • Exemplo: feat(api): implementa validacao estrita de payload

PYTHON:
  • Type hints obrigatórios
  • Async/await para I/O
  • Docstrings para funções públicas
  • Black para formatação
  • Ruff para linting

TYPESCRIPT:
  • Strict mode habilitado
  • Proibido uso de any
  • Interfaces para tipos complexos
  • ESLint + Prettier

C++ (ESP32):
  • Comentários em inglês
  • Constantes em UPPER_CASE
  • Funções em camelCase
  • Classes em PascalCase

12.4 TESTES
-----------

BACKEND:
  pytest
  pytest tests/test_andon.py -v
  pytest --cov=app tests/

FRONTEND:
  npm run test
  npm run test:coverage

HARDWARE:
  pio test

12.5 CRIANDO NOVA FEATURE
--------------------------

1. CRIAR BRANCH:
   git checkout -b feat/minha-feature

2. BACKEND:
   • Criar modelo em app/models/
   • Criar schema em app/schemas/
   • Criar serviço em app/services/
   • Criar endpoint em app/api/api_v1/endpoints/
   • Registrar router em app/api/api_v1/api.py
   • Criar migração: alembic revision --autogenerate -m "descrição"
   • Aplicar migração: alembic upgrade head

3. FRONTEND:
   • Criar componente em app/components/
   • Adicionar rota em App.tsx
   • Adicionar método em services/api.ts
   • Testar no navegador

4. TESTAR:
   • Testar backend: pytest
   • Testar frontend: npm run test
   • Testar integração: manual

5. COMMIT:
   git add .
   git commit -m "feat(modulo): adiciona nova funcionalidade"

6. PUSH:
   git push origin feat/minha-feature

7. PULL REQUEST:
   • Criar PR no GitHub
   • Descrever mudanças
   • Aguardar revisão

12.6 DEBUGGING
--------------

BACKEND:
  • Usar breakpoints no VS Code
  • Adicionar print() ou logger.info()
  • Verificar logs: docker compose logs -f api
  • Usar FastAPI Swagger UI: http://localhost:8000/docs

FRONTEND:
  • Usar DevTools do navegador (F12)
  • Console.log() para debug
  • React DevTools extension
  • Network tab para requisições

ESP32:
  • Serial Monitor: pio device monitor
  • Adicionar Serial.println()
  • MQTT logs: mosquitto_sub -h 192.168.10.55 -t "andon/logs/#" -v

12.7 RECURSOS ÚTEIS
-------------------

DOCUMENTAÇÃO:
  • FastAPI: https://fastapi.tiangolo.com
  • SQLModel: https://sqlmodel.tiangolo.com
  • React: https://react.dev
  • Tailwind CSS: https://tailwindcss.com
  • PlatformIO: https://platformio.org

FERRAMENTAS:
  • VS Code: Editor recomendado
  • Postman: Testar API
  • DBeaver: Cliente PostgreSQL
  • MQTT Explorer: Cliente MQTT
  • Docker Desktop: Gerenciar containers

═══════════════════════════════════════════════════════════════════════════════
                              FIM DA DOCUMENTAÇÃO
═══════════════════════════════════════════════════════════════════════════════

Para mais informações, consulte:
  • README.md (raiz do projeto)
  • backend/README.md (documentação do backend)
  • frontend/README.md (documentação do frontend)
  • hardware/README.md (documentação do firmware ESP32)
  • docs/ (documentação técnica detalhada)

Contato:
  • Empresa: AX Engenharia
  • Sistema: ID Visual AX
  • Versão: 2.0.0

Última atualização: Janeiro 2025
