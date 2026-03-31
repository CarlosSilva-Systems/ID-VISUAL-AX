# Firmware ESP32 Andon - Sistema ID Visual AX

Firmware para dispositivo ESP32 que atua como interface física do sistema Andon, capturando eventos de botões e controlando LEDs de status através de comunicação MQTT bidirecional com o backend FastAPI.

## Visão Geral

O ESP32 funciona como um botão de acionamento do sistema Andon (sistema de alertas de chão de fábrica) e como indicador de status da mesa de trabalho. Ele se comunica com o backend via protocolo MQTT, reportando eventos de botões e recebendo comandos para controlar LEDs.

### Características Principais

- ✅ Máquina de estados robusta (BOOT → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL)
- ✅ Reconexão automática WiFi/MQTT com backoff exponencial
- ✅ Debounce de botões não-bloqueante (50ms)
- ✅ Watchdog timer para resiliência (30s timeout)
- ✅ Heartbeat periódico (5 minutos)
- ✅ Monitoramento de memória heap
- ✅ Last Will and Testament (LWT) para detecção de desconexão
- ✅ Discovery automático no backend

## Pré-requisitos

### Software

- [PlatformIO](https://platformio.org/) instalado (via VS Code ou CLI)
- Python 3.7+ (para PlatformIO)
- Driver USB-Serial para ESP32 (geralmente CH340 ou CP2102)

### Hardware

- ESP32 DevKit (qualquer variante com WiFi)
- 3 botões (verde, amarelo, vermelho) com resistores pull-up externos para GPIOs 34 e 35
- 3 LEDs de status (verde, amarelo, vermelho) com resistores limitadores de corrente
- Fonte de alimentação 5V via USB ou externa

## Mapa de GPIOs

### Botões (Input)

| Botão    | GPIO | Configuração      | Observação                                    |
|----------|------|-------------------|-----------------------------------------------|
| Verde    | 34   | INPUT             | ⚠️ Input-only, SEM pull-up interno           |
| Amarelo  | 35   | INPUT             | ⚠️ Input-only, SEM pull-up interno           |
| Vermelho | 32   | INPUT_PULLUP      | Suporta pull-up interno                       |

**IMPORTANTE**: GPIOs 34 e 35 são input-only no ESP32 e não possuem resistor de pull-up interno. O circuito externo DEVE fornecer pull-up ou pull-down.

### LEDs (Output)

| LED      | GPIO | Função                                        |
|----------|------|-----------------------------------------------|
| Vermelho | 25   | Indicador de status (controlado via MQTT)     |
| Amarelo  | 26   | Indicador de status (controlado via MQTT)     |
| Verde    | 33   | Indicador de status (controlado via MQTT)     |
| Onboard  | 2    | Indicador de conectividade WiFi/MQTT          |

### Padrões do LED Onboard

| Estado           | Padrão                    |
|------------------|---------------------------|
| WIFI_CONNECTING  | Pisca a cada 500ms        |
| MQTT_CONNECTING  | Pisca a cada 1000ms       |
| OPERATIONAL      | Aceso continuamente       |

## Instalação

### 1. Clonar o Repositório

```bash
git clone <url-do-repositorio>
cd <repositorio>/hardware
```

### 2. Instalar Dependências

PlatformIO instalará automaticamente as bibliotecas necessárias:
- `knolleary/PubSubClient@^2.8` - Cliente MQTT
- `bblanchon/ArduinoJson@^6.21.0` - Serialização JSON

### 3. Configurar Credenciais

Edite o arquivo `include/config.h` e ajuste as seguintes constantes:

```cpp
// WiFi
#define WIFI_SSID "SUA_REDE_WIFI"
#define WIFI_PASSWORD "SUA_SENHA_WIFI"

// MQTT Broker
#define MQTT_BROKER "IP_DO_BROKER"  // Ex: "192.168.10.55"
#define MQTT_PORT 1883
```

## Compilação e Upload

### Via PlatformIO CLI

```bash
# Compilar o projeto
pio run

# Fazer upload para o ESP32 (conectado via USB)
pio run --target upload

# Monitorar Serial Monitor
pio device monitor

# Compilar + Upload + Monitor (tudo de uma vez)
pio run --target upload && pio device monitor
```

### Via VS Code (PlatformIO IDE)

1. Abrir a pasta `hardware/` no VS Code
2. Clicar no ícone do PlatformIO na barra lateral
3. Selecionar:
   - **Build** para compilar
   - **Upload** para fazer upload
   - **Monitor** para abrir o Serial Monitor

## Protocolo MQTT

### Tópicos Publicados pelo ESP32

| Tópico                          | QoS | Retain | Payload                                      | Descrição                    |
|---------------------------------|-----|--------|----------------------------------------------|------------------------------|
| `andon/discovery`               | 1   | false  | JSON (ver abaixo)                            | Registro inicial             |
| `andon/status/{mac}`            | 1   | true   | `"online"` / `"offline"` / `"heartbeat"`     | Status de conectividade      |
| `andon/logs/{mac}`              | 1   | false  | String de texto                              | Logs de diagnóstico          |
| `andon/button/{mac}/green`      | 1   | false  | `"PRESSED"`                                  | Evento botão verde           |
| `andon/button/{mac}/yellow`     | 1   | false  | `"PRESSED"`                                  | Evento botão amarelo         |
| `andon/button/{mac}/red`        | 1   | false  | `"PRESSED"`                                  | Evento botão vermelho        |

#### Discovery Message (JSON)

```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "device_name": "ESP32-Andon-EEFF",
  "firmware_version": "1.0.0"
}
```

### Tópicos Subscritos pelo ESP32

| Tópico                          | QoS | Payload Esperado                             | Descrição                    |
|---------------------------------|-----|----------------------------------------------|------------------------------|
| `andon/led/{mac}/command`       | 1   | JSON (ver abaixo)                            | Comando para controlar LEDs  |

#### LED Command Message (JSON)

```json
{
  "red": true,
  "yellow": false,
  "green": false
}
```

**Campos**:
- `red`: Boolean - Estado do LED vermelho (true = aceso, false = apagado)
- `yellow`: Boolean - Estado do LED amarelo
- `green`: Boolean - Estado do LED verde

## Saída Serial Esperada

```
═══════════════════════════════════════════════════════
  Firmware ESP32 Andon - Sistema ID Visual AX
  Versão: 1.0.0
═══════════════════════════════════════════════════════

[0] BOOT: Iniciando firmware ID Visual AX v1.0.0
[150] GPIOs inicializados
[200] Watchdog Timer inicializado (30s timeout)
[250] MAC Address: AA:BB:CC:DD:EE:FF
[260] Device Name: ESP32-Andon-EEFF
[270] MQTT: Cliente configurado
[280] BOOT: Transição para WIFI_CONNECTING
[300] WIFI: Conectando a AX-CORPORATIVO...
[3500] WIFI: Conectado! IP: 192.168.10.87
[3510] WIFI: Transição para MQTT_CONNECTING
[3520] MQTT: Conectando ao broker 192.168.10.55:1883...
[4000] MQTT: Conectado ao broker!
[4010] MQTT: Status 'online' publicado
[4020] MQTT: Discovery publicado: {"mac_address":"AA:BB:CC:DD:EE:FF","device_name":"ESP32-Andon-EEFF","firmware_version":"1.0.0"}
[4030] MQTT: Subscrito em andon/led/AA:BB:CC:DD:EE:FF/command
[4040] MQTT: Transição para OPERATIONAL
[10000] BUTTON: verde pressionado → publicado andon/button/AA:BB:CC:DD:EE:FF/green
[15000] MQTT: Mensagem recebida no tópico: andon/led/AA:BB:CC:DD:EE:FF/command
[15010] LED: Comando aplicado - red=false yellow=true green=false
[300000] HEARTBEAT: operacional, heap livre: 245632 bytes
```

## Atualização de Versão

Antes de cada release, atualizar a versão do firmware:

1. Editar `include/config.h`:
   ```cpp
   #define FIRMWARE_VERSION "X.Y.Z"
   ```

2. Atualizar o cabeçalho de `src/main.cpp`:
   ```cpp
   /**
    * Versão: X.Y.Z
    * Data: YYYY-MM-DD
    */
   ```

3. Compilar e testar antes de fazer upload em produção

## Troubleshooting

### ESP32 não conecta ao WiFi

- ✅ Verificar SSID e senha em `config.h`
- ✅ Verificar se a rede WiFi está no alcance
- ✅ Verificar se a rede é 2.4GHz (ESP32 não suporta 5GHz)
- ✅ Observar LED onboard piscando a cada 500ms (tentando conectar)

### ESP32 não conecta ao MQTT

- ✅ Verificar IP e porta do broker em `config.h`
- ✅ Verificar se o broker MQTT está rodando (`mosquitto -v`)
- ✅ Verificar firewall/rede permitindo porta 1883
- ✅ Observar LED onboard piscando a cada 1000ms (tentando conectar)
- ✅ Verificar logs no Serial Monitor para código de erro MQTT

### Botões não respondem

- ✅ Verificar conexões físicas dos botões
- ✅ Verificar resistores pull-up externos nos GPIOs 34 e 35
- ✅ Verificar se ESP32 está no estado OPERATIONAL (LED onboard aceso fixo)
- ✅ Observar Serial Monitor para mensagens de botão pressionado

### LEDs não acendem via comando MQTT

- ✅ Verificar conexões físicas dos LEDs e resistores
- ✅ Verificar se ESP32 está subscrito no tópico correto
- ✅ Verificar formato do JSON enviado (deve ter campos red, yellow, green)
- ✅ Observar Serial Monitor para mensagens de comando LED recebido

### Watchdog reset detectado

- ⚠️ Indica que o firmware travou por mais de 30 segundos
- ✅ Verificar logs anteriores ao reset para identificar causa
- ✅ Verificar se há operações bloqueantes (delay() no loop)
- ✅ Verificar memória heap disponível

### Heap baixo

- ⚠️ Indica possível vazamento de memória
- ✅ Observar heap livre no heartbeat (deve estar acima de 10KB)
- ✅ Verificar se há alocações dinâmicas não liberadas
- ✅ Considerar reduzir tamanho de buffers JSON se necessário

## Testes

### Teste Manual

1. **Boot**: Observar LED onboard piscar 3x ao ligar
2. **WiFi**: Observar LED onboard piscar 500ms até conectar
3. **MQTT**: Observar LED onboard piscar 1000ms até conectar
4. **Operational**: LED onboard aceso fixo
5. **Botões**: Pressionar cada botão e verificar mensagem no Serial
6. **LEDs**: Enviar comando MQTT e verificar LEDs acendendo

### Teste de Reconexão

1. Desconectar WiFi → ESP32 deve retornar para WIFI_CONNECTING
2. Parar broker MQTT → ESP32 deve retornar para MQTT_CONNECTING
3. Reconectar → ESP32 deve republicar discovery e status online

### Teste de Longa Duração

Deixar ESP32 rodando por 24h e verificar:
- Heap livre permanece estável
- Heartbeat é enviado a cada 5 minutos
- Nenhum watchdog reset ocorre

## Arquitetura

### Máquina de Estados

```
BOOT → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL
                ↑                ↑                ↓
                └────────────────┴────────────────┘
                    (reconexão automática)
```

### Fluxo de Dados

```
Botão Pressionado → Debounce (50ms) → Publish MQTT → Backend processa
Backend decide → Publish LED Command → ESP32 recebe → Atualiza GPIOs
```

## Licença

Este firmware faz parte do sistema ID Visual AX.

## Suporte

Para problemas ou dúvidas, consultar a documentação do sistema ID Visual AX ou contatar a equipe de desenvolvimento.
