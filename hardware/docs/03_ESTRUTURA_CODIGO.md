# 03 - Estrutura do Código

## 📁 Organização de Arquivos

```
hardware/
├── .pio/                    # PlatformIO build artifacts (ignorado no git)
├── .vscode/                 # Configurações do VS Code
├── docs/                    # Documentação (VOCÊ ESTÁ AQUI!)
├── include/                 # Arquivos de cabeçalho (.h)
│   ├── config.h            # ⭐ Configurações principais
│   ├── ota.h               # OTA (Over-The-Air updates)
│   ├── espnow_comm.h       # Comunicação ESP-NOW
│   ├── provisioning.h      # Provisionamento viral
│   ├── crypto.h            # Criptografia AES-GCM
│   ├── nvs_storage.h       # Armazenamento NVS
│   ├── rtc_sync.h          # Sincronização NTP
│   ├── serial_parser.h     # Parser de comandos Serial
│   └── setup_server.h      # Servidor HTTP de configuração
├── src/                     # Arquivos de implementação (.cpp)
│   ├── main.cpp            # ⭐ Arquivo principal
│   ├── ota.cpp             # Implementação OTA
│   ├── espnow_comm.cpp     # Implementação ESP-NOW
│   ├── provisioning.cpp    # Implementação provisionamento
│   ├── crypto.cpp          # Implementação criptografia
│   ├── nvs_storage.cpp     # Implementação NVS
│   ├── rtc_sync.cpp        # Implementação RTC/NTP
│   ├── serial_parser.cpp   # Implementação parser Serial
│   └── setup_server.cpp    # Implementação servidor HTTP
├── platformio.ini          # ⭐ Configuração do PlatformIO
├── README.md               # Documentação básica
├── ARQUITETURA.md          # Documentação de arquitetura (antiga)
├── PINOUT.md               # Documentação de pinout
└── *.md                    # Outros documentos

⭐ = Arquivos mais importantes
```

---

## 📄 Descrição dos Arquivos Principais

### `platformio.ini`
**Propósito**: Configuração do projeto PlatformIO

**Conteúdo**:
- Plataforma: `espressif32`
- Board: `esp32dev`
- Framework: `arduino`
- Velocidade serial: 115200 baud
- Flags de compilação: `-O2` (otimização)
- Dependências:
  - `PubSubClient` (MQTT)
  - `ArduinoJson` (JSON)
  - `painlessMesh` (ESP-MESH)
  - `AsyncTCP` (TCP assíncrono)

**Quando modificar**:
- Adicionar nova biblioteca
- Mudar configurações de compilação
- Ajustar velocidade de upload

---

### `include/config.h`
**Propósito**: Todas as configurações do firmware em um único lugar

**Seções**:

#### 1. Versão
```cpp
#define FIRMWARE_VERSION    "2.4.1"
#define FIRMWARE_BUILD_DATE __DATE__
```

#### 2. WiFi
```cpp
#define WIFI_SSID           "AX-CORPORATIVO"
#define WIFI_PASSWORD       "auto@bacia"
#define WIFI_TIMEOUT_MS     15000UL
#define WIFI_LOSS_FALLBACK_MS 60000UL
```

#### 3. ESP-MESH
```cpp
#define MESH_ID             "IDVISUAL_ANDON"
#define MESH_PASSWORD       "andon@mesh2024"
#define MESH_PORT           5555
#define MESH_CHANNEL        6
#define MESH_MAX_CHILDREN   4
#define WIFI_RETRY_INTERVAL_MS 60000UL
```

#### 4. MQTT
```cpp
#define MQTT_BROKER         "192.168.1.28"
#define MQTT_PORT           1883
#define MQTT_BUFFER_SIZE    512
#define MQTT_KEEPALIVE_S    60
#define MQTT_MAX_RETRIES    10
```

#### 5. Pinos
```cpp
// Botões
#define BTN_VERDE           12
#define BTN_AMARELO         13
#define BTN_VERMELHO        32
#define BTN_PAUSE           33

// LEDs
#define LED_VERDE_PIN       19
#define LED_AMARELO_PIN     18
#define LED_VERMELHO_PIN    17
#define LED_ONBOARD_PIN     2
```

#### 6. Timers e Intervalos
```cpp
#define DEBOUNCE_MS              50UL
#define HEARTBEAT_INTERVAL_MS    300000UL  // 5 min
#define HEAP_MONITOR_INTERVAL_MS 30000UL   // 30 seg
#define INITIAL_BACKOFF_MS       5000UL
#define MAX_BACKOFF_MS           60000UL
#define WATCHDOG_TIMEOUT_S       60
```

