# Firmware ESP32 Andon — ID Visual AX

Firmware embarcado para ESP32 que atua como interface física de um sistema Andon industrial. Operadores acionam botões retroiluminados para comunicar status ao chão de fábrica; o ESP32 publica eventos via MQTT e exibe o estado atual através dos LEDs dos próprios botões.

Desenvolvido pela equipe de hardware da **AX Automação**.

---

## O que é este projeto

Um dispositivo de mesa com 4 botões retroiluminados (verde, amarelo, vermelho, azul) conectado a um backend via MQTT. O backend — integrado ao Odoo — é a fonte de verdade: o ESP32 nunca toma decisões de negócio, apenas captura entradas físicas e exibe o estado recebido.

O firmware implementa uma arquitetura híbrida WiFi + ESP-MESH: dispositivos com acesso ao WiFi viram nós raiz e fazem ponte para o broker MQTT; dispositivos sem WiFi entram como nós folha e roteiam eventos pela mesh automaticamente.

---

## Hardware

**Microcontrolador:** ESP32 DevKit v1 (ESP32-WROOM-32)

**Layout dos botões:**
```
┌────────────────────────────┐
│   🟢 VERDE    🟡 AMARELO   │
│   🔴 VERMELHO   🔵 AZUL    │
└────────────────────────────┘
```

**Pinout resumido:**

| Componente | GPIO | Tipo |
|-----------|------|------|
| Botão Verde | 12 | INPUT_PULLUP |
| Botão Amarelo | 13 | INPUT_PULLUP |
| Botão Vermelho | 32 | INPUT_PULLUP |
| Botão Azul | 33 | INPUT_PULLUP |
| LED Verde | 19 | OUTPUT |
| LED Amarelo | 18 | OUTPUT |
| LED Vermelho | 17 | OUTPUT |
| LED Azul | 16 | OUTPUT |
| LED Onboard | 2 | OUTPUT |

> Resistor 220Ω em série com cada LED externo. Todos os botões são ligados entre o GPIO e o GND (pull-up interno do ESP32 ativo).

Documentação completa de hardware: [`docs/PINOUT.md`](docs/PINOUT.md)

---

## Arquitetura do Firmware

### Máquina de estados

```
BOOT → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL (nó raiz)
                       ↘ MESH_NODE (nó folha) ──→ retry WiFi 60s ──┘
```

- **BOOT** — inicializa GPIO, watchdog, MAC, animação de boot
- **WIFI_CONNECTING** — `WiFi.begin()` direto sem scan (scan conflita com painlessMesh); timeout 15s
- **MQTT_CONNECTING** — conecta ao broker, publica LWT + discovery, subscreve tópicos
- **OPERATIONAL** — nó raiz com MQTT ativo; WiFi caído por 60s faz fallback para MESH_NODE
- **MESH_NODE** — nó folha sem WiFi; eventos vão via mesh broadcast para o raiz republicar no MQTT; retenta WiFi a cada 60s

### Princípio fundamental

O backend é a fonte de verdade. O ESP32:
- **Faz:** detecta botões → publica eventos MQTT; recebe estado → controla LEDs
- **Não faz:** lógica de negócio, regras de produção, validação de chamados

### Módulos

| Módulo | Arquivo | Responsabilidade |
|--------|---------|-----------------|
| Principal | `src/main.cpp` | Máquina de estados, WiFi, MQTT, mesh, botões, LEDs |
| OTA | `src/ota.cpp` | Atualização over-the-air via MQTT + HTTP |
| ESP-NOW | `src/espnow_comm.cpp` | Transmissão broadcast criptografada |
| Provisioning | `src/provisioning.cpp` | Propagação viral de credenciais WiFi |
| Criptografia | `src/crypto.cpp` | AES-256-GCM com mbedTLS |
| NVS | `src/nvs_storage.cpp` | Armazenamento persistente (Preferences) |
| RTC/NTP | `src/rtc_sync.cpp` | Sincronização de tempo, anti-replay |
| Serial Parser | `src/serial_parser.cpp` | Comandos via Serial (`PROVISION`, `RESET_PROVISION`) |
| Setup Server | `src/setup_server.cpp` | AP WiFi + página HTTP para configuração inicial |

