# ID Visual AX

Sistema de gestão de manufatura desenvolvido pela **AX Automação** que integra com o ERP Odoo para gerenciar o ciclo de vida de IDs Visuais (documentações técnicas) para ordens de fabricação, com monitoramento em tempo real do chão de fábrica via dispositivos ESP32.

---

## Índice

- [O que é este sistema](#o-que-é-este-sistema)
- [Arquitetura](#arquitetura)
- [Tech Stack](#tech-stack)
- [Módulos Principais](#módulos-principais)
- [Começando](#começando)
- [Estrutura do Repositório](#estrutura-do-repositório)
- [API](#api)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Documentação](#documentação)
- [Convenções](#convenções)

---

## O que é este sistema

O ID Visual AX resolve um problema específico do processo de fabricação da AX Automação: cada Ordem de Fabricação (MO) criada no Odoo precisa de um "ID Visual" — um conjunto de documentos técnicos (esquemas, diagramas, etiquetas) que acompanham o produto na linha de produção.

O sistema gerencia o ciclo de vida completo desses documentos através de um workflow 5S, integra com o Andon (sistema de alertas físicos do chão de fábrica), gera analytics de produção e permite atualização remota dos dispositivos ESP32.

### Conceitos-chave

| Conceito | Descrição |
|---|---|
| **Batch (Lote)** | Agrupamento de MOs processadas juntas. Status: `ativo`, `concluido`, `finalizado`, `cancelado` |
| **IDRequest** | Solicitação de produção de ID Visual para uma MO específica, vinculada a um Batch |
| **IDRequestTask** | Tarefa individual do workflow 5S por IDRequest (ex: `DOCS_Epson`, `QA_FINAL`). Status: `nao_iniciado`, `montado`, `impresso`, `bloqueado`, `nao_aplicavel` |
| **Andon** | Sistema de alertas em tempo real do chão de fábrica com dispositivos ESP32 e painel TV |
| **Workcenter** | Mesa ou estação de trabalho no chão de fábrica, correspondente a um workcenter do Odoo |
| **OTA** | Atualização Over-The-Air do firmware dos dispositivos ESP32 via MQTT + HTTP |

### Fluxo principal

```
Odoo cria MO
  → Sistema cria IDRequest automaticamente (webhook) ou manualmente
    → IDRequest é adicionada a um Batch
      → Operadores executam tarefas 5S
        → ID Visual é entregue ao chão de fábrica
          → Sistema Andon monitora produção em tempo real
            → Analytics MPR rastreia métricas e KPIs
```

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                           REDE DA FÁBRICA                           │
│                                                                     │
│  ┌──────────┐     ┌─────────────┐     ┌──────────────────────────┐ │
│  │  Odoo    │────►│  Backend    │◄────│  Frontend (React)        │ │
│  │  ERP     │     │  (FastAPI)  │────►│  http://localhost:5173   │ │
│  └──────────┘     └─────┬───┬──┘     └──────────────────────────┘ │
│   JSON-RPC              │   │                                       │
│                    MQTT │   │ WebSocket                             │
│                         ▼   ▼                                       │
│  ┌──────────┐     ┌─────────────┐     ┌──────────────────────────┐ │
│  │  ESP32   │────►│  Mosquitto  │     │  PostgreSQL + Redis      │ │
│  │  (Andon) │     │  (MQTT)     │     │  Docker volumes          │ │
│  └──────────┘     └─────────────┘     └──────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────┐                                       │
│  │  Print Agent (Python)    │  ← roda no PC do chão de fábrica     │
│  │  Polling + Zebra ZPL TCP │                                       │
│  └──────────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Serviços Docker

| Serviço | Imagem | Porta | Descrição |
|---|---|---|---|
| `db` | postgres:15-alpine | 5432 | Banco de dados principal |
| `redis` | redis:7-alpine | 6379 | Cache e fila de tarefas |
| `mosquitto` | build local | 1883 | Broker MQTT para ESP32 |
| `api` | build local | 8000 | Backend FastAPI |
| `frontend` | build local | 5173 | Frontend React |

### Comunicação em tempo real

O sistema usa dois canais em paralelo:

- **MQTT** — comunicação bidirecional entre backend e dispositivos ESP32. O broker Mosquitto roda em container Docker na porta 1883.
- **WebSocket** — streaming de eventos do backend para o frontend. Os clientes se conectam em `/api/v1/devices/ws` e recebem eventos como `andon_call_created`, `ota_progress`, etc.

Para detalhes completos do sistema Andon, veja [docs/architecture/ANDON_SYSTEM_REFERENCE.md](docs/architecture/ANDON_SYSTEM_REFERENCE.md).

---

## Tech Stack

### Backend

| Camada | Tecnologia |
|---|---|
| Runtime | Python 3.11+ |
| Framework | FastAPI com async/await |
| ORM | SQLModel (SQLAlchemy + Pydantic) |
| Banco | PostgreSQL via `asyncpg`; SQLite para dev local |
| Migrações | Alembic (usa driver síncrono, sem `+asyncpg`) |
| Auth | JWT via `python-jose`, senhas via `passlib[bcrypt]` |
| MQTT | `paho-mqtt` (cliente) + Mosquitto (broker) |
| Rate Limiting | `slowapi` |
| AI/Relatórios | OpenAI SDK via OpenRouter |
| Integração ERP | `OdooClient` customizado em JSON-RPC via `httpx` |
| Package Manager | `uv` (ver `pyproject.toml`) |

### Frontend

| Camada | Tecnologia |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 6 |
| Estilo | Tailwind CSS v4 |
| UI | MUI v7 + Radix UI + shadcn-style |
| Roteamento | React Router v7 |
| Charts | Recharts |
| Forms | React Hook Form |
| Notificações | Sonner (toasts) |
| Drag & Drop | react-dnd |
| Package Manager | npm |

### Hardware

| Camada | Tecnologia |
|---|---|
| MCU | ESP32 DevKit v1 (240MHz, 320KB RAM, 4MB Flash) |
| Framework | Arduino/PlatformIO (C++) |
| Conectividade | WiFi 2.4GHz + ESP-MESH híbrido |
| Protocolo | MQTT via PubSubClient |
| Mesh | painlessMesh 1.5.x |
| Criptografia | mbedTLS AES-256-GCM (provisioning viral) |
| OTA | HTTP pull + validação de firmware |

---

## Módulos Principais

### 1. Gestão de IDs Visuais (Core)

Gerencia o fluxo de solicitações de IDs Visuais desde a criação da MO no Odoo até a entrega no chão de fábrica. Inclui workflow 5S com matriz de tarefas por tipo de pacote.

**Endpoints:** `/api/v1/batches`, `/api/v1/id-requests`, `/api/v1/production`

### 2. Sistema Andon (IoT)

Monitora o status de cada workcenter em tempo real através de dispositivos ESP32 com botões físicos e LEDs. Os operadores acionam alertas amarelos (aviso) e vermelhos (parada crítica) diretamente do posto de trabalho.

Quando um botão é pressionado, a sequência é:
1. ESP32 publica evento MQTT → backend processa → atualiza `AndonStatus` → envia estado de volta ao ESP32 via MQTT → ESP32 acende o LED correto
2. Backend emite evento WebSocket → frontend atualiza em tempo real
3. Backend integra com Odoo (pausa WO, posta no chatter, cria atividade)

**Endpoints:** `/api/v1/andon`, `/api/v1/andon/dashboard`, `/api/v1/devices`

**Referência completa:** [docs/architecture/ANDON_SYSTEM_REFERENCE.md](docs/architecture/ANDON_SYSTEM_REFERENCE.md)

### 3. OTA Management

Gerencia o ciclo de vida do firmware dos dispositivos ESP32. Suporta upload manual de binários `.bin` e integração com GitHub Releases para download automático. A atualização é disparada via MQTT e o progresso é reportado em tempo real via WebSocket.

**Endpoints:** `/api/v1/ota/firmware/releases`, `/api/v1/ota/trigger`, `/api/v1/ota/status`

### 4. Integração Odoo

Toda comunicação com o Odoo passa pelo `OdooClient` customizado (JSON-RPC). O sistema usa:
- **Service Account** (variáveis `ODOO_SERVICE_LOGIN/PASSWORD`) para todas as operações após o login
- **Credenciais do usuário** apenas para validação no momento do login
- **Banco de dados ativo** configurável via UI, com proteção do banco de produção

**Endpoints:** `/api/v1/odoo`

### 5. MPR Analytics

Dashboard gerencial com KPIs de produção: volume por período, tempo de ciclo, SLA, ranking e gargalos. Alimentado pelos timestamps do workflow 5S.

**Endpoints:** `/api/v1/mpr/analytics`

**Referência:** [docs/architecture/MPR_ANALYTICS.md](docs/architecture/MPR_ANALYTICS.md)

### 6. Print Agent

Script Python standalone que roda no PC do chão de fábrica. Faz polling na API e envia jobs ZPL para a impressora Zebra via TCP (porta 9100). Pode ser empacotado como executável único com PyInstaller e instalado como serviço Windows via NSSM.

**Localização:** `agents/print_agent/`

**Documentação:** [agents/print_agent/README.md](agents/print_agent/README.md)

---

## Começando

### Pré-requisitos

- Docker Engine 24.0+ e Docker Compose 2.20+
- Git

### Setup

```bash
# 1. Clonar
git clone <repo-url>
cd id_visual_2

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env — NUNCA use os valores de exemplo em produção!

# 3. Subir a stack
docker compose up -d --build

# 4. Rodar migrações
docker compose exec api alembic upgrade head

# 5. Verificar
curl http://localhost:8000/api/v1/health
```

O frontend estará em `http://localhost:5173` e o Swagger UI em `http://localhost:8000/docs`.

### Desenvolvimento local (sem Docker)

Para detalhes sobre setup de ambiente local e fluxo de contribuição, veja [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Estrutura do Repositório

```
/
├── backend/                  # FastAPI
│   ├── app/
│   │   ├── api/api_v1/
│   │   │   ├── api.py        # Registro de todos os routers
│   │   │   └── endpoints/    # Um arquivo por recurso
│   │   ├── core/             # Config, security
│   │   ├── db/               # Engine, sessão, init_db()
│   │   ├── models/           # SQLModel — tabelas do banco
│   │   ├── schemas/          # Pydantic — request/response
│   │   ├── services/         # Lógica de negócio
│   │   └── main.py           # App factory, middleware, lifespan
│   ├── alembic/              # Migrações do banco
│   └── scripts/              # Scripts utilitários
│
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── components/   # Componentes de feature
│       │   └── pages/        # Componentes de rota
│       ├── services/
│       │   └── api.ts        # Cliente HTTP centralizado
│       ├── contexts/         # Providers globais
│       └── types/            # Types TypeScript compartilhados
│
├── hardware/                 # Firmware ESP32
│   ├── src/                  # Código-fonte C++
│   ├── include/
│   │   └── config.h          # Todas as constantes — edite aqui
│   ├── platformio.ini        # Configuração de build
│   └── docs/                 # Documentação técnica do firmware
│
├── agents/
│   └── print_agent/          # Agente de impressão Zebra
│
├── mosquitto/                # Config do broker MQTT
├── docs/                     # Documentação do projeto
├── CHANGELOG.md
├── CONTRIBUTING.md
└── docker-compose.yml
```

---

## API

A API segue o padrão REST com prefixo `/api/v1`. Autenticação via JWT no header `Authorization: Bearer <token>`.

### Grupos de endpoints

| Grupo | Prefixo | Descrição |
|---|---|---|
| Auth | `/auth` | Login, token refresh, perfil |
| Batches | `/batches` | CRUD de lotes |
| ID Requests | `/id-requests` | Solicitações de ID Visual |
| Production | `/production` | Portal de produção (solicitações manuais) |
| Odoo | `/odoo` | Integração com o Odoo (MOs, usuários, DBs) |
| Andon | `/andon` | Status, chamados, histórico |
| Andon Dashboard | `/andon/dashboard` | Dados consolidados para painel |
| Devices | `/devices` | Gestão de dispositivos ESP32 + WebSocket |
| OTA | `/ota` | Firmware releases, trigger de atualização |
| MPR Analytics | `/mpr/analytics` | KPIs e dashboards de produção |
| ID Visual Analytics | `/id-visual/analytics` | Analytics de IDs Visuais |
| Settings | `/settings` | Configurações do sistema |
| Print | `/print` | Fila de impressão |
| Webhook | `/webhook` | Recepção de webhooks do Odoo |
| Agent | `/agent` | Relatórios gerados por IA |
| Diagnostics | `/diagnostics` | Diagnósticos do sistema |

Documentação interativa completa: `http://localhost:8000/docs`

---

## Variáveis de Ambiente

As variáveis críticas estão no `.env.example` na raiz. As principais:

### Segurança (obrigatório alterar antes de produção)

```bash
SECRET_KEY=                   # JWT signing key — gerar com: openssl rand -hex 32
ENCRYPTION_KEY=               # Chave de criptografia — gerar com: openssl rand -base64 32
ODOO_WEBHOOK_SECRET=          # Secret do webhook Odoo — gerar com: openssl rand -hex 32
POSTGRES_PASSWORD=            # Senha do banco
```

### Integração Odoo

```bash
ODOO_URL=                     # URL base do servidor Odoo (ex: https://empresa.odoo.com)
ODOO_DB=                      # Banco fallback de emergência (não é o banco ativo)
ODOO_SERVICE_LOGIN=           # Email da conta de serviço (não é a senha do usuário)
ODOO_SERVICE_PASSWORD=        # Senha/API key da conta de serviço
```

> **Importante:** A conta de serviço (`ODOO_SERVICE_LOGIN`) é usada em todas as operações após o login. As credenciais do usuário final são usadas apenas para validação no momento do login e nunca são armazenadas.

### IoT / Hardware

```bash
MQTT_BROKER_HOST=             # IP do servidor com o broker Mosquitto
MQTT_BROKER_PORT=1883
ANDON_ENGINEERING_USER_ID=    # ID do usuário Odoo para atividades de parada crítica
```

### OTA

```bash
GITHUB_REPO_OWNER=            # Owner do repositório GitHub para download de firmware
GITHUB_REPO_NAME=             # Nome do repositório
GITHUB_TOKEN=                 # Token GitHub (opcional — eleva rate limit)
OTA_STORAGE_PATH=             # Caminho local para armazenar arquivos .bin
BACKEND_HOST=                 # Host:porta do backend (para construir URLs de download)
```

### Frontend

```bash
VITE_API_URL=                 # URL base da API (padrão: http://localhost:8000/api/v1)
```

---

## Documentação

```
docs/
├── README.md                         ← índice desta pasta
├── architecture/
│   ├── ANDON_SYSTEM_REFERENCE.md     ← referência completa do Andon
│   ├── ANDON_PAUSE_SYNC_FLOW.md      ← fluxo de pausa/retomada bidirecional
│   ├── DATABASE_PROTECTION_SYSTEM.md ← proteção do banco de produção
│   ├── MPR_ANALYTICS.md              ← módulo de analytics
│   ├── IMPRESSAO_ZEBRA.md            ← integração impressão Zebra
│   └── ANALISE_ARQUITETURA_PERSISTENCIA.md  ← débito técnico identificado
├── guides/
│   ├── DEPLOYMENT.md                 ← deploy, Nginx, SSL, backup
│   ├── MIGRATION_GUIDE.md            ← migração v1 → v2
│   ├── TESTING_GUIDE.md              ← cenários de teste
│   ├── MQTT_BROKER_SETUP.md          ← setup do Mosquitto
│   ├── ODOO_WEBHOOK_SETUP.md         ← configuração de webhooks no Odoo 19
│   └── OTA_TROUBLESHOOTING.md        ← troubleshooting OTA
├── hardware/
│   ├── MANUAL_OPERACIONAL_CONTROLADOR_ANDON.md   ← manual do operador
│   └── MANUAL_TECNICO_CONTROLADOR_ANDON.md       ← manual técnico do ESP32
└── operations/
    ├── SECURITY_CHECKLIST.md         ← checklist OWASP (status: aprovado)
    ├── SECURITY_PRODUCTION_GUIDE.md  ← guia de segurança em produção
    └── PRE_PRODUCTION_AUDIT.md       ← auditoria pré go-live
```

**Firmware ESP32:** A documentação técnica completa do firmware está em [`hardware/docs/`](hardware/docs/) com índice em [`hardware/docs/00_INDICE.md`](hardware/docs/00_INDICE.md). O [`hardware/README.md`](hardware/README.md) é o ponto de entrada.

---

## Convenções

### Commits

O projeto usa [Conventional Commits](https://www.conventionalcommits.org/) em pt-BR:

```
feat(andon): adiciona suporte a botão extra no controlador
fix(api): corrige race condition no handler de pausa MQTT
refactor(frontend): extrai lógica de polling para hook customizado
docs(deployment): atualiza guia de nginx com configuração websocket
```

### Idiomas no código

- **Código** (variáveis, funções, classes): inglês
- **Strings de UI** exibidas ao usuário: pt-BR
- **Status/enums de domínio**: pt-BR (ex: `"ativo"`, `"concluido"`, `"nao_iniciado"`)
- **Mensagens de commit e comentários de regra de negócio**: pt-BR

### Backend

- Endpoints são `async`, sempre
- UUIDs como chaves primárias
- Locking otimista via campo `version` em entidades mutáveis
- Após mutação que afeta estado sincronizado, chamar `update_sync_version()`

### Frontend

- Token JWT armazenado em `localStorage` como `id_visual_token`
- Rotas protegidas verificam `isAuthenticated` em `App.tsx`

---

## Contribuição

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para o guia completo de configuração de ambiente, padrões de código e fluxo de trabalho.

---

## Licença

Propriedade da **AX Automação**. Repositório privado — uso interno.