**Quando modificar**:
- Mudar credenciais WiFi/MQTT
- Ajustar pinos de hardware
- Modificar intervalos de timers
- Atualizar versão do firmware

---

### `src/main.cpp`
**Propósito**: Arquivo principal com setup(), loop() e máquina de estados

**Tamanho**: ~1190 linhas

**Estrutura**:

#### 1. Includes e Definições (linhas 1-30)
```cpp
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <painlessMesh.h>
#include "config.h"
#include "ota.h"
```

#### 2. Estruturas de Dados (linhas 31-80)
```cpp
enum SystemState { BOOT, WIFI_CONNECTING, MQTT_CONNECTING, OPERATIONAL, MESH_NODE };
struct ButtonState { uint8_t pin; bool lastReading; unsigned long lastChangeTime; bool pressed; };
struct LEDState { uint8_t pin; bool state; };
struct Timer { unsigned long interval; unsigned long lastTrigger; };
struct ReconnectionState { uint8_t attemptCount; unsigned long backoffDelay; unsigned long lastAttempt; };
```

#### 3. Variáveis Globais (linhas 81-150)
```cpp
SystemState currentState = BOOT;
String macAddress;
String deviceName;
String g_andonStatus = "UNKNOWN";
bool g_isRoot = false;
bool g_meshStarted = false;
// ... muitas outras variáveis globais
```

#### 4. Declarações Antecipadas (linhas 151-180)
```cpp
void logSerial(const String& message);
void updateBackoff(ReconnectionState* state);
void handleWiFiConnecting();
void handleMQTTConnecting();
void handleOperational();
void handleMeshNode();
// ... todas as funções declaradas
```

#### 5. Utilitários (linhas 181-250)
```cpp
void logSerial(const String& message) { ... }
void updateBackoff(ReconnectionState* state) { ... }
void resetBackoff(ReconnectionState* state) { ... }
bool checkTimer(Timer* timer) { ... }
void updateLEDState(LEDState* led, bool state) { ... }
```

#### 6. Controle de LEDs Andon (linhas 251-450)
```cpp
void updateAndonLEDs() { ... }
void updateOdooErrorBlink() { ... }
void updatePauseBlink() { ... }
void updateUnassignedBlink() { ... }
void updateMQTTWaitBlink() { ... }
void updateMeshNodeBlink() { ... }
void playBootAnimation() { ... }
void playWiFiConnectedAnimation() { ... }
void playMeshConnectedAnimation() { ... }
void playDisconnectedBlink() { ... }
```

#### 7. ESP-MESH (linhas 451-650)
```cpp
void updateMeshCapacity() { ... }
void onMeshNewConnection(uint32_t nodeId) { ... }
void onMeshDroppedConnection(uint32_t nodeId) { ... }
void onMeshChangedConnections() { ... }
void onMeshMessage(uint32_t from, String& msg) { ... }
void sendMeshDiscovery() { ... }
void sendMeshHeartbeat() { ... }
void logMeshNode(const String& message) { ... }
void startMesh(bool asRoot) { ... }
void stopMeshAndRejoinWiFi() { ... }
```

#### 8. LED Onboard (linhas 651-700)
```cpp
void updateOnboardLED() { ... }
```

#### 9. WiFi (linhas 701-800)
```cpp
void beginWiFiConnect() { ... }
void handleWiFiConnecting() { ... }
```

#### 10. MQTT (linhas 801-950)
```cpp
String createDiscoveryMessage() { ... }
void logMQTT(const String& message) { ... }
void mqttCallback(char* topic, byte* payload, unsigned int length) { ... }
void handleMQTTConnecting() { ... }
```

#### 11. Estados OPERATIONAL e MESH_NODE (linhas 951-1050)
```cpp
void handleOperational() { ... }
void handleMeshNode() { ... }
```

#### 12. Botões e LEDs (linhas 1051-1120)
```cpp
void processButton(ButtonState* btn) { ... }
void checkResetCombo() { ... }
void publishButtonEvent(const String& color) { ... }
bool processLEDCommand(const String& payload) { ... }
```

#### 13. Inicialização (linhas 1121-1160)
```cpp
void initializeGPIOs() { ... }
void initializeWatchdog() { ... }
void obtainMACAddress() { ... }
```

