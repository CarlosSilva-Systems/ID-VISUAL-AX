# Manual Técnico — Controlador Andon
**ID Visual AX | Firmware v2.4.0 | Hardware: ESP32 Dev Module**

---

## 1. Visão Geral da Arquitetura

O Controlador Andon é baseado no microcontrolador **ESP32** (240MHz, 320KB RAM, 4MB Flash). Ele opera em dois modos de conectividade que se complementam: **WiFi Direto** como modo primário e **ESP-MESH** como fallback automático.

```
┌─────────────────────────────────────────────────────────┐
│                    REDE DA FÁBRICA                       │
│                                                          │
│  [Roteador AX-CORPORATIVO]                              │
│         │                                               │
│         │ WiFi                                          │
│         ▼                                               │
│  [ESP32 RAIZ] ──── MQTT ────► [Broker 192.168.10.55]   │
│         │                           │                   │
│         │ ESP-MESH                  │                   │
│         ▼                           ▼                   │
│  [ESP32 FOLHA 1]           [Backend FastAPI]            │
│  [ESP32 FOLHA 2]           [Aplicativo Web]             │
│  [ESP32 FOLHA 3]                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Pinagem

| Função | GPIO | Tipo | Nível Ativo |
|---|---|---|---|
| Botão Verde | 12 | INPUT_PULLUP | LOW (pressionado) |
| Botão Amarelo | 13 | INPUT_PULLUP | LOW (pressionado) |
| Botão Vermelho | 32 | INPUT_PULLUP | LOW (pressionado) |
| Botão Pause | 33 | INPUT_PULLUP | LOW (pressionado) |
| LED Verde | 19 | OUTPUT | HIGH = aceso |
| LED Amarelo | 18 | OUTPUT | HIGH = aceso |
| LED Vermelho | 17 | OUTPUT | HIGH = aceso |
| LED Onboard (azul) | 2 | OUTPUT | HIGH = aceso |

**Alimentação:** 5V via pino VIN ou conector USB. Corrente mínima: **500mA** (picos de até 500mA no boot com WiFi ativo).

> ⚠️ Fontes em série somam tensão, não corrente. Use sempre uma única fonte adequada.

---

## 3. Máquina de Estados

O firmware opera em 5 estados distintos:

```
                    ┌─────────────────────────────────────┐
                    │                                     │
    BOOT ──────► WIFI_CONNECTING ──────► MQTT_CONNECTING ──► OPERATIONAL
                    │                                         │
                    │ timeout 15s                             │ WiFi cai > 60s
                    ▼                                         │ ou MQTT cai
                MESH_NODE ◄──────────────────────────────────┘
                    │
                    │ WiFi volta (retry a cada 60s)
                    └──────────────────────────────────────► WIFI_CONNECTING
```

### BOOT
Inicializa GPIOs, executa animação de boot (onda de LEDs), configura watchdog (60s) e obtém o endereço MAC.

### WIFI_CONNECTING
Tenta conectar ao AP `AX-CORPORATIVO` diretamente via `WiFi.begin()` sem scan prévio. O scan prévio é evitado porque conflita com a biblioteca painlessMesh que já controla a interface WiFi.

- Timeout: **15 segundos**
- Se conectar → inicia mesh como raiz → vai para MQTT_CONNECTING
- Se timeout → vai para MESH_NODE (fallback)

### MQTT_CONNECTING
Conecta ao broker MQTT em `192.168.10.55:1883`. Usa backoff exponencial: 5s → 10s → 20s → 40s → 60s (máximo).

- Máximo de tentativas: **10** (após isso, reinicia o ESP32)
- Ao conectar: publica `online`, envia discovery, subscreve nos tópicos, publica `REQUEST` para sincronizar estado

### OPERATIONAL
Estado normal de operação como nó raiz da mesh. Processa botões, publica eventos MQTT, mantém heartbeat a cada 5 minutos.

- Se WiFi cair: aguarda **60 segundos** antes de fazer fallback para MESH_NODE (absorve quedas rápidas de no-break)
- Se MQTT cair: vai imediatamente para MQTT_CONNECTING e apaga os LEDs Andon

### MESH_NODE
Nó folha sem WiFi direto. Processa botões e envia eventos via broadcast mesh para o nó raiz republicar no MQTT.

- Tenta reconectar ao WiFi a cada **60 segundos**
- Pisca vermelho a cada 1 minuto como indicador de desconexão WiFi

---

## 4. Lógica de Conectividade WiFi + ESP-MESH

### Por que não usar scan WiFi?
A biblioteca `painlessMesh` controla a interface WiFi do ESP32 em modo `WIFI_AP_STA` (Access Point + Station simultaneamente). Um scan WiFi interrompe o modo AP, quebrando as conexões mesh existentes. Por isso o firmware usa `WiFi.begin()` direto com o SSID conhecido.

### Hierarquia da Mesh
Todos os controladores usam as mesmas credenciais de mesh:
- **Mesh ID:** `IDVISUAL_ANDON`
- **Senha:** `andon@mesh2024`
- **Canal WiFi:** 6 (fixo, deve coincidir com o AP)
- **Porta:** 5555

O nó que conseguir conectar ao WiFi vira automaticamente o **nó raiz** e faz bridge entre a mesh e o MQTT. Os demais entram como **nós folha** e roteiam mensagens via mesh.

### Limite de Filhos por Nó
Cada nó aceita no máximo **4 filhos diretos**. Acima disso o ESP32 começa a ter instabilidade de conexão. Este limite é aplicado em dois níveis:
1. Lógica do firmware (conta filhos e anuncia capacidade)
2. Driver WiFi (`esp_wifi_set_config` no SoftAP) — rejeita conexões no nível do hardware

### Fallback Automático
```
Cenário: WiFi cai em OPERATIONAL
├── t=0s: WiFi perdido detectado → LEDs Andon apagam, g_andonStatus = UNKNOWN
├── t=0s~60s: Aguarda recuperação (absorve quedas de no-break)
│   └── Se WiFi voltar: restaura estado normalmente
└── t=60s: Fallback → MESH_NODE (entra como folha na mesh existente)

