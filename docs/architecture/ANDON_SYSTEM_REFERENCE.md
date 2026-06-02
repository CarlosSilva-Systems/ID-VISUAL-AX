# Sistema Andon — Referência Completa

> Documento de referência técnica e de negócio para o sistema Andon do ID Visual AX.
> Destinado a fornecer contexto completo para qualquer agente de IA ou desenvolvedor que precise trabalhar nesta parte do sistema.

---

## 1. Visão Geral

O sistema Andon é um mecanismo de alerta em tempo real para o chão de fábrica. Ele conecta dispositivos físicos ESP32 (com botões e LEDs coloridos) ao aplicativo web de gestão, permitindo que operadores sinalizem ocorrências diretamente da linha de produção e que supervisores monitorem e intervenham remotamente.

### Componentes

| Componente | Tecnologia | Responsabilidade |
|---|---|---|
| ESP32 (firmware) | C++/Arduino, PlatformIO | Botões físicos, LEDs, MQTT |
| Broker MQTT | Mosquitto 1883 | Transporte de mensagens IoT |
| Backend | FastAPI (Python) | Lógica de negócio, persistência, WebSocket |
| Frontend | React/TypeScript | Interface do supervisor/operador |
| Banco de dados | PostgreSQL / SQLite | Estado persistente |
| Odoo ERP | JSON-RPC | Integração com ordens de fabricação |

---

## 2. Hardware — ESP32

### 2.1 Pinagem

| Função | GPIO | Tipo |
|---|---|---|
| Botão Verde | 12 | INPUT_PULLUP (ativo em LOW) |
| Botão Amarelo | 13 | INPUT_PULLUP (ativo em LOW) |
| Botão Vermelho | 32 | INPUT_PULLUP (ativo em LOW) |
| Botão Pause | 33 | INPUT_PULLUP (ativo em LOW) |
| LED Verde | 19 | OUTPUT |
| LED Amarelo | 18 | OUTPUT |
| LED Vermelho | 17 | OUTPUT |
| LED Onboard (azul) | 2 | OUTPUT |

### 2.2 Máquina de Estados do Firmware

```
BOOT → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL (nó raiz)
                       ↘ MESH_NODE (folha) → WIFI_CONNECTING (retry a cada 60s)
```

**BOOT:** Inicializa GPIOs, executa animação de boot (onda de LEDs), configura MQTT.

**WIFI_CONNECTING:** Tenta conectar ao AP `AX-CORPORATIVO` diretamente (sem scan, pois scan conflita com painlessMesh). Timeout de 15s. Se conectar → MQTT_CONNECTING. Se timeout → MESH_NODE.

**MQTT_CONNECTING:** Conecta ao broker `192.168.10.55:1883`. Ao conectar, publica `online` no LWT, envia discovery, subscreve nos tópicos e publica `andon/state/request/{mac}` para sincronizar estado com o backend.

**OPERATIONAL:** Estado normal de operação como nó raiz da mesh. Processa botões, publica eventos MQTT, mantém heartbeat a cada 5 minutos. Se WiFi cair por mais de 60s → MESH_NODE.

**MESH_NODE:** Nó folha sem WiFi. Processa botões e envia eventos via broadcast mesh para o nó raiz republicar no MQTT. Tenta reconectar ao WiFi a cada 60s.

### 2.3 Conectividade — WiFi + ESP-MESH Híbrido

- O ESP32 tenta WiFi direto primeiro
- Se RSSI < -80dBm (≈30% qualidade) ou timeout → entra como nó folha na mesh
- O nó com WiFi vira raiz e faz bridge para o MQTT
- Máximo de 4 filhos diretos por nó (acima disso o ESP32 fica instável)
- Mesh ID: `IDVISUAL_ANDON`, canal 6, porta 5555

### 2.4 Padrões de LED

