# ⚡ Guia Rápido - Firmware ESP32 Andon

## 🎯 Referência Rápida para Desenvolvedores

Este é um guia de consulta rápida. Para documentação completa, veja **[docs/README.md](docs/README.md)**

---

## 📋 Informações Básicas

| Item | Valor |
|------|-------|
| **Versão** | 2.4.1 |
| **Plataforma** | ESP32-WROOM-32 |
| **Framework** | Arduino |
| **Linguagem** | C++ |
| **IDE** | PlatformIO + VS Code |
| **Serial** | 115200 baud |

---

## 🔌 Pinout Rápido

### Botões (INPUT_PULLUP)
```
GPIO 12  → Botão Verde
GPIO 13  → Botão Amarelo
GPIO 32  → Botão Vermelho
GPIO 33  → Botão Pause
```

### LEDs (OUTPUT)
```
GPIO 19  → LED Verde
GPIO 18  → LED Amarelo
GPIO 17  → LED Vermelho
GPIO 2   → LED Onboard (azul)
```

---

## 🔄 Estados do Sistema

```
BOOT → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL
                       ↘ MESH_NODE ↗
```

| Estado | LED Onboard | LEDs Andon |
|--------|-------------|------------|
| WIFI_CONNECTING | Pisca 500ms | Onda verde→amarelo→vermelho |
| MQTT_CONNECTING | Pisca 1000ms | Vermelho/amarelo alternados |
| OPERATIONAL | Aceso fixo | Conforme estado Andon |
| MESH_NODE | Duplo pulso | Amarelo piscando lento |

---

## 📡 Tópicos MQTT Principais

### Publicados pelo ESP32
```
andon/discovery                    → Info do dispositivo (ao conectar)
andon/status/{mac}                 → Status online/offline (LWT)
andon/button/{mac}/green           → Botão verde pressionado
andon/button/{mac}/yellow          → Botão amarelo pressionado
andon/button/{mac}/red             → Botão vermelho pressionado
andon/button/{mac}/pause           → Botão pause pressionado
andon/logs/{mac}                   → Logs de diagnóstico
```

### Subscritos pelo ESP32
```
andon/state/{mac}                  → Estado Andon (GREEN/YELLOW/RED/GRAY/UNASSIGNED)
andon/restart/{mac}                → Comando de restart
andon/odoo_error/{mac}             → Erro de integração Odoo
andon/ota/trigger                  → Comando de atualização OTA
```

---

## 🛠️ Comandos Úteis

### Compilar e Upload
```bash
# Compilar
pio run

# Upload via USB
pio run --target upload

# Monitor Serial
pio device monitor

# Tudo de uma vez
pio run --target upload && pio device monitor
```

### MQTT (Mosquitto)
```bash
# Subscrever todos os tópicos
mosquitto_sub -h 192.168.1.28 -t "andon/#" -v

# Enviar comando de estado
mosquitto_pub -h 192.168.1.28 -t "andon/state/AA:BB:CC:DD:EE:FF" -m "GREEN"

# Comando OTA
mosquitto_pub -h 192.168.1.28 -t "andon/ota/trigger" -m '{
  "version": "2.5.0",
  "url": "http://192.168.1.28:8000/static/ota/firmware-2.5.0.bin",
  "size": 1234567
}'
```

### Git
```bash
# Status
git status

# Adicionar arquivos
git add .

# Commit (Conventional Commits)
git commit -m "tipo(escopo): descricao"

# Tipos: feat, fix, refactor, docs, chore, style, test
```

---

## 🐛 Troubleshooting Rápido

### WiFi não conecta
```
1. Verificar SSID/senha em config.h
2. Verificar se rede é 2.4 GHz
3. Verificar sinal WiFi (RSSI > -70 dBm)
4. Após 15s, entra em modo mesh automaticamente
```

### MQTT não conecta
```
1. Verificar se broker está rodando: sudo systemctl status mosquitto
2. Verificar IP do broker em config.h
3. Pingar o broker: ping 192.168.1.28
4. Testar porta: telnet 192.168.1.28 1883
```

### Botão não responde
```
1. Verificar conexão física
2. Testar com multímetro (solto=HIGH, pressionado=LOW)
3. Verificar se ESP32 está em OPERATIONAL ou MESH_NODE
4. Verificar logs no Serial Monitor
```

### LED não acende
```
1. Verificar conexão física e polaridade
2. Verificar resistor (220Ω)
3. Testar LED com bateria 3V
4. Verificar pino em config.h
```

**Documentação completa**: [docs/14_TROUBLESHOOTING.md](docs/14_TROUBLESHOOTING.md)

---

## 📁 Arquivos Importantes

### Configuração
```
include/config.h          → Todas as configurações
platformio.ini            → Configuração do PlatformIO
```

### Código Principal
```
src/main.cpp              → Arquivo principal (1190 linhas)
  - setup()               → Inicialização
  - loop()                → Loop principal
  - handleXxx()           → Handlers de estados
```

### Módulos
```
src/ota.cpp               → Atualização OTA
src/provisioning.cpp      → Provisionamento viral
src/crypto.cpp            → Criptografia AES-GCM
src/nvs_storage.cpp       → Armazenamento NVS
src/espnow_comm.cpp       → Comunicação ESP-NOW
src/rtc_sync.cpp          → Sincronização NTP
```