Cenário: WiFi volta em MESH_NODE
└── A cada 60s: tenta WiFi.begin() → se conectar → vira raiz novamente
```

### Propagação de Eventos via Mesh
Quando um nó folha pressiona um botão:
1. Publica JSON via `g_mesh.sendBroadcast()`: `{"type":"button","mac":"XX:XX","color":"red"}`
2. O nó raiz recebe via `onMeshMessage()` e republica no MQTT: `andon/button/{mac}/red`
3. O backend processa normalmente, sem saber se veio de raiz ou folha

---

## 5. Protocolo MQTT

### Tópicos Publicados pelo Controlador

| Tópico | Payload | Quando |
|---|---|---|
| `andon/discovery` | JSON com MAC, nome, firmware, mesh info | Ao conectar ao MQTT |
| `andon/status/{mac}` | `online` / `offline` (LWT) | Ao conectar / desconectar |
| `andon/logs/{mac}` | string de log | Diagnóstico |
| `andon/button/{mac}/green` | `PRESSED` | Botão verde pressionado |
| `andon/button/{mac}/yellow` | `PRESSED` | Botão amarelo pressionado |
| `andon/button/{mac}/red` | `PRESSED` | Botão vermelho pressionado |
| `andon/button/{mac}/pause` | `PRESSED` | Botão pause pressionado |
| `andon/state/request/{mac}` | `REQUEST` | Ao conectar (solicita estado atual) |

### Tópicos Recebidos pelo Controlador

| Tópico | Payload | Efeito |
|---|---|---|
| `andon/state/{mac}` | `GREEN` / `YELLOW` / `RED` / `GRAY` / `UNASSIGNED` | Atualiza LEDs |
| `andon/led/{mac}/command` | JSON `{red, yellow, green}` | Comando direto de LED (legado) |
| `andon/ota/trigger` | JSON com URL do firmware | Inicia atualização OTA |

### Sincronização de Estado no Boot
Ao conectar ao MQTT, o controlador publica `REQUEST` em `andon/state/request/{mac}`. O backend responde com o estado atual do workcenter vinculado. Isso garante que os LEDs reflitam o estado correto mesmo após um reinício.

---

## 6. Lógica de Controle dos LEDs

### Regra Principal
Os LEDs Andon **só exibem estado quando há conexão ativa com o backend**. Ao perder WiFi ou MQTT, os LEDs são apagados imediatamente e `g_andonStatus` é resetado para `UNKNOWN`.

### Mapeamento de Estados
```
g_andonStatus == "GREEN"      → LED verde fixo
g_andonStatus == "YELLOW"     → LED amarelo fixo
g_andonStatus == "RED"        → LED vermelho fixo
g_andonStatus == "GRAY"       → Todos piscam juntos 70 BPM (428ms on/off)
g_andonStatus == "UNASSIGNED" → Amarelo pisca rápido (200ms on/off)
g_andonStatus == "UNKNOWN"    → LEDs apagados (sem estado definido)
```

### Sequências de Diagnóstico (não-bloqueantes)
Todas as animações de diagnóstico são implementadas com `millis()` — nunca usam `delay()` para não bloquear o loop principal.

| Estado do Sistema | Sequência nos LEDs Andon | Período |
|---|---|---|
| WIFI_CONNECTING | Onda verde→amarelo→vermelho | 250ms por passo |
| MQTT_CONNECTING | Vermelho/amarelo alternados | 300ms por fase |
| MESH_NODE | Amarelo pisca lento | 1000ms on/off |
| GRAY (pausado) | Todos piscam juntos | 428ms on/off (~70 BPM) |
| UNASSIGNED | Amarelo pisca rápido | 200ms on/off |

### LED Onboard (azul, GPIO 2)
Indica o estado da máquina de estados, independente dos LEDs Andon:

| Estado | Padrão |
|---|---|
| WIFI_CONNECTING | Pisca a cada 500ms |
| MQTT_CONNECTING | Pisca a cada 1000ms |
| MESH_NODE | Double-pulse a cada 2s |
| OPERATIONAL | Fixo aceso |

---

## 7. Debounce e Watchdog

### Debounce de Botões
Tempo de estabilidade: **50ms**. Implementado por comparação de leitura — só registra pressionamento quando a leitura muda E o tempo mínimo passou desde a última mudança.

### Deduplicação no Backend
O backend mantém janela de deduplicação em memória:
- Botões coloridos: **3 segundos**
- Botão pause: **5 segundos**

Eventos duplicados dentro da janela são descartados silenciosamente.

### Watchdog de Hardware
Timeout: **60 segundos**. Se o loop principal travar por qualquer motivo, o ESP32 reinicia automaticamente. O watchdog é resetado a cada iteração do `loop()`.

### Reset por Botão
Segurar o botão PAUSE por **5 segundos** reinicia o ESP32 via software (`ESP.restart()`). Confirmação visual: todos os LEDs piscam 3 vezes antes do reinício.

---

## 8. Atualização de Firmware OTA

O controlador suporta atualização Over-The-Air via MQTT. O backend publica no tópico `andon/ota/trigger` com a URL do firmware. O ESP32 baixa e instala automaticamente, reiniciando ao final.

Durante a atualização, o controlador publica progresso em `andon/ota/progress/{mac}` com status `downloading`, `installing`, `success` ou `failed`.

---

## 9. Configurações de Fábrica

Todas as configurações estão em `hardware/include/config.h`:

```cpp
// Rede
WIFI_SSID           = "AX-CORPORATIVO"
WIFI_PASSWORD       = "auto@bacia"
WIFI_TIMEOUT_MS     = 15000   // 15s para conectar ao WiFi
WIFI_LOSS_FALLBACK_MS = 60000 // 60s sem WiFi antes de ir para mesh

