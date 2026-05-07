# 02 - Arquitetura do Sistema

## 🏛️ Visão Geral da Arquitetura

O firmware ESP32 Andon utiliza uma arquitetura **híbrida WiFi + Mesh** com **máquina de estados** robusta e **comunicação MQTT** bidirecional.

---

## 📐 Princípios de Design

### 1. Backend como Fonte de Verdade

**Princípio Fundamental**: O backend mantém o estado real do sistema. O ESP32 é apenas uma interface física.

```
┌─────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI)                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │  • Mantém estado de todas as mesas              │   │
│  │  • Processa eventos de botões                   │   │
│  │  • Aplica regras de negócio                     │   │
│  │  • Integra com Odoo                             │   │
│  │  • Envia comandos para ESP32                    │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↕ MQTT
┌─────────────────────────────────────────────────────────┐
│                    ESP32 (Interface)                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │  • Detecta pressionamento de botões             │   │
│  │  • Envia eventos via MQTT                       │   │
│  │  • Recebe comandos de LED                       │   │
│  │  • Controla LEDs físicos                        │   │
│  │  • NÃO toma decisões de negócio                 │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Responsabilidades do ESP32**:
- ✅ Detectar botões com debounce
- ✅ Enviar eventos MQTT
- ✅ Receber comandos LED
- ✅ Controlar LEDs físicos
- ✅ Manter conexão WiFi/MQTT

**Responsabilidades do Backend**:
- ✅ Validar ações
- ✅ Aplicar regras de negócio
- ✅ Criar/resolver chamados
- ✅ Manter estado das mesas
- ✅ Integrar com Odoo

### 2. Resiliência e Auto-Recuperação

O sistema é projetado para se recuperar automaticamente de falhas:

- **WiFi cai**: Tenta reconectar com backoff exponencial
- **MQTT cai**: Reconecta e reenvia discovery
- **WiFi indisponível**: Opera em modo mesh
- **Firmware crasheia**: Watchdog reinicia o sistema
- **Atualização OTA falha**: Rollback automático

### 3. Não-Bloqueante

Todo o código é não-bloqueante para manter responsividade:

- **Debounce**: Baseado em timestamp, não em delay()
- **Timers**: Verificação de intervalo, não bloqueio
- **Animações LED**: Máquina de estados, não loops
- **Reconexão**: Backoff com verificação de tempo

---

## 🔄 Máquina de Estados

### Estados Principais

```
                    ┌──────────────┐
                    │     BOOT     │
                    └──────┬───────┘
                           │
                           ↓
                  ┌────────────────┐
                  │ WIFI_CONNECTING│
                  └────┬───────┬───┘
                       │       │
              WiFi OK  │       │ Timeout
                       │       │
                       ↓       ↓
            ┌──────────────┐  ┌──────────┐
            │MQTT_CONNECTING│  │MESH_NODE │
            └──────┬───────┘  └────┬─────┘
                   │               │
          MQTT OK  │               │ WiFi volta
                   │               │
                   ↓               │
            ┌─────────────┐        │
            │ OPERATIONAL │←───────┘
            └─────────────┘
                   ↕
            (WiFi/MQTT cai)