| Estado | LEDs Andon | Descrição |
|---|---|---|
| Boot | Onda verde→amarelo→vermelho (3 ciclos, 200ms cada) | Inicialização |
| WIFI_CONNECTING | Onda verde→amarelo→vermelho (250ms cada, contínua) | Procurando WiFi |
| MQTT_CONNECTING | Vermelho/amarelo alternados (300ms) | WiFi ok, sem broker MQTT |
| MESH_NODE | Amarelo pisca lento (1s on/off) | Sem WiFi direto, operando via mesh |
| UNASSIGNED | Amarelo pisca rápido (200ms on/off) | Conectado mas não vinculado a mesa |
| GRAY (pausado) | Todos piscam juntos ~70 BPM (428ms on/off) | Produção pausada |
| GREEN | Verde sólido | Produção normal |
| YELLOW | Amarelo sólido | Alerta ativo |
| RED | Vermelho sólido | Parada crítica ativa |
| WiFi conectado | Verde pisca 3x (200ms) | Confirmação de conexão WiFi |
| Mesh conectado | Amarelo pisca 3x (200ms) | Confirmação de entrada na mesh |

**Regra importante:** Ao perder WiFi ou MQTT em OPERATIONAL, os LEDs Andon são apagados imediatamente. O estado Andon só é exibido quando há conexão ativa com o backend.

### 2.5 Debounce e Watchdog

- Debounce de botões: 50ms
- Watchdog: 60s (reinicia se loop travar)
- Heap mínimo: 10KB (loga aviso se abaixo)

---

## 3. Tópicos MQTT

### 3.1 Publicados pelo ESP32

| Tópico | Payload | Descrição |
|---|---|---|
| `andon/discovery` | JSON | Anúncio de presença ao conectar |
| `andon/status/{mac}` | `online` / `offline` | LWT e heartbeat |
| `andon/logs/{mac}` | string | Logs de diagnóstico |
| `andon/button/{mac}/green` | `PRESSED` | Botão verde pressionado |
| `andon/button/{mac}/yellow` | `PRESSED` | Botão amarelo pressionado |
| `andon/button/{mac}/red` | `PRESSED` | Botão vermelho pressionado |
| `andon/button/{mac}/pause` | `PRESSED` | Botão pause pressionado |
| `andon/state/request/{mac}` | `REQUEST` | Solicita estado atual ao backend (boot/reconexão) |
| `andon/ota/progress/{mac}` | JSON | Progresso de atualização OTA |

**Payload do discovery:**
```json
{
  "mac_address": "24:DC:C3:A1:77:14",
  "device_name": "ESP32-Andon-7714",
  "firmware_version": "2.4.0",
  "is_root": true,
  "mesh_node_id": "12345678",
  "mesh_node_count": 3,
  "mesh_children": 2,
  "rssi": -65
}
```

### 3.2 Publicados pelo Backend → ESP32

| Tópico | Payload | Descrição |
|---|---|---|
| `andon/state/{mac}` | `GREEN` / `YELLOW` / `RED` / `GRAY` / `UNASSIGNED` | Estado atual do Andon |
| `andon/led/{mac}/command` | JSON `{red, yellow, green}` | Comando direto de LED (legado) |
| `andon/ota/trigger` | JSON | Dispara atualização OTA |

### 3.3 Sincronização de Estado no Boot

Quando o ESP32 conecta ao MQTT, ele publica em `andon/state/request/{mac}`. O backend responde com o estado atual:

1. Se device não vinculado a mesa → envia `UNASSIGNED`
2. Se `AndonStatus.status == "cinza"` → envia `GRAY` (pausa tem precedência)
3. Se há chamados ativos RED → envia `RED`
4. Se há chamados ativos YELLOW → envia `YELLOW`
5. Caso contrário → envia `GREEN`

---

## 4. Modelos de Dados

### 4.1 ESPDevice

Representa um dispositivo ESP32 registrado no sistema.

```python
ESPDevice:
  id: UUID (PK)
  mac_address: str (unique)  # ex: "24:DC:C3:A1:77:14"
  device_name: str           # ex: "ESP32-Andon-7714"
  location: str              # localização física (opcional)
  workcenter_id: int | None  # ID do workcenter no Odoo (vínculo)
  status: "online" | "offline"
  last_seen_at: datetime
```

**Regra:** Um device sem `workcenter_id` recebe `UNASSIGNED` e pisca o LED amarelo.

### 4.2 AndonStatus

Cache do estado atual de cada workcenter. Um registro por workcenter.

```python
AndonStatus:
  id: int (PK)
  workcenter_odoo_id: int (unique)
  workcenter_name: str
  status: str  # verde | amarelo | vermelho | cinza | red | yellow | green | gray
  updated_at: datetime
  updated_by: str | None  # "ESP32 ESP32-Andon-7714" ou login do usuário
                          # Quando pausado: "prev:{status_anterior}" para restaurar
```