Documentação detalhada: [`docs/02_ARQUITETURA.md`](docs/02_ARQUITETURA.md) e [`docs/03_ESTRUTURA_CODIGO.md`](docs/03_ESTRUTURA_CODIGO.md)

---

## Configuração

Todas as configurações ficam em **`include/config.h`** — é o único arquivo que você precisa editar antes de compilar.

```cpp
// Versão
#define FIRMWARE_VERSION    "2.5.0"

// WiFi
#define WIFI_SSID           "AX AUTOMACAO"
#define WIFI_PASSWORD       "axautomacao123"
#define WIFI_TIMEOUT_MS     15000UL         // 15s antes de cair para mesh

// MQTT
#define MQTT_BROKER         "192.168.1.28"  // servidor ax-producao
#define MQTT_PORT           1883

// ESP-MESH (todos os nós devem ter os mesmos valores)
#define MESH_ID             "IDVISUAL_ANDON"
#define MESH_PASSWORD       "andon@mesh2024"
#define MESH_CHANNEL        6               // deve bater com o canal do AP
#define MESH_MAX_CHILDREN   4

// Pinos — Botões
#define BTN_VERDE           12
#define BTN_AMARELO         13
#define BTN_VERMELHO        32
#define BTN_AZUL            33

// Pinos — LEDs
#define LED_VERDE_PIN       19
#define LED_AMARELO_PIN     18
#define LED_VERMELHO_PIN    17
#define LED_AZUL_PIN        16
#define LED_ONBOARD_PIN     2
```

> ⚠️ `MESH_CHANNEL` deve ser igual ao canal WiFi do roteador. Use um analisador de espectro para confirmar.

---

## Compilação e Upload

### Pré-requisitos

