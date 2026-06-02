# Guia Rápido — Firmware ESP32 Andon

Referência rápida para consulta diária. Para documentação completa, veja os outros arquivos em `docs/`.

---

## Informações Básicas

| Item | Valor |
|------|-------|
| **Versão atual** | 2.5.0 |
| **Plataforma** | ESP32 DevKit v1 |
| **Framework** | Arduino (via PlatformIO) |
| **Linguagem** | C++ |
| **Serial** | 115200 baud |
| **WiFi** | 2.4 GHz apenas |

---

## Pinout Rápido

### Botões (INPUT_PULLUP — ativo em LOW)
```
GPIO 12  → Botão Verde    (OK / Normal)
GPIO 13  → Botão Amarelo  (Atenção)
GPIO 32  → Botão Vermelho (Problema / Parada)
GPIO 33  → Botão Azul     (Pause/Resume + Reset ao segurar 5s)
```

### LEDs (OUTPUT — ativo em HIGH)
```
GPIO 19  → LED Verde     (retroiluminação do botão verde)
GPIO 18  → LED Amarelo   (retroiluminação do botão amarelo)
GPIO 17  → LED Vermelho  (retroiluminação do botão vermelho)
GPIO 16  → LED Azul      (retroiluminação do botão azul)
GPIO 2   → LED Onboard   (indicador de conectividade — azul na placa)
```

> Resistor 220Ω em série com cada LED. Corrente ~15mA por LED.

---

## Máquina de Estados

```
BOOT → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL (nó raiz)
                       ↘ MESH_NODE (nó folha) → retry WiFi 60s → WIFI_CONNECTING
```

| Estado | LED Onboard | LEDs dos Botões |
|--------|-------------|-----------------|
| WIFI_CONNECTING | Pisca 500ms | Verde ↔ Amarelo alternados (600ms) |
| MQTT_CONNECTING | Pisca 1000ms | Amarelo ↔ Vermelho alternados (500ms) |
| OPERATIONAL | Aceso fixo | Conforme estado Andon recebido |
| MESH_NODE | Duplo pulso a cada 2s | Azul pisca lento (1s) |

---

## Estados Andon

| Estado MQTT | LED Verde | LED Amarelo | LED Vermelho | LED Azul |
|-------------|-----------|-------------|--------------|----------|
| `GREEN` | Fixo aceso | Apagado | Apagado | Apagado |
| `YELLOW` | Apagado | Fixo aceso | Apagado | Apagado |
| `RED` | Apagado | Apagado | Fixo aceso | Apagado |
| `GRAY` | Apagado | Apagado | Apagado | Pisca ~70 BPM |
| `UNASSIGNED` | Apagado | Pisca 200ms | Apagado | Apagado |

---

## Tópicos MQTT

### Publicados pelo ESP32

```
andon/discovery                     → JSON com info do dispositivo (ao conectar)
andon/status/{mac}                  → "online" / "offline" (LWT) + heartbeat JSON
andon/logs/{mac}                    → Logs de diagnóstico em texto
andon/button/{mac}/green            → "PRESSED"
andon/button/{mac}/yellow           → "PRESSED"
andon/button/{mac}/red              → "PRESSED"
andon/button/{mac}/pause            → "PRESSED"  ← botão azul usa "pause", não "blue"
andon/ota/progress/{mac}            → JSON {status, progress, error}
```

### Subscritos pelo ESP32

```
andon/state/{mac}                   → "GREEN" / "YELLOW" / "RED" / "GRAY" / "UNASSIGNED"
andon/restart/{mac}                 → "RESTART"
andon/odoo_error/{mac}              → qualquer payload (dispara blink vermelho 5s)
andon/ota/trigger                   → JSON {version, url, size}
andon/ota/cancel                    → qualquer payload
```

---

## Comandos Úteis

### PlatformIO
```bash
pio run                             # Compilar
pio run --target upload             # Upload via USB
pio device monitor                  # Abrir Serial Monitor
pio run --target upload && pio device monitor   # Tudo de uma vez
```

### MQTT (Mosquitto CLI)
```bash
# Monitorar todos os tópicos
mosquitto_sub -h 192.168.1.28 -t "andon/#" -v

# Enviar estado Andon
mosquitto_pub -h 192.168.1.28 -t "andon/state/AA:BB:CC:DD:EE:FF" -m "GREEN"

# Reiniciar dispositivo remotamente
mosquitto_pub -h 192.168.1.28 -t "andon/restart/AA:BB:CC:DD:EE:FF" -m "RESTART"

# Disparar OTA
mosquitto_pub -h 192.168.1.28 -t "andon/ota/trigger" -m \
  '{"version":"2.5.0","url":"http://192.168.1.28:8000/static/ota/firmware-2.5.0.bin","size":1234567}'

# Monitorar progresso OTA
mosquitto_sub -h 192.168.1.28 -t "andon/ota/progress/#" -v
```

---

## Configurações Principais (`include/config.h`)

```cpp
FIRMWARE_VERSION     = "2.5.0"
WIFI_SSID            = "AX AUTOMACAO"
MQTT_BROKER          = "192.168.1.28"      // servidor ax-producao
MQTT_PORT            = 1883
WIFI_TIMEOUT_MS      = 15000               // 15s antes de cair para mesh
WIFI_LOSS_FALLBACK_MS = 60000              // 60s de WiFi caído antes de rebaixar
WIFI_RETRY_INTERVAL_MS = 60000            // retry WiFi em MESH_NODE
MESH_ID              = "IDVISUAL_ANDON"
MESH_CHANNEL         = 6
MESH_MAX_CHILDREN    = 4
DEBOUNCE_MS          = 50                 // debounce dos botões
HEARTBEAT_INTERVAL_MS = 300000            // heartbeat a cada 5 min
WATCHDOG_TIMEOUT_S   = 60
BUTTON_INTERLOCK_MS  = 2000               // 2s entre acionamentos
```