**Nota sobre `updated_by` na pausa:** Quando o operador pausa, o campo `updated_by` é usado para salvar o estado anterior com prefixo `prev:`. Ex: `"prev:red"`. Ao retomar, esse valor é lido para restaurar o estado correto.

### 4.3 AndonCall

Chamado estruturado criado a cada acionamento de alerta.

```python
AndonCall:
  id: int (PK)
  color: "YELLOW" | "RED"
  category: str        # ex: "Alerta", "Parada Crítica", "Material"
  reason: str          # motivo do chamado
  description: str | None
  workcenter_id: int
  workcenter_name: str
  mo_id: int | None    # ID da ordem de fabricação no Odoo
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED"
  triggered_by: str    # quem acionou (login ou "ESP32 {nome}")
  is_stop: bool        # se a produção está parada
  resolved_note: str | None
  created_at: datetime
  updated_at: datetime
```

---

## 5. Lógica de Negócio — Regras Completas

### 5.1 Regra de Precedência de Status (exibição no app)

O status exibido no app para cada workcenter segue esta ordem de prioridade:

```
1. CINZA (pausado)     — AndonStatus.status == "cinza"
2. VERMELHO            — há AndonCall OPEN com color="RED"
3. AMARELO (parado)    — há AndonCall OPEN com color="YELLOW" e is_stop=True
4. AMARELO_SUAVE       — há AndonCall OPEN com color="YELLOW" e is_stop=False + WO ativa
5. AMARELO             — há AndonCall OPEN com color="YELLOW" e is_stop=False + sem WO
6. VERDE               — há WO ativa no Odoo, sem chamados
7. CINZA               — sem WO ativa (aguardando)
```

**Importante:** A pausa (cinza) tem precedência absoluta sobre qualquer chamado ativo. Se o operador pausou, o app mostra cinza mesmo que haja um chamado vermelho aberto.

### 5.2 Regra de Substituição de Chamados

Quando um novo acionamento ocorre (via botão físico ou app), **todos os chamados anteriores do mesmo workcenter são resolvidos automaticamente** antes de criar o novo.

Isso garante que nunca haja estados conflitantes (ex: chamado vermelho + chamado amarelo abertos simultaneamente).

**Exceção:** O botão verde não cria chamado — apenas resolve todos os chamados abertos e define o status como verde.

### 5.3 Fluxo do Botão Verde (ESP32)

1. ESP32 publica `andon/button/{mac}/green` com payload `PRESSED`
2. Backend resolve todos os `AndonCall` abertos do workcenter
3. Backend atualiza `AndonStatus.status = "verde"`
4. Backend envia `GREEN` via MQTT para o ESP32
5. Backend emite WebSocket `andon_resolved` para o frontend
6. Frontend atualiza imediatamente via WebSocket

### 5.4 Fluxo do Botão Amarelo/Vermelho (ESP32)

1. ESP32 publica `andon/button/{mac}/yellow` ou `andon/button/{mac}/red`
2. Backend verifica se device está vinculado a um workcenter
3. Backend resolve todos os chamados anteriores abertos
4. Backend cria novo `AndonCall` com a cor correspondente
5. Backend atualiza `AndonStatus.status` com a cor (em inglês minúsculo: "yellow"/"red")
6. Backend envia estado via MQTT para o ESP32 (`YELLOW` ou `RED`)
7. Backend emite WebSocket `andon_call_created` para o frontend
8. Backend tenta integração com Odoo em background (pause WO, chatter, activity)

### 5.5 Fluxo do Botão Pause (ESP32)

**Ao PAUSAR (status atual ≠ "cinza"):**
1. Salva status atual em `AndonStatus.updated_by = "prev:{status_atual}"`
2. Define `AndonStatus.status = "cinza"`
3. Tenta pausar WO ativa no Odoo
4. Envia `GRAY` via MQTT para o ESP32
5. ESP32 começa a piscar todos os LEDs a 70 BPM

**Ao RETOMAR (status atual == "cinza"):**
1. Lê `AndonStatus.updated_by` para obter o status anterior (`prev:{status}`)
2. Restaura `AndonStatus.status = {status_anterior}`
3. Tenta retomar WO no Odoo
4. Mapeia status anterior para MQTT e envia ao ESP32
5. ESP32 acende o LED correspondente ao estado restaurado

