# Fluxo de Sincronização de Pausa/Retomada do Andon

## Visão Geral

Este documento descreve o fluxo bidirecional completo de sincronização de pausas entre:
- **Botão físico ESP32** (GPIO 33)
- **Interface web** (frontend React)
- **ERP Odoo** (workorder pause/resume)

## Arquitetura

```
┌─────────────┐         MQTT          ┌──────────────┐         HTTP/JSON-RPC        ┌──────────┐
│   ESP32     │ ◄──────────────────► │   Backend    │ ◄────────────────────────► │   Odoo   │
│  (Botão)    │  andon/button/pause  │   FastAPI    │      pause_workorder()      │   ERP    │
└─────────────┘  andon/state/{mac}   └──────────────┘      resume_workorder()     └──────────┘
                                             ▲                                            │
                                             │                                            │
                                             │ WebSocket                                  │
                                             ▼                                            │
                                      ┌──────────────┐                                    │
                                      │   Frontend   │ ◄──────────────────────────────────┘
                                      │    React     │         Webhook (opcional)
                                      └──────────────┘
```

## Fluxos Implementados

### 1. Pausa via Botão Físico ESP32

**Trigger:** Operador pressiona GPIO 33 no controlador Andon

**Fluxo:**
1. ESP32 publica `andon/button/{mac}/pause` → `PRESSED`
2. Backend (`mqtt_service._handle_pause`):
   - Verifica estado atual em `AndonStatus`
   - Se `status == "cinza"` → **RETOMAR**
   - Caso contrário → **PAUSAR**
3. **PAUSAR:**
   - Salva estado anterior em `AndonStatus.updated_by = "prev:{status}"`
   - Atualiza `AndonStatus.status = "cinza"`
   - Chama `odoo.pause_workorder(wo_id)` (para timer no Odoo)
   - Publica `andon/state/{mac}` → `GRAY` (apaga LEDs)
   - Emite WebSocket `production_paused`
4. **RETOMAR:**
   - Restaura estado anterior de `updated_by`
   - Atualiza `AndonStatus.status = {prev_status}`
   - Chama `odoo.resume_workorder(wo_id)` (retoma timer no Odoo)
   - Publica `andon/state/{mac}` → `{prev_status}` (acende LED correspondente)
   - Emite WebSocket `production_resumed`

### 2. Pausa via Interface Web

**Trigger:** Usuário clica em "Pausar" no dashboard Andon

**Fluxo:**
1. Frontend chama `POST /api/v1/andon/trigger/cinza`
2. Backend (`andon.trigger_andon_basic`):
   - Chama `update_or_create_status(status="cinza")`
   - Atualiza `AndonStatus.status = "cinza"`
   - Busca dispositivo ESP32 vinculado ao workcenter
   - Publica `andon/state/{mac}` → `GRAY` ✅
   - Enfileira `pause_workorder` em `SyncQueue`
3. ESP32 recebe `andon/state/{mac}` → `GRAY`:
   - Atualiza `g_andonStatus = "GRAY"`
   - Apaga todos os LEDs
   - Ativa blink azul (modo pause)

### 3. Pausa via Odoo (Webhook)

**Trigger:** Usuário pausa workorder diretamente no Odoo

**Fluxo:**
1. Odoo envia webhook `POST /api/v1/webhook/odoo/workorder`:
   ```json
   {
     "wo_id": 123,
     "new_state": "pause",
     "timestamp": 1234567890.0,
     "company_id": 1
   }
   ```
2. Backend (`webhook.odoo_workorder_webhook`):
   - Busca workcenter da WO
   - Atualiza `AndonStatus.status = "cinza"`
   - Salva estado anterior em `updated_by = "prev:{status}"`
   - **NOVO:** Chama `send_andon_state_by_workcenter(wc_id, "GRAY")` ✅
   - Emite `update_sync_version("andon_version")`
3. ESP32 recebe `andon/state/{mac}` → `GRAY`:
   - Atualiza `g_andonStatus = "GRAY"`
   - Apaga todos os LEDs
   - Ativa blink azul (modo pause)