// Mesh
MESH_ID             = "IDVISUAL_ANDON"
MESH_PASSWORD       = "andon@mesh2024"
MESH_CHANNEL        = 6
MESH_MAX_CHILDREN   = 4
WIFI_RETRY_INTERVAL_MS = 60000 // Retry WiFi em MESH_NODE

// MQTT
MQTT_BROKER         = "192.168.10.55"
MQTT_PORT           = 1883
MQTT_MAX_RETRIES    = 10
MQTT_KEEPALIVE_S    = 60

// Timers
HEARTBEAT_INTERVAL_MS    = 300000  // 5 minutos
HEAP_MONITOR_INTERVAL_MS = 30000   // 30 segundos
WATCHDOG_TIMEOUT_S       = 60
DEBOUNCE_MS              = 50
```

---

## 10. Diagnóstico e Troubleshooting

### Verificar logs via Serial
Conecte o controlador via USB e abra o monitor serial em **115200 baud**. Todos os eventos são logados com timestamp em milissegundos:

```
[2568] MAC: B0:A7:32:2C:0E:98  Nome: ESP32-Andon-0E98
[2568] WIFI: conectando a AX-CORPORATIVO (timeout=15s)...
[2663] WIFI: Conectado! IP=192.168.10.76 RSSI=-43dBm
[5422] MQTT: conectado -> OPERATIONAL
[13198] BTN: GPIO 32
[13202] BUTTON: red -> MQTT andon/button/B0:A7:32:2C:0E:98/red
[13350] ANDON STATE: RED
```

### Problemas Comuns

| Sintoma | Causa Provável | Solução |
|---|---|---|
| Onda de LEDs contínua | Sem WiFi | Verificar roteador AX-CORPORATIVO |
| Vermelho/amarelo alternados | Broker MQTT offline | Verificar container Docker |
| Amarelo piscando rápido | Device não vinculado | Vincular no app de gestão |
| Amarelo piscando lento | Operando via mesh | Normal — sem WiFi direto |
| LEDs apagados após conexão | Estado UNKNOWN | Aguardar REQUEST/resposta do backend |
| Não reinicia com PAUSE 5s | Botão com defeito | Desconectar e reconectar alimentação |
| MAC `00:00:00:00:00:00` | Falha ao ler MAC | Firmware usa fallback via `esp_read_mac()` |

### Verificar Conectividade MQTT
```bash
# Escutar todos os eventos do controlador
mosquitto_sub -h 192.168.10.55 -t "andon/#" -v

# Enviar estado manualmente para testar LEDs
mosquitto_pub -h 192.168.10.55 -t "andon/state/{MAC}" -m "RED"
```

### Heap Mínimo
O firmware monitora o heap livre a cada 30 segundos. Se cair abaixo de **10KB**, loga um aviso. Heap muito baixo pode causar instabilidade — reiniciar o controlador resolve.

---

## 11. Compilação e Upload

**Pré-requisitos:** PlatformIO instalado.

```bash
# Compilar
cd hardware
pio run

# Upload via USB
pio run --target upload --environment esp32dev

# Monitor serial
pio device monitor --baud 115200
```

**Arquivo de configuração:** `hardware/platformio.ini`
**Dependências principais:**
- PubSubClient 2.8.0 (MQTT)
- ArduinoJson 6.21.6
- painlessMesh 1.5.7
- AsyncTCP 3.3.2