**Deduplicação:** Eventos de pause têm janela de 5s para evitar duplo acionamento.

### 5.6 Fluxo de Mudança via App (Supervisor)

Quando o supervisor muda o estado pelo app:

**Botão Verde (Produção Normal):**
1. Resolve todos os chamados abertos do workcenter
2. Atualiza `AndonStatus.status = "verde"`
3. Envia `GREEN` via MQTT para o ESP32

**Botão Amarelo/Vermelho:**
1. Resolve chamados anteriores
2. Cria novo `AndonCall`
3. Atualiza `AndonStatus`
4. Envia estado via MQTT para o ESP32
5. Integração Odoo em background

**Regra:** Qualquer mudança de estado — seja pelo ESP32 ou pelo app — sempre fecha o estado anterior e sincroniza ambos os lados.

### 5.7 Deduplicação de Eventos de Botão

O backend mantém um dicionário em memória `_button_dedup` com timestamps dos últimos eventos por MAC e cor. Janela de deduplicação: **3 segundos** para botões coloridos, **5 segundos** para pause.

### 5.8 Sincronização Frontend

O frontend usa dois mecanismos:
- **WebSocket** (`/api/v1/devices/ws`): Atualização imediata ao receber eventos `andon_call_created`, `andon_resolved`, `production_paused`, `production_resumed`
- **Polling** (a cada 10s): Fallback de segurança para garantir consistência

---

## 6. API REST — Endpoints Andon

### GET `/api/v1/andon/workcenters`
Retorna todos os workcenters com status calculado, WO ativa, planejamento e chamados.

### GET `/api/v1/andon/workcenters/{wc_id}/current_order`
Retorna a WO ativa de um workcenter específico (consulta Odoo).

### POST `/api/v1/andon/trigger/{color}`
Acionamento básico (verde/cinza) sem criar chamado estruturado.

```json
{
  "workcenter_id": 27,
  "workcenter_name": "Mesa Cassio",
  "status": "verde",
  "triggered_by": "supervisor@ax.com",
  "workorder_id": 2829,
  "production_id": 1234
}
```

### POST `/api/v1/andon/calls`
Cria chamado estruturado (amarelo/vermelho). Resolve chamados anteriores automaticamente.

```json
{
  "color": "YELLOW",
  "category": "Material",
  "reason": "Falta de parafuso M6",
  "workcenter_id": 27,
  "workcenter_name": "Mesa Cassio",
  "mo_id": 1234,
  "triggered_by": "operador@ax.com",
  "is_stop": false
}
```

### GET `/api/v1/andon/calls`
Lista chamados ativos (ou todos com `?active_only=false`).

### PATCH `/api/v1/andon/calls/{call_id}/status`
Atualiza status de um chamado. Ao resolver, atualiza `AndonStatus` para verde.

### GET `/api/v1/andon/tv-data`
Dados consolidados para o painel TV (workcenters, chamados, eventos recentes).

### GET `/api/v1/andon/history`
Histórico de chamados para dashboard BI (últimos N dias).

---

## 7. Integração com Odoo

### 7.1 Botão Amarelo com `is_stop=True`
- Pausa a WO ativa via `pause_workorder(wo_id)`
- Posta mensagem no chatter da MO: `🟡 Andon Amarelo — PRODUÇÃO PARADA: {motivo}`

### 7.2 Botão Amarelo com `is_stop=False`
- Não pausa a WO
- Posta mensagem no chatter da MO: `🟡 Andon Amarelo: {motivo}`

### 7.3 Botão Vermelho
- Pausa a WO ativa via `pause_workorder(wo_id)`
- Cria atividade no Odoo para o engenheiro responsável (`ANDON_ENGINEERING_USER_ID`)
- Posta mensagem no chatter: `🔴 Andon Vermelho — PARADA CRÍTICA: {motivo}`

### 7.4 Botão Pause (ESP32)
- Pausa ou retoma a WO ativa via `pause_workorder` / `resume_workorder`
- Falhas na integração Odoo são logadas mas não bloqueiam a atualização local

### 7.5 Tratamento de Falhas
Todas as integrações Odoo são executadas em background tasks ou com try/except. Falhas no Odoo não impedem a atualização do estado local e dos LEDs.

---

## 8. Gestão de Dispositivos ESP32

### 8.1 Vinculação a Workcenter
Cada ESP32 deve ser vinculado a um workcenter no app (tela de gestão de dispositivos IoT). Sem vínculo, o device recebe `UNASSIGNED` e pisca o LED amarelo rapidamente.

