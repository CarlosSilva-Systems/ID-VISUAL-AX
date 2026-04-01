# Backend ID Visual AX

FastAPI Backend para Integração Odoo e Gestão de ID Visual.

## Visão Geral

O backend do ID Visual AX é uma aplicação FastAPI que gerencia a integração com o ERP Odoo e controla o fluxo de trabalho de identificações visuais para ordens de manufatura.

### Principais Funcionalidades

- **Integração Odoo**: Conexão com Odoo ERP via JSON-RPC para buscar ordens de manufatura, documentos e atividades
- **Seleção Dinâmica de Banco de Dados**: Permite alternar entre bancos de dados Odoo (produção/teste) via interface gráfica
- **Gestão de Lotes (Batches)**: Criação e gerenciamento de lotes de IDs visuais com workflow 5S
- **Sistema Andon**: Alertas de chão de fábrica com chamadas amarelas/vermelhas
- **Analytics MPR**: Dashboard de análise de produção e performance
- **Relatórios Customizados**: Geração de relatórios via IA

## Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do diretório `backend/` baseado no `.env.example`:

```bash
# Banco de Dados Local
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/id_visual
# ou para SQLite local:
# DATABASE_URL=sqlite+aiosqlite:///./id_visual.db

# Segurança
SECRET_KEY=your-secret-key-here  # Mude em produção!
ENCRYPTION_KEY=your-encryption-key-here  # Mude em produção!

# Integração Odoo
ODOO_URL=https://axengenharia1.odoo.com
ODOO_DB=axengenharia1  # Fallback de emergência (não usado se system_setting existe)

# Conta de Serviço (Service Account)
# Esta conta é usada pelo sistema para todas as operações no Odoo
ODOO_SERVICE_LOGIN=service_account@exemplo.com
ODOO_SERVICE_PASSWORD=sua_senha_ou_apikey

# Tipo de autenticação (jsonrpc_password ou json2_apikey)
ODOO_AUTH_TYPE=jsonrpc_password

# Webhook
ODOO_WEBHOOK_SECRET=your-webhook-secret  # Mude em produção!

# IA (OpenRouter)
OPENROUTER_API_KEY=your-openrouter-key
```

**Importante sobre Credenciais:**
- `ODOO_SERVICE_LOGIN` e `ODOO_SERVICE_PASSWORD`: Conta técnica usada pelo sistema para operações no Odoo
- Credenciais de usuário são fornecidas no login e **NUNCA** armazenadas no banco de dados
- O sistema separa claramente Service_Account (operações) de User_Credentials (validação de login)

### Instalação

```bash
# Instalar dependências com uv
uv sync

# Ou com pip
pip install -r requirements.txt

# Executar migrações
alembic upgrade head

# Iniciar servidor de desenvolvimento
uvicorn app.main:app --reload --port 8000
```

## Novos Endpoints: Seleção Dinâmica de Banco de Dados

### GET /api/v1/odoo/databases

Lista todos os bancos de dados disponíveis no servidor Odoo configurado.

**Response:**
```json
[
  {
    "name": "axengenharia1",
    "type": "production",
    "selectable": false,
    "is_active": false
  },
  {
    "name": "id-visual-3",
    "type": "test",
    "selectable": true,
    "is_active": true
  }
]
```

**Classificação:**
- `production`: Banco `axengenharia1` (protegido, não selecionável)
- `test`: Qualquer outro banco (selecionável)

### POST /api/v1/odoo/databases/select

Seleciona um banco de dados Odoo para uso pelo sistema.

**Request:**
```json
{
  "database": "id-visual-3"
}
```

**Response:**
```json
{
  "status": "success",
  "database": "id-visual-3",
  "connection_ok": true
}
```

**Validações:**
- Rejeita banco de produção (`axengenharia1`) com HTTP 403
- Valida nome do banco (apenas alfanuméricos, hífen, underscore)
- Testa conexão antes de persistir
- Persiste em `system_setting` com chave `active_odoo_db`

## Arquitetura de Banco de Dados Ativo

O sistema implementa uma cadeia de fallback robusta para determinar o banco de dados Odoo ativo:

```
1. system_setting.active_odoo_db (prioridade máxima)
   ↓ (se não existir)
2. "id-visual-3" (padrão hardcoded)
   ↓ (se DB não disponível)
3. settings.ODOO_DB do .env (fallback de emergência)
```

### Helper: `get_active_odoo_db()`

Função centralizada em `app/services/odoo_utils.py` que retorna o banco ativo:

```python
from app.services.odoo_utils import get_active_odoo_db

async def my_endpoint(session: AsyncSession = Depends(get_session)):
    active_db = await get_active_odoo_db(session)
    # Use active_db para operações Odoo
```

### Dependency: `get_odoo_client()`

Todos os endpoints devem usar o dependency `get_odoo_client()` ao invés de instanciar `OdooClient` manualmente:

```python
from app.api.deps import get_odoo_client

@router.get("/my-endpoint")
async def my_endpoint(
    client: OdooClient = Depends(get_odoo_client)
):
    # Client já está configurado com Service_Account e Active_Database
    data = await client.search_read('mrp.production', ...)
    return data
```