```

### Descrição dos Estados

#### BOOT
- **Duração**: ~1 segundo
- **Ações**:
  - Inicializa GPIOs
  - Configura watchdog
  - Obtém MAC address
  - Configura MQTT client
  - Jogo de luzes (animação de boot)
- **Transição**: Automática para WIFI_CONNECTING

#### WIFI_CONNECTING
- **Duração**: Até 15 segundos (timeout configurável)
- **Ações**:
  - Tenta conectar ao WiFi (sem scan prévio)
  - Animação de onda nos LEDs
  - LED onboard pisca 500ms
- **Transições**:
  - **WiFi conecta**: → MQTT_CONNECTING
  - **Timeout (15s)**: → MESH_NODE

#### MQTT_CONNECTING
- **Duração**: Até 10 tentativas com backoff
- **Ações**:
  - Conecta ao broker MQTT
  - Publica status "online" (LWT)
  - Publica discovery
  - Subscreve tópicos
  - Solicita estado atual
  - LEDs vermelho/amarelo alternados
  - LED onboard pisca 1000ms
- **Transições**:
  - **MQTT conecta**: → OPERATIONAL
  - **WiFi cai**: → WIFI_CONNECTING
  - **Max tentativas**: Reinicia ESP32

#### OPERATIONAL (Nó Raiz)
- **Duração**: Indefinida (operação normal)
- **Ações**:
  - Processa botões
  - Publica eventos MQTT
  - Recebe comandos LED
  - Atualiza mesh
  - Heartbeat a cada 5 minutos
  - Monitora heap
  - LED onboard aceso fixo
- **Transições**:
  - **WiFi cai por 60s**: → MESH_NODE
  - **MQTT cai**: → MQTT_CONNECTING

#### MESH_NODE (Nó Folha)
- **Duração**: Até WiFi voltar
- **Ações**:
  - Processa botões
  - Envia eventos via mesh broadcast
  - Atualiza mesh
  - Tenta reconectar WiFi a cada 60s
  - Heartbeat via mesh a cada 5 minutos
  - LED amarelo piscando lento (1s)
  - LED onboard duplo pulso
- **Transições**:
  - **WiFi volta**: Para mesh → WIFI_CONNECTING

---

## 🕸️ Arquitetura de Rede Mesh

### Topologia

```
                    Internet
                        │
                        │
                   ┌────┴────┐
                   │ Router  │
                   │ WiFi AP │
                   └────┬────┘
                        │
                        │ WiFi
                        │
            ┌───────────┴───────────┐
            │                       │
       ┌────┴────┐            ┌────┴────┐
       │ ESP32-A │            │ ESP32-B │
       │  RAIZ   │            │  RAIZ   │
       │ (MQTT)  │            │ (MQTT)  │
       └────┬────┘            └────┬────┘
            │                      │
            │ Mesh                 │ Mesh
            │                      │
    ┌───────┼───────┐      ┌───────┼───────┐
    │       │       │      │       │       │