#### 14. setup() e loop() (linhas 1161-1190)
```cpp
void setup() { ... }
void loop() { ... }
```

**Funções Críticas**:

| Função | Linhas | Propósito |
|--------|--------|-----------|
| `setup()` | ~30 | Inicialização do sistema |
| `loop()` | ~30 | Loop principal não-bloqueante |
| `handleWiFiConnecting()` | ~60 | Gerencia conexão WiFi |
| `handleMQTTConnecting()` | ~50 | Gerencia conexão MQTT |
| `handleOperational()` | ~60 | Estado operacional (raiz) |
| `handleMeshNode()` | ~50 | Estado nó folha (mesh) |
| `mqttCallback()` | ~80 | Processa mensagens MQTT |
| `onMeshMessage()` | ~60 | Processa mensagens mesh |
| `processButton()` | ~20 | Debounce de botões |
| `updateAndonLEDs()` | ~30 | Atualiza LEDs baseado em estado |

---

## 🔧 Módulos Auxiliares

### OTA (Over-The-Air Updates)

**Arquivos**: `include/ota.h`, `src/ota.cpp`

**Funções Principais**:
```cpp
void initOTA();                                    // Inicializa subsistema OTA
void handleOTATrigger(const char* payload);        // Processa comando OTA
void publishOTAProgress(const char* status, int progress, const char* error);
const char* getFirmwareVersion();                  // Retorna versão atual
```

**Fluxo**:
1. Backend publica comando em `andon/ota/trigger`
2. `handleOTATrigger()` valida payload
3. Baixa firmware via HTTP com progresso
4. Instala na partição OTA
5. Reinicia automaticamente
6. Bootloader valida ou faz rollback

**Dependências**:
- `HTTPUpdate` (ESP32 core)
- `esp_ota_ops.h` (validação de partição)

---

### Provisionamento Viral

**Arquivos**: `include/provisioning.h`, `src/provisioning.cpp`

**Funções Principais**:
```cpp
void provisioningInit();                           // Inicializa módulo
bool provisionManual(const char* ssid, const char* password);
bool provisionReset();                             // Limpa credenciais
ProvisioningState getProvisioningState();          // Retorna estado
void transmitProvisioningPayload();                // Transmite via ESP-NOW
void processReceivedProvisioningPayload(...);      // Processa payload recebido
```

**Estados**:
- `UNCONFIGURED`: Aguardando credenciais
- `TRANSMITTING`: Transmitindo credenciais (0-10 min)
- `OPERATIONAL`: Operação normal

**Fluxo**:
1. Dispositivo configurado manualmente via Serial
2. Entra em modo `TRANSMITTING` por 10 minutos
3. Transmite credenciais criptografadas via ESP-NOW a cada 30s
4. Outros dispositivos recebem e salvam credenciais
5. Outros dispositivos também entram em modo `TRANSMITTING`
6. Propagação viral automática

**Dependências**:
- `espnow_comm` (comunicação ESP-NOW)
- `crypto` (criptografia AES-GCM)
- `nvs_storage` (armazenamento)
- `rtc_sync` (validação de timestamp)

---

### Criptografia

**Arquivos**: `include/crypto.h`, `src/crypto.cpp`

**Funções Principais**:
```cpp
void cryptoInit();                                 // Inicializa módulo
void cryptoCleanup();                              // Limpa contexto
void deriveAESKey(const char* passphrase, uint8_t* key_out);
void generateRandomIV(uint8_t* iv_out);
bool encryptPayload(...);                          // Criptografa com AES-GCM
bool decryptPayload(...);                          // Descriptografa e valida
```

**Algoritmo**: AES-256-GCM
- **Chave**: Derivada de passphrase via SHA-256
- **IV**: 12 bytes aleatórios (gerado por hardware)
- **Auth Tag**: 16 bytes (validação de integridade)

**Estrutura do Payload Criptografado**:
```
[IV: 12 bytes] [Ciphertext: variável] [Auth Tag: 16 bytes]
```

**Dependências**:
- `mbedtls/gcm.h` (AES-GCM)
- `mbedtls/sha256.h` (derivação de chave)
- `esp_random.h` (gerador de números aleatórios)

---

### Armazenamento NVS

**Arquivos**: `include/nvs_storage.h`, `src/nvs_storage.cpp`