**Benefícios:**
- Usa automaticamente Service_Account (ODOO_SERVICE_LOGIN/PASSWORD)
- Usa automaticamente Active_Database (de system_setting)
- Gerenciamento automático de lifecycle (close no finally)
- Suporte a modo teste por usuário (via user_config)

## Fluxo de Autenticação

### Login (POST /api/v1/auth/login)

1. Usuário fornece email e senha
2. Sistema valida credenciais no Odoo usando Active_Database
3. Se válido, cria JWT local com `uid`, `name`, `email`
4. **Senha do usuário NUNCA é armazenada**

### Operações Pós-Login

Todas as operações no Odoo após login usam **Service_Account**:
- `ODOO_SERVICE_LOGIN` e `ODOO_SERVICE_PASSWORD`
- Active_Database (de system_setting)
- Sessão local do usuário é usada apenas para controle de permissões internas

### Logout

- Remove JWT do localStorage (frontend)
- **NUNCA** chama `/web/session/destroy` para Service_Account
- Service_Account permanece autenticada para operações do sistema

## Estrutura de Diretórios

```
backend/
├── app/
│   ├── api/
│   │   ├── api_v1/
│   │   │   ├── endpoints/     # Endpoints REST
│   │   │   └── api.py         # Agregação de routers
│   │   └── deps.py            # Dependencies (get_session, get_odoo_client, etc.)
│   ├── core/
│   │   ├── config.py          # Configurações (Pydantic Settings)
│   │   └── security.py        # JWT helpers
│   ├── db/
│   │   └── session.py         # Engine e session factory
│   ├── models/                # SQLModel table models
│   ├── schemas/               # Pydantic request/response schemas
│   ├── services/              # Business logic
│   │   ├── odoo_client.py     # Cliente Odoo JSON-RPC
│   │   └── odoo_utils.py      # Helpers (get_active_odoo_db, etc.)
│   └── main.py                # FastAPI app factory
├── alembic/                   # Migrações de banco de dados
└── scripts/                   # Scripts utilitários
```

## Desenvolvimento

### Criar Nova Migração

```bash
alembic revision --autogenerate -m "descrição da mudança"
alembic upgrade head
```

### Executar Testes

```bash
pytest
```

### Logs e Debugging

O sistema usa logging estruturado com níveis:
- `INFO`: Operações normais
- `WARNING`: Fallbacks e situações não ideais
- `ERROR`: Erros que não impedem o sistema de funcionar
- `CRITICAL`: Erros que impedem operações críticas

Logs incluem `request_id` único para rastreabilidade sem expor dados sensíveis.

## Segurança

### Proteção de Credenciais

- `ODOO_SERVICE_PASSWORD` **NUNCA** aparece em logs, stack traces ou respostas HTTP
- Mensagens de erro são genéricas para não revelar detalhes internos
- Validação de input no backend (não confiar apenas no frontend)

### Proteção do Banco de Produção

- Banco `axengenharia1` não pode ser selecionado via UI durante período de testes
- Validação no backend com HTTP 403
- Mensagem de erro clara e específica

### Validação de Startup

O sistema valida variáveis de ambiente críticas no startup:
```python
@app.on_event("startup")
async def validate_environment():
    required_vars = [
        "ODOO_URL",
        "ODOO_SERVICE_LOGIN",
        "ODOO_SERVICE_PASSWORD"
    ]
    # Lança RuntimeError se variáveis faltando
```

## Troubleshooting

### Erro: "Missing required environment variables"

Verifique se `.env` contém todas as variáveis obrigatórias:
- `ODOO_URL`
- `ODOO_SERVICE_LOGIN`
- `ODOO_SERVICE_PASSWORD`

### Erro: "Erro de Conectividade Odoo"

1. Verifique se `ODOO_URL` está correto
2. Verifique se `ODOO_SERVICE_LOGIN` e `ODOO_SERVICE_PASSWORD` estão corretos
3. Verifique se o banco de dados existe no servidor Odoo
4. Verifique conectividade de rede

### Banco de Dados Ativo Incorreto

1. Verifique `system_setting` no banco local:
   ```sql
   SELECT * FROM system_setting WHERE key = 'active_odoo_db';
   ```
2. Se necessário, atualize manualmente:
   ```sql
   UPDATE system_setting SET value = 'id-visual-3' WHERE key = 'active_odoo_db';
   ```

## Contribuindo

1. Crie uma branch para sua feature
2. Faça commits atômicos seguindo Conventional Commits em PT-BR
3. Garanta que working tree está limpa antes de finalizar
4. Abra um Pull Request com descrição detalhada

## OTA Management

### Visão Geral

O sistema OTA (Over-The-Air) Management permite atualização remota de firmware para dispositivos ESP32 do sistema Andon. O backend atua como "garçom de firmware", integrando-se com GitHub Releases para downloads automáticos e hospedando arquivos .bin via HTTP estático.

### Arquitetura

```
Frontend → Backend API → MQTT Broker → ESP32 Devices
                ↓
         Static File Server (HTTP)
                ↓
         ESP32 Downloads Firmware
```