- [VS Code](https://code.visualstudio.com/) com a extensão [PlatformIO IDE](https://platformio.org/install/ide?install=vscode)
- Driver USB-Serial para ESP32 (geralmente CH340 ou CP2102)
- Python 3.8+ (usado internamente pelo PlatformIO)

### Dependências (instaladas automaticamente pelo PlatformIO)

```ini
lib_deps =
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^6.21.0
    painlessMesh@^1.5.0
    https://github.com/me-no-dev/AsyncTCP.git
```

### Comandos

```bash
# Abrir o projeto: abra a pasta hardware/ no VS Code

# Compilar
pio run

# Upload via USB
pio run --target upload

# Abrir Serial Monitor (115200 baud)
pio device monitor

# Compilar + upload + monitor (mais comum no dia a dia)
pio run --target upload && pio device monitor
```

Guia de instalação detalhado: [`docs/GUIA_COMPILACAO.md`](docs/GUIA_COMPILACAO.md)

---

## Protocolo MQTT

### Tópicos publicados pelo ESP32

| Tópico | QoS | Retain | Payload |
|--------|-----|--------|---------|
| `andon/discovery` | 1 | false | JSON com info do dispositivo |
| `andon/status/{mac}` | 1 | true | `"online"` / `"offline"` (LWT) / JSON heartbeat |
| `andon/logs/{mac}` | 1 | false | String de texto |
| `andon/button/{mac}/green` | 1 | false | `"PRESSED"` |
| `andon/button/{mac}/yellow` | 1 | false | `"PRESSED"` |
| `andon/button/{mac}/red` | 1 | false | `"PRESSED"` |
| `andon/button/{mac}/pause` | 1 | false | `"PRESSED"` — botão azul usa `pause`, não `blue` |
| `andon/ota/progress/{mac}` | 0 | false | JSON `{status, progress, error}` |

### Tópicos subscritos pelo ESP32

| Tópico | QoS | Ação |
|--------|-----|------|
| `andon/state/{mac}` | 1 | Atualiza LEDs: `GREEN` / `YELLOW` / `RED` / `GRAY` / `UNASSIGNED` |
| `andon/restart/{mac}` | 1 | Reinicia o ESP32 quando payload = `"RESTART"` |
| `andon/odoo_error/{mac}` | 1 | Ativa blink vermelho urgente por 5s |
| `andon/ota/trigger` | 1 | Inicia download OTA: `{version, url, size}` |
| `andon/ota/cancel` | 1 | Cancela download OTA em andamento |

### Payload de discovery

```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "device_name": "ESP32-Andon-EEFF",
  "firmware_version": "2.5.0",
  "is_root": true,
  "mesh_node_id": "123456789",
  "mesh_node_count": 3,
  "mesh_children": 2,
  "rssi": -45,
  "ip_address": "192.168.1.87",
  "connection_type": "wifi"
}
```

### Payload de heartbeat (publicado em `andon/status/{mac}` a cada 5 min)

```json
{
  "heap": 245632,
  "rssi": -45,
  "mesh_nodes": 3,
  "mesh_children": 2,
  "is_root": true
}
```

---

## Estados Visuais dos LEDs

### Estados Andon (recebidos do backend)

| Estado | Verde | Amarelo | Vermelho | Azul |
|--------|-------|---------|----------|------|
| `GREEN` | Fixo | Apagado | Apagado | Apagado |
| `YELLOW` | Apagado | Fixo | Apagado | Apagado |
| `RED` | Apagado | Apagado | Fixo | Apagado |
| `GRAY` | Apagado | Apagado | Apagado | Pisca ~70 BPM — fabricação pausada |
| `UNASSIGNED` | Apagado | Pisca 200ms | Apagado | Apagado — dispositivo não vinculado |

### Estados de conectividade

| Estado | LEDs |
|--------|------|
| WIFI_CONNECTING | Verde ↔ Amarelo oscilam alternados |
| MQTT_CONNECTING | Amarelo ↔ Vermelho oscilam alternados |
| MESH_NODE | Azul pisca lento (1s) |
| Erro Odoo | Vermelho pisca rápido (150ms) por 5s |

Referência visual completa: [`docs/GUIA_LED_VISUAL.md`](docs/GUIA_LED_VISUAL.md)

---

## Atualização de Firmware (OTA)

O firmware suporta atualização remota sem acesso físico ao dispositivo.

```bash
# Publicar comando OTA (substitua a URL e versão)
mosquitto_pub -h 192.168.1.28 -t "andon/ota/trigger" -m \
  '{"version":"2.5.0","url":"http://192.168.1.28:8000/static/ota/firmware-2.5.0.bin","size":1234567}'

# Monitorar progresso
mosquitto_sub -h 192.168.1.28 -t "andon/ota/progress/#" -v
```

O bootloader do ESP32 valida o novo firmware após o reboot. Se o firmware crashar, o rollback é automático. Instruções completas: [`docs/INSTRUCOES_ATUALIZACAO_OTA.md`](docs/INSTRUCOES_ATUALIZACAO_OTA.md)

---

## Provisionamento de Credenciais WiFi

Dispositivos novos podem receber credenciais WiFi de dois jeitos:

**Via Serial** (mais simples, requer cabo USB):
```
PROVISION AX AUTOMACAO axautomacao123
```

**Via provisionamento viral (ESP-NOW + AES-256-GCM):**
Um dispositivo já configurado transmite credenciais criptografadas por 10 minutos após ser provisionado. Dispositivos próximos recebem automaticamente e também entram em modo de transmissão — propagação em cadeia. Anti-replay por timestamp NTP (janela ±5 min).

---

## Rede Mesh

Quando o WiFi não está disponível, o dispositivo entra em modo `MESH_NODE` e se conecta à mesh ESP-MESH criada pelos nós raiz.

```
Router WiFi
    │
    ├─ ESP32-A (RAIZ — MQTT ativo)
    │     ├─ ESP32-C (FOLHA)
    │     └─ ESP32-D (FOLHA)
    └─ ESP32-B (RAIZ — MQTT ativo)
          └─ ESP32-E (FOLHA)
```

- Máximo 4 filhos diretos por nó (limitação do SoftAP do ESP32)
- Latência adicional: ~50–100ms por hop
- Nós folha tentam voltar para WiFi direto a cada 60s

---

## Lógica de Botões

### Intertravamento
2 segundos mínimo entre acionamentos de botões diferentes. Evita múltiplos eventos por erro.

### Bloqueio durante pause (GRAY)
Quando o backend envia `GRAY` (fabricação pausada), os botões verde, amarelo e vermelho são ignorados. O botão azul (pause/resume) funciona sempre — é ele que despausa.

### Reset por hardware
Segurar o botão azul por 5 segundos reinicia o ESP32. Uma animação de confirmação é exibida antes do reboot.

Documentação detalhada: [`docs/LOGICA_PAUSE_BOTOES.md`](docs/LOGICA_PAUSE_BOTOES.md)

---

## Troubleshooting Rápido

**WiFi não conecta**
- Verificar SSID/senha em `config.h` (case-sensitive)
- Rede deve ser 2.4 GHz (ESP32 não suporta 5 GHz)
- Após 15s, o dispositivo cai automaticamente para modo mesh

**MQTT não conecta**
```bash
systemctl status mosquitto       # verificar se broker está rodando
ping 192.168.1.28                # verificar conectividade
telnet 192.168.1.28 1883         # testar porta MQTT
```

**Botão não responde**
- Verificar se o dispositivo está em OPERATIONAL ou MESH_NODE (LED onboard aceso ou duplo pulso)
- Testar GPIO no Serial: solto = HIGH (1), pressionado = LOW (0)

**LED não acende**
- Verificar polaridade: ânodo no GPIO, cátodo no GND via resistor 220Ω
- Testar LED com bateria 3V antes de desconfiar do firmware

Guia completo: [`docs/14_TROUBLESHOOTING.md`](docs/14_TROUBLESHOOTING.md)

---

## Estrutura do Repositório

```
hardware/
├── platformio.ini          ← configuração de build e dependências
├── include/
│   ├── config.h            ← TODAS as constantes (edite aqui)
│   └── *.h                 ← headers dos módulos
├── src/
│   ├── main.cpp            ← lógica principal (~1190 linhas)
│   └── *.cpp               ← implementações dos módulos
└── docs/
    ├── 00_INDICE.md        ← índice da documentação
    ├── 01_VISAO_GERAL.md   ← contexto e objetivos
    ├── 02_ARQUITETURA.md   ← design, estados, mesh, MQTT
    ├── 03_ESTRUTURA_CODIGO.md  ← como navegar no código
    ├── 14_TROUBLESHOOTING.md   ← problemas e soluções
    ├── GUIA_RAPIDO.md      ← referência rápida
    ├── GUIA_COMPILACAO.md  ← como compilar e subir
    ├── GUIA_LED_VISUAL.md  ← referência de animações de LED
    ├── PINOUT.md           ← mapeamento completo de GPIOs
    ├── LOGICA_BOTOES.md    ← validação de ações por estado
    ├── LOGICA_PAUSE_BOTOES.md  ← intertravamento e pause
    ├── INSTRUCOES_ATUALIZACAO_OTA.md  ← processo OTA
    └── PRODUCAO.md         ← recomendações para ambiente industrial
```

---

## Boas Práticas para Manutenção

Ao modificar o firmware:

1. Atualizar `FIRMWARE_VERSION` em `config.h` e o cabeçalho de `main.cpp`
2. Testar localmente com um dispositivo antes de fazer OTA em produção
3. Documentar qualquer mudança de comportamento nos arquivos relevantes em `docs/`
4. Usar Conventional Commits: `feat(firmware): adiciona suporte a botão extra`

Tipos de commit: `feat`, `fix`, `refactor`, `docs`, `chore`, `style`, `test`

---

## Licença

Propriedade da **AX Automação**. Repositório privado — uso interno.