### 4. Retomada via Odoo (Webhook)

**Trigger:** Usuário retoma workorder diretamente no Odoo

**Fluxo:**
1. Odoo envia webhook `POST /api/v1/webhook/odoo/workorder`:
   ```json
   {
     "wo_id": 123,
     "new_state": "progress",
     "timestamp": 1234567890.0,
     "company_id": 1
   }
   ```
2. Backend (`webhook.odoo_workorder_webhook`):
   - Busca workcenter da WO
   - Atualiza `AndonStatus.status = "verde"`
   - Resolve chamados ativos automaticamente
   - **NOVO:** Chama `send_andon_state_by_workcenter(wc_id, "GREEN")` ✅
   - Emite `update_sync_version("andon_version")`
3. ESP32 recebe `andon/state/{mac}` → `GREEN`:
   - Atualiza `g_andonStatus = "GREEN"`
   - Acende LED verde
   - Desativa blink azul

## Funções Críticas

### Backend: `mqtt_service.send_andon_state_by_workcenter()`

```python
async def send_andon_state_by_workcenter(workcenter_id: int, state: str):
    """
    Busca o dispositivo ESP32 vinculado ao workcenter e envia o estado via MQTT.
    
    Usado para sincronizar o ESP32 quando o estado muda no Odoo ou no backend.
    """
```

**Chamada em:**
- ✅ `webhook.odoo_workorder_webhook()` — quando Odoo pausa/retoma
- ✅ `andon.update_or_create_status()` — quando app web muda estado
- ✅ `mqtt_service._handle_pause()` — quando botão físico é pressionado

### Backend: `andon.update_or_create_status()`

```python
async def update_or_create_status(session, wc_id, wc_name, status, user):
    """
    Atualiza AndonStatus e envia estado MQTT para ESP32 vinculado.
    
    Garante sincronização automática entre backend e hardware.
    """
```

**Mapeamento de Estados:**
```python
status_map = {
    "verde": "GREEN",
    "amarelo": "YELLOW",
    "vermelho": "RED",
    "cinza": "GRAY"
}
```

### ESP32: `onMqttMessage()` — Handler de `andon/state/{mac}`

```cpp
if (String(topic) == stateTopic) {
    payloadStr.trim();
    payloadStr.toUpperCase();
    if (payloadStr == "GREEN" || payloadStr == "YELLOW" ||
        payloadStr == "RED"   || payloadStr == "GRAY"   ||
        payloadStr == "UNASSIGNED") {
        g_andonStatus = payloadStr;
        g_lastAndonUpdate = millis();
        updateAndonLEDs();
        logSerial("ANDON STATE: " + payloadStr + " (fonte: Odoo via MQTT)");
    }
}
```

## Estados Possíveis

| Estado Backend | Estado MQTT | LED ESP32 | Significado |
|----------------|-------------|-----------|-------------|
| `verde` | `GREEN` | 🟢 Verde fixo | Produção em andamento |
| `amarelo` | `YELLOW` | 🟡 Amarelo fixo | Alerta (produção continua) |
| `vermelho` | `RED` | 🔴 Vermelho fixo | Parada crítica |
| `cinza` | `GRAY` | 🔵 Azul piscando | Pausado / Sem OP |
| `amarelo_suave` | `YELLOW` | 🟡 Amarelo fixo | Alerta suave |

## Testes de Validação

### Teste 1: Pausa via Botão Físico
1. Pressionar GPIO 33 no ESP32
2. **Esperado:**
   - LEDs apagam e azul pisca
   - Dashboard mostra "Produção pausada"
   - Timer no Odoo para

### Teste 2: Pausa via Dashboard Web
1. Clicar em "Pausar" no dashboard
2. **Esperado:**
   - LEDs do ESP32 apagam e azul pisca
   - Timer no Odoo para

### Teste 3: Pausa via Odoo
1. Pausar workorder diretamente no Odoo
2. **Esperado:**
   - LEDs do ESP32 apagam e azul pisca ✅ (NOVO)
   - Dashboard mostra "Produção pausada"