┌───┴──┐ ┌──┴──┐ ┌──┴──┐ ┌──┴──┐ ┌──┴──┐ ┌──┴──┐
│ESP-C │ │ESP-D│ │ESP-E│ │ESP-F│ │ESP-G│ │ESP-H│
│FOLHA │ │FOLHA│ │FOLHA│ │FOLHA│ │FOLHA│ │FOLHA│
└──────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘
```

### Papéis na Mesh

#### Nó Raiz (Root Node)
- **Características**:
  - Tem conexão WiFi direta ao AP
  - Conectado ao broker MQTT
  - Pode ter até 4 filhos diretos
  - Republica mensagens mesh no MQTT
- **Responsabilidades**:
  - Ponte entre mesh e MQTT
  - Recebe eventos de folhas via mesh
  - Publica eventos no MQTT
  - Recebe comandos do MQTT
  - Envia comandos para folhas via mesh

#### Nó Folha (Leaf Node)
- **Características**:
  - Sem conexão WiFi direta
  - Conectado à mesh
  - Pode ter até 4 filhos diretos
  - Roteia mensagens de outros nós
- **Responsabilidades**:
  - Envia eventos via mesh broadcast
  - Recebe comandos via mesh
  - Roteia mensagens de filhos
  - Tenta reconectar WiFi periodicamente

### Comunicação Mesh

#### Mensagens Mesh → MQTT (via Raiz)

**Evento de Botão**:
```json
{
  "type": "button",
  "mac": "AA:BB:CC:DD:EE:FF",
  "color": "green"
}
```
→ Raiz republica em `andon/button/{mac}/green`

**Discovery**:
```json
{
  "type": "discovery",
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "device_name": "ESP32-Andon-EEFF",
  "firmware_version": "2.4.1",
  "is_root": false,
  "connection_type": "mesh",
  "mesh_node_id": "123456789",
  "mesh_node_count": 5,
  "mesh_children": 2
}
```
→ Raiz republica em `andon/discovery`

**Heartbeat**:
```json
{
  "type": "heartbeat",
  "mac": "AA:BB:CC:DD:EE:FF",
  "heap": 245632,
  "uptime": 3600,
  "mesh_nodes": 5,
  "is_root": false
}
```
→ Raiz republica em `andon/status/{mac}`

**Log**:
```json
{
  "type": "log",
  "mac": "AA:BB:CC:DD:EE:FF",
  "message": "BUTTON: green pressionado"
}
```
→ Raiz republica em `andon/logs/{mac}`

### Limitações da Mesh

- **Máximo de filhos por nó**: 4 (configurável, mas >4 causa instabilidade)
- **Latência adicional**: ~50-100ms por hop
- **Throughput**: ~1 Mbps compartilhado
- **Alcance por hop**: ~50-100m (ambiente industrial)
- **Recomendação**: Máximo 3-4 hops para latência aceitável

---

## 📡 Protocolo MQTT

### Tópicos Publicados pelo ESP32

| Tópico | QoS | Retain | Quando | Payload |
|--------|-----|--------|--------|---------|
| `andon/discovery` | 1 | false | Ao conectar MQTT | JSON com info do dispositivo |
| `andon/status/{mac}` | 1 | true | LWT + Heartbeat | `"online"` / `"offline"` / JSON |
| `andon/logs/{mac}` | 1 | false | Eventos importantes | String de texto |
| `andon/button/{mac}/green` | 1 | false | Botão verde pressionado | `"PRESSED"` |
| `andon/button/{mac}/yellow` | 1 | false | Botão amarelo pressionado | `"PRESSED"` |
| `andon/button/{mac}/red` | 1 | false | Botão vermelho pressionado | `"PRESSED"` |
| `andon/button/{mac}/pause` | 1 | false | Botão pause pressionado | `"PRESSED"` |
| `andon/ota/progress/{mac}` | 0 | false | Durante atualização OTA | JSON com progresso |

### Tópicos Subscritos pelo ESP32

| Tópico | QoS | Quando | Ação |
|--------|-----|--------|------|
| `andon/state/{mac}` | 1 | Backend envia estado | Atualiza LEDs |
| `andon/restart/{mac}` | 1 | Backend solicita restart | Reinicia ESP32 |
| `andon/odoo_error/{mac}` | 1 | Erro de integração Odoo | Pisca LEDs em vermelho |
| `andon/ota/trigger` | 1 | Comando de atualização | Inicia download OTA |
| `andon/ota/cancel` | 1 | Cancelamento de OTA | Cancela download |

### Payloads Detalhados

#### Discovery Message
```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "device_name": "ESP32-Andon-EEFF",
  "firmware_version": "2.4.1",
  "is_root": true,
  "mesh_node_id": "123456789",
  "mesh_node_count": 5,
  "mesh_children": 2,
  "rssi": -45,
  "ip_address": "192.168.1.87",
  "connection_type": "wifi"
}
```

#### Heartbeat Message
```json
{
  "heap": 245632,
  "rssi": -45,
  "mesh_nodes": 5,
  "mesh_children": 2,
  "is_root": true
}
```

#### OTA Trigger Message
```json
{
  "version": "2.5.0",
  "url": "http://192.168.1.28:8000/static/ota/firmware-2.5.0.bin",
  "size": 1234567
}
```

#### OTA Progress Message
```json
{
  "status": "downloading",
  "progress": 45,
  "error": null
}
```

---

## 🔌 Fluxo de Dados Completo

### Fluxo: Botão Pressionado (Nó Raiz)

```
1. Operador pressiona botão verde
   ↓
2. GPIO 12 vai para LOW
   ↓
3. processButton() detecta mudança
   ↓
4. Aguarda 50ms (debounce)
   ↓
5. Confirma pressionamento
   ↓
6. publishButtonEvent("green")
   ↓
7. MQTT publish: andon/button/{mac}/green = "PRESSED"
   ↓
8. Backend recebe evento
   ↓
9. Backend valida ação
   ↓
10. Backend resolve chamados
   ↓
11. Backend publica: andon/state/{mac} = "GREEN"
   ↓
12. ESP32 recebe comando
   ↓
13. mqttCallback() processa
   ↓
14. updateAndonLEDs() atualiza LEDs
   ↓
15. LED verde acende, outros apagam
```

### Fluxo: Botão Pressionado (Nó Folha)

```
1. Operador pressiona botão verde
   ↓
2. GPIO 12 vai para LOW
   ↓
3. processButton() detecta mudança
   ↓
4. Aguarda 50ms (debounce)
   ↓
5. Confirma pressionamento
   ↓
6. publishButtonEvent("green")
   ↓
7. Mesh broadcast: {"type":"button", "mac":"...", "color":"green"}
   ↓
8. Nó raiz recebe via onMeshMessage()
   ↓
9. Raiz republica: andon/button/{mac}/green = "PRESSED"
   ↓
10. Backend recebe evento
   ↓
11. Backend valida ação
   ↓
12. Backend resolve chamados
   ↓