---

## 🔧 Modificações Comuns

### Mudar Credenciais WiFi
```cpp
// include/config.h
#define WIFI_SSID "NOVO_SSID"
#define WIFI_PASSWORD "nova_senha"
```

### Mudar IP do Broker MQTT
```cpp
// include/config.h
#define MQTT_BROKER "192.168.1.100"
```

### Adicionar Novo Botão
```cpp
// 1. include/config.h
#define BTN_NOVO 14

// 2. src/main.cpp - Variáveis globais
ButtonState novoButton = {BTN_NOVO, HIGH, 0, false};

// 3. src/main.cpp - initializeGPIOs()
pinMode(BTN_NOVO, INPUT_PULLUP);

// 4. src/main.cpp - handleOperational() e handleMeshNode()
processButton(&novoButton);
if (novoButton.pressed) { 
    publishButtonEvent("novo"); 
    novoButton.pressed = false; 
}
```

### Adicionar Novo LED
```cpp
// 1. include/config.h
#define LED_NOVO_PIN 16

// 2. src/main.cpp - Variáveis globais
LEDState novoLED = {LED_NOVO_PIN, false};

// 3. src/main.cpp - initializeGPIOs()
pinMode(LED_NOVO_PIN, OUTPUT);
digitalWrite(LED_NOVO_PIN, LOW);

// 4. src/main.cpp - updateAndonLEDs()
// Adicionar lógica de controle
```

### Mudar Versão do Firmware
```cpp
// include/config.h
#define FIRMWARE_VERSION "2.5.0"

// src/main.cpp - Cabeçalho
/**
 * Versão: 2.5.0
 * Data: 2026-05-08
 */
```

---

## 📊 Valores de Configuração Padrão

```cpp
// WiFi
WIFI_TIMEOUT_MS = 15000              // 15 segundos
WIFI_LOSS_FALLBACK_MS = 60000        // 60 segundos

// MQTT
MQTT_PORT = 1883
MQTT_BUFFER_SIZE = 512
MQTT_KEEPALIVE_S = 60
MQTT_MAX_RETRIES = 10

// Mesh
MESH_ID = "IDVISUAL_ANDON"
MESH_CHANNEL = 6
MESH_MAX_CHILDREN = 4
WIFI_RETRY_INTERVAL_MS = 60000       // 60 segundos

// Timers
DEBOUNCE_MS = 50                     // 50 milissegundos
HEARTBEAT_INTERVAL_MS = 300000       // 5 minutos
HEAP_MONITOR_INTERVAL_MS = 30000     // 30 segundos
WATCHDOG_TIMEOUT_S = 60              // 60 segundos

// Backoff
INITIAL_BACKOFF_MS = 5000            // 5 segundos
MAX_BACKOFF_MS = 60000               // 60 segundos
```

---

## 🎨 Estados Visuais dos LEDs

| Estado Andon | Verde | Amarelo | Vermelho |
|--------------|-------|---------|----------|
| GREEN | ✅ Aceso | ❌ Apagado | ❌ Apagado |
| YELLOW | ❌ Apagado | ✅ Aceso | ❌ Apagado |
| RED | ❌ Apagado | ❌ Apagado | ✅ Aceso |
| GRAY | 💓 Piscando | 💓 Piscando | 💓 Piscando |
| UNASSIGNED | ❌ Apagado | 💓 Rápido | ❌ Apagado |

---

## 🔍 Logs Importantes

### Boot Normal
```
[0] BOOT: Iniciando firmware ID Visual AX v2.4.1
[150] GPIO: inicializados
[250] MAC: AA:BB:CC:DD:EE:FF
[3500] WIFI: Conectado! IP=192.168.1.87 RSSI=-45dBm
[4000] MQTT: Conectado ao broker!
[4040] MQTT: Transição para OPERATIONAL
```

### Erro WiFi
```
[15000] WIFI: timeout (15s) sem conectar -> MESH_NODE (fallback)
```

### Erro MQTT
```
[4000] MQTT: falha rc=-2 retry 5s
```

### Watchdog
```
[0] AVISO: Reset por watchdog detectado
```

---

## 📚 Documentação Completa

Para informações detalhadas, consulte:

- **[docs/README.md](docs/README.md)** - Entrada principal da documentação
- **[docs/00_INDICE.md](docs/00_INDICE.md)** - Índice completo
- **[docs/01_VISAO_GERAL.md](docs/01_VISAO_GERAL.md)** - Visão geral do sistema
- **[docs/02_ARQUITETURA.md](docs/02_ARQUITETURA.md)** - Arquitetura detalhada
- **[docs/03_ESTRUTURA_CODIGO.md](docs/03_ESTRUTURA_CODIGO.md)** - Estrutura do código
- **[docs/14_TROUBLESHOOTING.md](docs/14_TROUBLESHOOTING.md)** - Troubleshooting completo
- **[docs/RESUMO_DOCUMENTACAO.md](docs/RESUMO_DOCUMENTACAO.md)** - Resumo executivo

---

## 🆘 Suporte

1. **Consulte a documentação** em `docs/`
2. **Verifique logs** no Serial Monitor
3. **Teste com MQTT Explorer** para debug de comunicação
4. **Contate a equipe** se problema persistir

---

**Última atualização**: 2026-05-07  
**Versão**: 2.4.1