### Teste 4: Retomada via Botão Físico
1. Pressionar GPIO 33 novamente (toggle)
2. **Esperado:**
   - LED verde acende
   - Dashboard mostra "Produção em andamento"
   - Timer no Odoo retoma

### Teste 5: Retomada via Odoo
1. Retomar workorder diretamente no Odoo
2. **Esperado:**
   - LED verde acende no ESP32 ✅ (NOVO)
   - Dashboard mostra "Produção em andamento"

## Configuração do Webhook no Odoo 19

O Odoo 19 possui suporte nativo para webhooks via **Ações Automatizadas**. Siga os passos:

### 1. Criar Ação Automatizada

1. Acesse **Configurações** → **Técnico** → **Automação** → **Ações Automatizadas**
2. Clique em **Criar**
3. Preencha os campos:

**Configuração Básica:**
- **Nome:** `Andon - Sincronizar Estado de Workorder`
- **Modelo:** `Ordem de Trabalho de Fabricação` (`mrp.workorder`)
- **Gatilho:** `Ao atualizar`
- **Aplicar em:** Adicione domínio (filtro):
  ```
  [('state', 'in', ['ready', 'progress', 'pause', 'pending', 'done', 'cancel'])]
  ```

**Campos Gatilho:**
- Adicione o campo: `Status` (`state`)
  - Isso garante que o webhook só dispara quando o estado mudar

**Ação:**
- **Tipo de Ação:** `Enviar notificação de Webhook`
- **URL:** `http://SEU_BACKEND_IP:8000/api/v1/webhook/odoo/workorder`
  - Exemplo: `http://192.168.1.28/api/v1/webhook/odoo/workorder`
  - **IMPORTANTE:** Use o IP/domínio acessível pelo servidor Odoo
- **Cabeçalhos HTTP:**
  ```json
  {
    "Content-Type": "application/json",
    "X-Andon-Webhook-Secret": "SEU_SECRET_AQUI"
  }
  ```
  - Substitua `SEU_SECRET_AQUI` pelo valor de `ODOO_WEBHOOK_SECRET` do seu `.env`

### 2. Formato do Payload (Automático)

O Odoo 19 envia automaticamente este payload:

```json
{
  "_action": "Enviar notificação de Webhook(#NewId_0x70eca8654680)",
  "_id": 429,
  "_model": "mrp.workorder",
  "id": 429,
  "state": "done"
}
```

**Campos importantes:**
- `id`: ID da workorder
- `state`: Estado atual (`ready`, `progress`, `pause`, `pending`, `done`, `cancel`)
- `_model`: Sempre `mrp.workorder`

### 3. Mapeamento de Estados

| Estado Odoo | Estado Andon | LED ESP32 | Descrição |
|-------------|--------------|-----------|-----------|
| `progress` | `verde` | 🟢 Verde | Produção em andamento |
| `pause` | `cinza` | 🔵 Azul piscando | Pausado manualmente |
| `pending` | `cinza` | 🔵 Azul piscando | Aguardando componentes |
| `ready` | `cinza` | 🔵 Azul piscando | Pronto para iniciar |
| `done` | `cinza` | 🔵 Azul piscando | Concluído |
| `cancel` | `cinza` | 🔵 Azul piscando | Cancelado |

### 4. Testar o Webhook

1. **Criar uma workorder de teste** no Odoo
2. **Iniciar a workorder** (botão "Iniciar")
   - ✅ ESP32 deve acender LED verde
   - ✅ Dashboard deve mostrar "Produção em andamento"
3. **Pausar a workorder** (botão "Pausar")
   - ✅ ESP32 deve apagar LEDs e piscar azul
   - ✅ Dashboard deve mostrar "Produção pausada"
4. **Retomar a workorder** (botão "Retomar")
   - ✅ ESP32 deve acender LED verde novamente
   - ✅ Dashboard deve mostrar "Produção em andamento"

### 5. Verificar Logs