13. Backend publica: andon/state/{mac} = "GREEN"
   ↓
14. Raiz recebe comando MQTT
   ↓
15. Raiz envia via mesh para folha (TODO: não implementado ainda)
   ↓
16. Folha atualiza LEDs
```

**⚠️ NOTA**: Atualmente, comandos LED do backend para nós folha não estão implementados. Nós folha não recebem comandos de estado do backend.

---

## 🔄 Reconexão e Resiliência

### Backoff Exponencial

```cpp
struct ReconnectionState {
    uint8_t attemptCount;        // Contador de tentativas
    unsigned long backoffDelay;  // Delay atual
    unsigned long lastAttempt;   // Timestamp da última tentativa
};

// Inicial: 5 segundos
// Após falha: 10s, 20s, 40s, 60s (máximo)
```

### Estratégias de Reconexão

#### WiFi
- **Timeout inicial**: 15 segundos
- **Backoff**: 5s → 10s → 20s → 40s → 60s (máximo)
- **Fallback**: Após timeout, entra em modo mesh

#### MQTT
- **Timeout inicial**: Imediato
- **Backoff**: 5s → 10s → 20s → 40s → 60s (máximo)
- **Max tentativas**: 10 (depois reinicia ESP32)

#### Mesh → WiFi
- **Intervalo de retry**: 60 segundos
- **Ação**: Para mesh, tenta WiFi, se conectar vira raiz

### Fallback WiFi → Mesh

```
OPERATIONAL (raiz com WiFi)
    ↓
WiFi cai
    ↓
Marca timestamp (g_wifiLostAt)
    ↓
Aguarda 60 segundos
    ↓
WiFi ainda ausente?
    ↓ Sim
Desconecta MQTT
    ↓
Rebaixa para folha (setRoot(false))
    ↓
MESH_NODE
```

**Motivo do delay de 60s**: Absorve quedas rápidas de WiFi (ex: no-break, interferência momentânea)

---

## 🛡️ Proteções e Segurança

### Watchdog Timer
- **Timeout**: 60 segundos
- **Reset**: A cada loop()
- **Ação**: Reinicia ESP32 se não resetado

### Monitoramento de Heap
- **Intervalo**: 30 segundos
- **Threshold**: 10 KB
- **Ação**: Log de aviso se heap < 10 KB

### Last Will and Testament (LWT)
- **Tópico**: `andon/status/{mac}`
- **Payload**: `"offline"`
- **QoS**: 1
- **Retain**: true
- **Ação**: Backend detecta desconexão inesperada

### Cooldown de Botões
- **Debounce**: 50ms (evita ruído elétrico)
- **Cooldown**: Nenhum (removido na v2.4.0)

### Reset por Botão
- **Ação**: Segurar botão pause por 5 segundos
- **Efeito**: Reinicia ESP32
- **Indicação**: LEDs piscam 3x antes de reiniciar

---

## 📊 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                         ESP32 Firmware                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   main.cpp   │  │   config.h   │  │   ota.cpp    │     │
│  │              │  │              │  │              │     │
│  │ • setup()    │  │ • WiFi creds │  │ • OTA update │     │
│  │ • loop()     │  │ • MQTT config│  │ • Rollback   │     │
│  │ • Estados    │  │ • Pinos      │  │ • Validação  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │espnow_comm   │  │provisioning  │  │   crypto     │     │
│  │              │  │              │  │              │     │
│  │ • ESP-NOW    │  │ • Viral prov │  │ • AES-GCM    │     │
│  │ • Broadcast  │  │ • NVS storage│  │ • SHA-256    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  rtc_sync    │  │serial_parser │  │setup_server  │     │
│  │              │  │              │  │              │     │
│  │ • NTP sync   │  │ • Comandos   │  │ • AP WiFi    │     │
│  │ • Timestamp  │  │ • PROVISION  │  │ • HTTP server│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                      Bibliotecas Externas                    │
├─────────────────────────────────────────────────────────────┤
│  • Arduino Framework                                         │
│  • PubSubClient (MQTT)                                       │
│  • ArduinoJson (JSON)                                        │
│  • painlessMesh (ESP-MESH)                                   │
│  • mbedTLS (Criptografia)                                    │
│  • HTTPUpdate (OTA)                                          │
└─────────────────────────────────────────────────────────────┘
```

---

**Próximo**: [03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md) - Estrutura do Código