---

## Modificações Comuns

### Mudar credenciais WiFi
```cpp
// include/config.h
#define WIFI_SSID "NOVA_REDE"
#define WIFI_PASSWORD "nova_senha"
```

### Atualizar versão do firmware
```cpp
// 1. include/config.h
#define FIRMWARE_VERSION "2.6.0"

// 2. Cabeçalho de src/main.cpp
// Versão: 2.6.0
// Data: YYYY-MM-DD
```

### Adicionar novo botão
```cpp
// 1. include/config.h
#define BTN_NOVO 14

// 2. src/main.cpp — variáveis globais
ButtonState novoButton = {BTN_NOVO, HIGH, 0, false};

// 3. src/main.cpp — initializeGPIOs()
pinMode(BTN_NOVO, INPUT_PULLUP);

// 4. src/main.cpp — handleOperational() e handleMeshNode()
processButton(&novoButton);
if (novoButton.pressed) {
    publishButtonEvent("novo");
    novoButton.pressed = false;
}
```

### Adicionar novo LED
```cpp
// 1. include/config.h
#define LED_NOVO_PIN 4

// 2. src/main.cpp — variáveis globais
LEDState novoLED = {LED_NOVO_PIN, false};

// 3. src/main.cpp — initializeGPIOs()
pinMode(LED_NOVO_PIN, OUTPUT);
digitalWrite(LED_NOVO_PIN, LOW);

// 4. src/main.cpp — updateAndonLEDs()
// Adicionar lógica de controle
```

---

## Troubleshooting Rápido

| Sintoma | Causa Provável | Solução |
|---------|----------------|---------|
| WiFi não conecta | SSID/senha errados ou rede 5GHz | Verificar `config.h`, rede deve ser 2.4GHz |
| MQTT não conecta | Broker offline ou IP errado | `ping 192.168.1.28`, `systemctl status mosquitto` |
| Botão não responde | Conexão física, pino errado | Testar GPIO direto, verificar `config.h` |
| LED não acende | Polaridade invertida, resistor faltando | Verificar circuito, 220Ω em série |
| Watchdog reset | Loop bloqueado >60s | Remover `delay()` longos, usar timers |
| Heap baixo | Vazamento de memória | Usar `StaticJsonDocument`, monitorar heap |

Para diagnóstico detalhado: `docs/14_TROUBLESHOOTING.md`

---

## Logs Esperados — Boot Normal

```
═══════════════════════════════════════════════════════
  Firmware ESP32 Andon v2.5.0 - ID Visual AX
  WiFi Direto + Fallback ESP-MESH
═══════════════════════════════════════════════════════

[0] GPIO: inicializados (4 botoes + 5 LEDs)
[5400] WDT: inicializado (60s)
[5450] MAC: AA:BB:CC:DD:EE:FF  Nome: ESP32-Andon-EEFF
[5460] MQTT: broker=192.168.1.28:1883
[5465] WIFI: conectando a AX AUTOMACAO (timeout=15s)...
[8200] WIFI: Conectado! IP=192.168.1.87 RSSI=-45dBm
[8210] MESH: iniciada como RAIZ | ID=IDVISUAL_ANDON canal=6 max_filhos=4
[8250] MQTT: conectando a 192.168.1.28:1883...
[8320] MQTT: conectado -> OPERATIONAL (raiz, IP=192.168.1.87 RSSI=-45dBm)
```

---

## Arquivos do Projeto

```
hardware/
├── platformio.ini          ← configuração de build e dependências
├── include/
│   ├── config.h            ← TODAS as constantes e pinos (edite aqui)
│   ├── ota.h               ← interface OTA
│   ├── espnow_comm.h       ← interface ESP-NOW
│   ├── provisioning.h      ← interface provisionamento viral
│   ├── crypto.h            ← interface AES-256-GCM
│   ├── nvs_storage.h       ← interface NVS (Preferences)
│   ├── rtc_sync.h          ← interface NTP/timestamp
│   ├── serial_parser.h     ← interface comandos Serial
│   └── setup_server.h      ← interface AP HTTP de config
├── src/
│   ├── main.cpp            ← lógica principal (~1190 linhas)
│   ├── ota.cpp             ← OTA over-the-air
│   ├── espnow_comm.cpp     ← comunicação ESP-NOW
│   ├── provisioning.cpp    ← provisionamento viral
│   ├── crypto.cpp          ← criptografia AES-GCM
│   ├── nvs_storage.cpp     ← armazenamento persistente
│   ├── rtc_sync.cpp        ← sincronização NTP
│   ├── serial_parser.cpp   ← comandos via Serial
│   └── setup_server.cpp    ← servidor HTTP de configuração
└── docs/                   ← documentação completa
    ├── 00_INDICE.md
    ├── 01_VISAO_GERAL.md
    ├── 02_ARQUITETURA.md
    ├── 03_ESTRUTURA_CODIGO.md
    ├── 14_TROUBLESHOOTING.md
    ├── GUIA_COMPILACAO.md
    ├── GUIA_LED_VISUAL.md
    ├── INSTRUCOES_ATUALIZACAO_OTA.md
    ├── LOGICA_BOTOES.md
    ├── LOGICA_PAUSE_BOTOES.md
    ├── PINOUT.md
    └── PRODUCAO.md
```

---

**Última atualização:** 2026-06-02
**Versão do firmware:** 2.5.0