**Funções Principais**:
```cpp
bool nvsInit();                                    // Inicializa NVS
bool nvsSaveString(const char* key, const char* value);
bool nvsLoadString(const char* key, char* value, size_t max_len);
bool nvsKeyExists(const char* key);
bool nvsClearNamespace();                          // Limpa todas as chaves
```

**Namespace**: `"provisioning"`

**Chaves Usadas**:
- `wifi_ssid`: SSID do WiFi
- `wifi_password`: Senha do WiFi
- `device_name`: Nome do dispositivo (opcional)
- `location`: Localização do dispositivo (opcional)

**Dependências**:
- `Preferences.h` (wrapper do NVS)

---

### Sincronização RTC/NTP

**Arquivos**: `include/rtc_sync.h`, `src/rtc_sync.cpp`

**Funções Principais**:
```cpp
bool rtcSyncNTP(uint32_t timeout_ms);              // Sincroniza via NTP
uint32_t rtcGetTimestamp();                        // Retorna timestamp Unix
bool rtcIsSynced();                                // Verifica se sincronizado
bool rtcValidateTimestamp(uint32_t payload_timestamp, uint32_t window_seconds);
```

**Servidor NTP**: `pool.ntp.org`
**Timezone**: UTC-3 (Brasília)
**Janela de Validação**: ±5 minutos (anti-replay)

**Dependências**:
- `time.h` (funções de tempo)

---

### Parser Serial

**Arquivos**: `include/serial_parser.h`, `src/serial_parser.cpp`

**Funções Principais**:
```cpp
void serialProcessLine(const char* line);          // Processa linha Serial
bool serialHandleProvision(const char* ssid, const char* password);
bool serialHandleResetProvision();
```

**Comandos Suportados**:
```
PROVISION <ssid> <password>    # Configura credenciais WiFi
RESET_PROVISION                # Limpa credenciais
```

**Exemplo de Uso**:
```
PROVISION AX-CORPORATIVO auto@bacia
```

---

### Servidor HTTP de Configuração

**Arquivos**: `include/setup_server.h`, `src/setup_server.cpp`

**Funções Principais**:
```cpp
void setupServerInit(const char* mac_suffix);      // Inicia AP + servidor HTTP
void setupServerLoop();                            // Processa requisições HTTP
void setupServerStop();                            // Para servidor
bool setupServerIsRunning();                       // Verifica se está rodando
```

**Modo de Operação**:
1. Cria AP WiFi: `ESP32-Setup-XXXX`
2. Servidor HTTP em `192.168.4.1`
3. Página HTML com lista de redes WiFi
4. Formulário para configurar dispositivo
5. Salva na NVS e reinicia

**Endpoints**:
- `GET /`: Página de configuração
- `POST /configure`: Salva configuração

**⚠️ NOTA**: Este módulo não é usado na versão atual (provisionamento viral é preferido).

---

### Comunicação ESP-NOW

**Arquivos**: `include/espnow_comm.h`, `src/espnow_comm.cpp`

**Funções Principais**:
```cpp
bool espnowInit();                                 // Inicializa ESP-NOW
bool espnowRegisterBroadcastPeer();                // Registra peer de broadcast
bool espnowSendEncryptedPayload(const uint8_t* payload, size_t len);
void espnowReceiveCallback(...);                   // Callback de recepção
void espnowSendCallback(...);                      // Callback de envio
```

**Buffers Globais**:
```cpp
extern uint8_t g_espnowRxBuffer[256];              // Buffer de recepção
extern size_t g_espnowRxLen;                       // Tamanho recebido
extern uint8_t g_espnowRxMAC[6];                   // MAC do remetente
extern bool g_espnowRxFlag;                        // Flag de dados prontos
```

**Características**:
- **Modo**: Broadcast (FF:FF:FF:FF:FF:FF)
- **Canal**: 6 (mesmo do ESP-MESH)
- **Criptografia**: Desabilitada (usamos AES-GCM no payload)
- **Tamanho máximo**: 250 bytes

**Dependências**:
- `esp_now.h` (ESP-NOW API)

---

## 🔗 Dependências Entre Módulos

```
main.cpp
  ├─→ config.h (configurações)
  ├─→ ota.h
  │    └─→ config.h
  └─→ (usa MQTT, WiFi, painlessMesh diretamente)

provisioning.cpp
  ├─→ crypto.h
  ├─→ nvs_storage.h
  ├─→ rtc_sync.h
  ├─→ espnow_comm.h
  └─→ config.h

crypto.cpp
  └─→ config.h

nvs_storage.cpp
  └─→ config.h

rtc_sync.cpp
  └─→ config.h

espnow_comm.cpp
  └─→ config.h

serial_parser.cpp
  ├─→ nvs_storage.h
  └─→ config.h

setup_server.cpp
  ├─→ nvs_storage.h
  └─→ config.h

ota.cpp
  └─→ config.h
```