### Endpoints da API

#### Gerenciamento de Firmware

**GET /api/v1/ota/firmware/releases**
- Lista todas as versões de firmware disponíveis
- Retorna releases ordenados por data (mais recente primeiro)
- Inclui contagem de dispositivos por versão

**POST /api/v1/ota/firmware/check-github**
- Verifica se há nova versão no GitHub
- Compara com versão mais recente no banco local
- Retorna `update_available: true/false`

**POST /api/v1/ota/firmware/download-github**
- Baixa firmware do GitHub Release
- Body: `{ "version": "1.2.0" }` (opcional - se omitido, baixa latest)
- Salva em `storage/ota/firmware/`

**POST /api/v1/ota/firmware/upload**
- Upload manual de firmware via multipart/form-data
- Campos: `file` (.bin, 100KB-2MB), `version` (formato X.Y.Z)
- Valida extensão, tamanho e formato de versão

**DELETE /api/v1/ota/firmware/{release_id}**
- Deleta firmware release e arquivo .bin do storage

#### Operações OTA

**POST /api/v1/ota/trigger**
- Dispara atualização OTA em massa para todos os dispositivos
- Body: `{ "firmware_release_id": "uuid" }`
- Cria logs de atualização e publica comando MQTT
- Rate limited: 1 requisição/segundo

**GET /api/v1/ota/status**
- Retorna status de atualização de todos os dispositivos
- Inclui versão atual, versão alvo, progresso e erros

**GET /api/v1/ota/history/{mac_address}**
- Retorna histórico completo de atualizações de um dispositivo
- Ordenado por data (mais recente primeiro)

### Tópicos MQTT

#### andon/ota/trigger (Backend → ESP32)
Comando para iniciar atualização OTA.

**Payload:**
```json
{
  "version": "1.2.0",
  "url": "http://192.168.10.55:8000/static/ota/firmware-1.2.0.bin",
  "size": 1234567
}
```

#### andon/ota/progress/{mac} (ESP32 → Backend)
Progresso de atualização reportado pelo dispositivo.

**Payload:**
```json
{
  "status": "downloading",  // downloading, installing, success, failed
  "progress": 45,           // 0-100
  "error": null             // string ou null
}
```

### Hospedagem Estática de Firmware

Arquivos .bin são servidos via HTTP puro (sem SSL) para otimizar performance nos ESP32:

- **Rota**: `/static/ota/firmware-{version}.bin`
- **Headers**: `Content-Type: application/octet-stream`, `Cache-Control: no-cache`
- **Storage**: Volume Docker em `/app/storage/ota/firmware/`

### Integração com GitHub

Configure as variáveis de ambiente para habilitar downloads automáticos:

```bash
GITHUB_REPO_OWNER=seu_usuario
GITHUB_REPO_NAME=seu_repositorio
GITHUB_TOKEN=ghp_xxx  # Necessário apenas para repos privados
```

O sistema busca o asset `.bin` no release mais recente e baixa automaticamente.

### Fluxo de Atualização OTA

1. **Preparação**: Gestor faz upload manual ou baixa do GitHub
2. **Trigger**: Gestor clica "Atualizar Todos" na interface
3. **Comando MQTT**: Backend publica comando no tópico `andon/ota/trigger`
4. **Download**: ESP32 baixa firmware via HTTP do backend
5. **Instalação**: ESP32 escreve firmware na OTA partition
6. **Reboot**: ESP32 reinicia com novo firmware
7. **Validação**: ESP32 valida boot e marca firmware como válido
8. **Rollback**: Se validação falhar, ESP32 reverte automaticamente

### Segurança

- **Validação de Input**: Extensão .bin, tamanho 100KB-2MB, formato de versão X.Y.Z
- **Path Traversal Prevention**: Rejeita nomes de arquivo com `..`, `/`, `\`
- **Rate Limiting**: Endpoint de trigger limitado a 1 req/segundo
- **Auditoria**: Todos os logs incluem username e timestamp
- **Erro Sanitizado**: Stack traces nunca expostos ao cliente

### Troubleshooting OTA

#### Erro: "Firmware release não encontrado"
- Verifique se o firmware foi baixado/uploaded corretamente
- Consulte `GET /api/v1/ota/firmware/releases` para listar versões disponíveis

#### Erro: "Arquivo de firmware não encontrado no storage"
- Verifique se o arquivo existe em `storage/ota/firmware/`
- Verifique permissões do diretório

#### Dispositivo não inicia download
- Verifique conectividade MQTT do dispositivo
- Verifique logs do dispositivo via serial monitor
- Verifique se URL do firmware está acessível pelo ESP32

#### Download falha com timeout
- Verifique conectividade de rede do ESP32
- Verifique se `BACKEND_HOST` está configurado corretamente
- Aumente timeout se rede for lenta

#### Firmware instala mas dispositivo não reinicia
- Verifique logs do dispositivo via serial monitor
- Pode ser falha na validação de boot
- Rollback automático deve ocorrer após 3 tentativas

## Licença

Proprietary - AX Engenharia