### 8.2 Discovery Automático
Ao conectar ao MQTT, o ESP32 publica em `andon/discovery`. O backend cria ou atualiza o registro `ESPDevice` automaticamente.

### 8.3 Status Online/Offline
O ESP32 usa LWT (Last Will and Testament) do MQTT. Ao conectar publica `online`, ao desconectar o broker publica `offline` automaticamente no tópico `andon/status/{mac}`.

### 8.4 Logs de Diagnóstico
O ESP32 publica logs em `andon/logs/{mac}`. O backend persiste em `ESPDeviceLog` e emite via WebSocket para o frontend.

---

## 9. Fluxo Completo — Exemplo de Uso

### Cenário: Operador aciona vermelho, supervisor pausa, operador retoma

```
1. Operador pressiona BTN_VERMELHO no ESP32
   → ESP32 publica andon/button/{mac}/red PRESSED
   → Backend: resolve chamados anteriores, cria AndonCall(RED), atualiza AndonStatus(red)
   → Backend: envia RED via MQTT → ESP32 acende LED vermelho
   → Backend: pausa WO no Odoo, posta no chatter
   → Frontend: recebe WebSocket andon_call_created → atualiza para vermelho

2. Supervisor pausa pelo app (operador foi almoçar)
   → App chama POST /andon/trigger/cinza
   → Backend: atualiza AndonStatus(cinza), salva prev:red em updated_by
   → Backend: envia GRAY via MQTT → ESP32 pisca todos os LEDs a 70 BPM
   → Frontend: recebe atualização → mostra cinza

3. Operador retorna e pressiona BTN_PAUSE
   → ESP32 publica andon/button/{mac}/pause PRESSED
   → Backend: lê AndonStatus(cinza), lê prev:red, restaura AndonStatus(red)
   → Backend: retoma WO no Odoo
   → Backend: envia RED via MQTT → ESP32 acende LED vermelho
   → Frontend: recebe WebSocket production_resumed → atualiza para vermelho

4. Operador resolve o problema e pressiona BTN_VERDE
   → ESP32 publica andon/button/{mac}/green PRESSED
   → Backend: resolve todos os AndonCall abertos, atualiza AndonStatus(verde)
   → Backend: envia GREEN via MQTT → ESP32 acende LED verde
   → Frontend: recebe WebSocket andon_resolved → atualiza para verde
```

---

## 10. Arquivos Relevantes

| Arquivo | Descrição |
|---|---|
| `hardware/src/main.cpp` | Firmware completo do ESP32 |
| `hardware/include/config.h` | Constantes de configuração do firmware |
| `backend/app/services/mqtt_service.py` | Serviço MQTT — toda lógica de processamento de eventos IoT |
| `backend/app/api/api_v1/endpoints/andon.py` | Endpoints REST do Andon |
| `backend/app/models/andon.py` | Modelos de dados (AndonStatus, AndonCall, etc.) |
| `backend/app/models/esp_device.py` | Modelo do dispositivo ESP32 |
| `frontend/src/app/components/AndonGrid.tsx` | Grid principal do Andon no app |
| `frontend/src/app/components/AndonOperador.tsx` | Terminal do operador (acionamentos manuais) |
| `frontend/src/services/useDeviceWebSocket.ts` | Hook WebSocket para eventos em tempo real |

---

## 11. Variáveis de Ambiente Relevantes

```env
MQTT_BROKER_HOST=192.168.10.55   # IP do broker Mosquitto
MQTT_BROKER_PORT=1883
ANDON_ENGINEERING_USER_ID=       # ID do usuário Odoo para atividades de parada crítica
```

---

## 12. Limitações e Considerações

- O ESP32 precisa de fonte de **mínimo 5V/500mA** (picos de até 500mA no boot com WiFi)
- Fontes em série somam tensão, não corrente — usar fonte única adequada
- O campo `updated_by` do `AndonStatus` tem dupla função: auditoria normal E armazenamento do estado anterior na pausa (prefixo `prev:`)
- Chamados do tipo `AndonEvent` (modelo legado) coexistem com `AndonCall` (modelo atual) — o sistema usa `AndonCall` para toda lógica nova
- A mesh ESP-NOW tem limite de 4 filhos diretos por nó para estabilidade