**Regra Geral**: Todos os módulos dependem de `config.h`

---

## 📊 Estatísticas do Código

### Tamanho dos Arquivos

| Arquivo | Linhas | Tamanho | Complexidade |
|---------|--------|---------|--------------|
| `main.cpp` | ~1190 | ~45 KB | Alta |
| `provisioning.cpp` | ~250 | ~10 KB | Média |
| `ota.cpp` | ~150 | ~6 KB | Baixa |
| `crypto.cpp` | ~120 | ~5 KB | Média |
| `setup_server.cpp` | ~200 | ~8 KB | Média |
| `espnow_comm.cpp` | ~100 | ~4 KB | Baixa |
| `nvs_storage.cpp` | ~80 | ~3 KB | Baixa |
| `rtc_sync.cpp` | ~80 | ~3 KB | Baixa |
| `serial_parser.cpp` | ~80 | ~3 KB | Baixa |

**Total**: ~2250 linhas de código (sem comentários)

### Uso de Memória

| Componente | Flash | RAM |
|------------|-------|-----|
| Firmware compilado | ~1.2 MB | - |
| Heap livre (boot) | - | ~280 KB |
| Heap livre (operação) | - | ~240 KB |
| Stack | - | ~8 KB |
| Variáveis globais | - | ~2 KB |
| Buffers JSON | - | ~2 KB |
| Buffers MQTT | - | ~512 B |

---

## 🎯 Pontos de Entrada

### Para Adicionar Funcionalidade

| Funcionalidade | Onde Modificar |
|----------------|----------------|
| Novo botão | `config.h` (pino), `main.cpp` (ButtonState, processButton) |
| Novo LED | `config.h` (pino), `main.cpp` (LEDState, updateLEDState) |
| Novo tópico MQTT | `main.cpp` (mqttCallback, handleMQTTConnecting) |
| Novo comando Serial | `serial_parser.cpp` (serialProcessLine) |
| Nova animação LED | `main.cpp` (criar função updateXxxBlink) |
| Novo estado Andon | `main.cpp` (updateAndonLEDs, mqttCallback) |
| Nova configuração | `config.h` (#define) |

### Para Corrigir Bug

| Sintoma | Onde Investigar |
|---------|-----------------|
| Botão não responde | `main.cpp` (processButton, debounce) |
| LED não acende | `main.cpp` (updateAndonLEDs, updateLEDState) |
| WiFi não conecta | `main.cpp` (handleWiFiConnecting, beginWiFiConnect) |
| MQTT não conecta | `main.cpp` (handleMQTTConnecting) |
| Mesh não funciona | `main.cpp` (startMesh, onMeshMessage) |
| OTA falha | `ota.cpp` (handleOTATrigger) |
| Provisionamento falha | `provisioning.cpp` (transmitProvisioningPayload) |
| Criptografia falha | `crypto.cpp` (encryptPayload, decryptPayload) |
| NVS não salva | `nvs_storage.cpp` (nvsSaveString) |
| Watchdog reset | `main.cpp` (loop, verificar bloqueios) |

---

## 🔍 Convenções de Código

### Nomenclatura

- **Variáveis globais**: `g_nomeVariavel` (prefixo `g_`)
- **Constantes**: `NOME_CONSTANTE` (maiúsculas com underscore)
- **Funções**: `nomeFuncao` (camelCase)
- **Structs**: `NomeStruct` (PascalCase)
- **Enums**: `NomeEnum` (PascalCase)

### Comentários

```cpp
// Comentário de linha única

/**
 * Comentário de bloco para funções
 * @param parametro Descrição do parâmetro
 * @return Descrição do retorno
 */

// ═══════════════════════════════════════════════════════════
// SEÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════

// ─── Subseção ──────────────────────────────────────────────
```

### Formatação

- **Indentação**: 4 espaços
- **Chaves**: Estilo K&R (chave de abertura na mesma linha)
- **Linhas**: Máximo 100 caracteres (recomendado)

---

**Próximo**: [04_MAQUINA_ESTADOS.md](04_MAQUINA_ESTADOS.md) - Máquina de Estados Detalhada