**Backend (FastAPI):**
```bash
# Ver logs do webhook
docker compose logs -f api | grep Webhook
```

**Odoo:**
- Acesse a ação automatizada criada
- Clique em **Ação** → **Ver Logs de Execução**
- Verifique se há erros de conexão ou autenticação

### 6. Troubleshooting

**Webhook não dispara:**
- ✅ Verificar se o campo `Status` está em **Campos Gatilho**
- ✅ Verificar se o domínio (filtro) está correto
- ✅ Verificar se a ação está **Ativa** (checkbox marcado)

**Erro 401 Unauthorized:**
- ✅ Verificar se `X-Andon-Webhook-Secret` no cabeçalho está correto
- ✅ Verificar se `ODOO_WEBHOOK_SECRET` no `.env` do backend está correto

**Erro 404 Not Found:**
- ✅ Verificar se a URL está correta (incluir `/api/v1/webhook/odoo/workorder`)
- ✅ Verificar se o backend está acessível pelo servidor Odoo

**ESP32 não recebe estado:**
- ✅ Verificar se o dispositivo ESP32 está vinculado ao workcenter no banco
- ✅ Verificar se o broker MQTT está acessível pelo backend
- ✅ Verificar logs do backend: `docker compose logs -f api | grep "send_andon_state_by_workcenter"`

---

## Configuração Alternativa (Odoo < 19 ou Customizado)

Se você estiver usando Odoo < 19 ou precisar de mais controle, use código Python:

### Criar Ação Automatizada com Código Python

1. **Modelo:** `mrp.workorder`
2. **Gatilho:** `Ao atualizar`
3. **Aplicar em:** `[('state', 'in', ['progress', 'pause', 'pending'])]`
4. **Ação:** `Executar código Python`
5. **Código:**

```python
import requests
import time
import json
import logging

_logger = logging.getLogger(__name__)

url = "http://SEU_BACKEND_IP:8000/api/v1/webhook/odoo/workorder"
headers = {
    "Content-Type": "application/json",
    "X-Andon-Webhook-Secret": "SEU_SECRET_AQUI"
}
payload = {
    "wo_id": record.id,
    "new_state": record.state,
    "timestamp": time.time(),
    "company_id": record.company_id.id
}

try:
    response = requests.post(url, json=payload, headers=headers, timeout=5)
    response.raise_for_status()
    _logger.info(f"[Andon Webhook] WO {record.id} → {record.state} enviado com sucesso")
except Exception as e:
    # Log silencioso — não bloquear operação do Odoo
    _logger.warning(f"[Andon Webhook] Falha ao enviar WO {record.id}: {e}")
```

## Troubleshooting

### ESP32 não recebe estado do Odoo
- ✅ **Verificar:** Webhook configurado no Odoo?
- ✅ **Verificar:** `ODOO_WEBHOOK_SECRET` correto no `.env`?
- ✅ **Verificar:** Dispositivo ESP32 vinculado ao workcenter no banco?
- ✅ **Verificar:** Broker MQTT acessível pelo backend?

### Pausa no Odoo não reflete no ESP32
- ✅ **RESOLVIDO:** Implementado `send_andon_state_by_workcenter()` no webhook

### Botão físico não pausa no Odoo
- ✅ **Verificar:** `ODOO_URL`, `ODOO_DB`, `ODOO_SERVICE_LOGIN` corretos?
- ✅ **Verificar:** Workorder ativa no workcenter?
- ✅ **Verificar:** Logs do backend para erros de integração Odoo

## Changelog

### 2026-05-29
- ✅ Implementado `send_andon_state_by_workcenter()` em `mqtt_service.py`
- ✅ Atualizado `webhook.odoo_workorder_webhook()` para notificar ESP32
- ✅ Corrigido `_send_andon_state()` para usar autenticação MQTT via `_get_mqtt_client_kwargs()`
- ✅ Adicionado salvamento de estado anterior em `updated_by` no webhook
- ✅ Documentado fluxo completo de sincronização bidirecional
