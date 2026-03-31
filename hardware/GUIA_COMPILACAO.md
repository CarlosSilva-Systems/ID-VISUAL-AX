# Guia de Compilação e Upload — Firmware ESP32 Andon

Este guia fornece instruções passo-a-passo para compilar e fazer upload do firmware ESP32 Andon usando o PlatformIO no VS Code.

## Pré-requisitos

### 1. Software Necessário

- **VS Code** (Visual Studio Code) instalado
- **Extensão PlatformIO IDE** instalada no VS Code
  - Abra VS Code → Extensions (Ctrl+Shift+X)
  - Busque por "PlatformIO IDE"
  - Clique em "Install"
  - Aguarde a instalação completa (pode demorar alguns minutos)

### 2. Hardware Necessário

- **ESP32 DevKit** (qualquer modelo compatível)
- **Cabo USB** (USB-A para Micro-USB ou USB-C, dependendo do modelo)
- **3 Botões** (push-button normalmente aberto)
- **3 LEDs** (vermelho, amarelo, verde) + resistores 220Ω
- **Resistores pull-up externos** para GPIO 34 e 35 (10kΩ recomendado)
- **Protoboard e jumpers** para montagem

### 3. Configuração de Rede

Antes de compilar, você DEVE configurar as credenciais WiFi e o endereço do broker MQTT:

1. Abra o arquivo `hardware/include/config.h`
2. Edite as seguintes constantes:

```cpp
// WiFi
#define WIFI_SSID            "SEU_SSID_AQUI"
#define WIFI_PASSWORD        "SUA_SENHA_AQUI"

// MQTT Broker
#define MQTT_BROKER          "192.168.10.55"  // IP do seu broker MQTT
#define MQTT_PORT            1883
```

⚠️ **IMPORTANTE**: Sem essas configurações corretas, o ESP32 não conseguirá conectar à rede.

---

## Montagem do Hardware

### Pinagem — Botões

| Botão    | GPIO | Observação                          |
|----------|------|-------------------------------------|
| Verde    | 34   | Input-only, requer pull-up externo |
| Amarelo  | 35   | Input-only, requer pull-up externo |
| Vermelho | 32   | Suporta pull-up interno             |

**Conexão dos botões:**
- Um terminal do botão → GPIO correspondente
- Outro terminal do botão → GND
- Para GPIO 34 e 35: adicionar resistor de 10kΩ entre GPIO e 3.3V (pull-up externo)

### Pinagem — LEDs

| LED      | GPIO | Observação                    |
|----------|------|-------------------------------|
| Vermelho | 25   | Adicionar resistor 220Ω      |
| Amarelo  | 26   | Adicionar resistor 220Ω      |
| Verde    | 33   | Adicionar resistor 220Ω      |
| Onboard  | 2    | LED integrado na placa       |

**Conexão dos LEDs:**
- Anodo (+) do LED → GPIO correspondente
- Catodo (-) do LED → Resistor 220Ω → GND

---

## Passo 1: Abrir o Projeto no VS Code

1. Abra o VS Code
2. Clique em **File → Open Folder**
3. Navegue até a pasta `hardware/` do projeto
4. Clique em "Selecionar Pasta"

O PlatformIO detectará automaticamente o arquivo `platformio.ini` e configurará o projeto.

---

## Passo 2: Instalar Dependências

O PlatformIO instalará automaticamente as bibliotecas necessárias na primeira compilação:
- `PubSubClient` (cliente MQTT)
- `ArduinoJson` (parsing JSON)

Você verá o progresso no terminal integrado do VS Code.

---

## Passo 3: Conectar o ESP32

1. Conecte o ESP32 ao computador via cabo USB
2. Aguarde o Windows reconhecer o dispositivo
3. Verifique se o driver USB-Serial está instalado:
   - Abra **Gerenciador de Dispositivos**
   - Procure por "Portas (COM & LPT)"
   - Deve aparecer algo como "Silicon Labs CP210x USB to UART Bridge (COM3)"
   - Se não aparecer, instale o driver: [CP210x Driver](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)

---

## Passo 4: Compilar o Firmware

### Opção A: Via Interface Gráfica (Recomendado)

1. Na barra lateral esquerda do VS Code, clique no ícone do **PlatformIO** (alien/formiga)
2. Expanda **PROJECT TASKS**
3. Expanda **esp32dev**
4. Clique em **General → Build**

### Opção B: Via Terminal

1. Abra o terminal integrado (Ctrl+`)
2. Execute:
```bash
cd hardware
pio run
```

**Saída esperada:**
```
Processing esp32dev (platform: espressif32; board: esp32dev; framework: arduino)
...
Building .pio/build/esp32dev/firmware.bin
RAM:   [=         ]  12.3% (used 40284 bytes from 327680 bytes)
Flash: [====      ]  42.1% (used 551237 bytes from 1310720 bytes)
========================= [SUCCESS] Took 15.23 seconds =========================
```

Se houver erros de compilação, verifique:
- Sintaxe do código
- Configurações no `config.h`
- Versão das bibliotecas no `platformio.ini`

---

## Passo 5: Fazer Upload para o ESP32

### Opção A: Via Interface Gráfica (Recomendado)

1. Na barra lateral do PlatformIO
2. Expanda **PROJECT TASKS → esp32dev**
3. Clique em **General → Upload**

### Opção B: Via Terminal

```bash
cd hardware
pio run --target upload
```

**Durante o upload:**
- O PlatformIO detectará automaticamente a porta COM
- Você verá o progresso do upload (0% → 100%)
- O ESP32 será reiniciado automaticamente após o upload

**Saída esperada:**
```
Configuring upload protocol...
AVAILABLE: cmsis-dap, esp-bridge, esp-prog, espota, esptool, iot-bus-jtag, jlink, minimodule, olimex-arm-usb-ocd, olimex-arm-usb-ocd-h, olimex-arm-usb-tiny-h, olimex-jtag-tiny, tumpa
CURRENT: upload_protocol = esptool
Looking for upload port...
Auto-detected: COM3
Uploading .pio/build/esp32dev/firmware.bin
esptool.py v4.5.1
...
Writing at 0x00010000... (100 %)
Wrote 551237 bytes (354821 compressed) at 0x00010000 in 31.2 seconds (effective 141.3 kbit/s)...
Hash of data verified.

Leaving...
Hard resetting via RTS pin...
========================= [SUCCESS] Took 35.67 seconds =========================
```

---

## Passo 6: Monitorar a Saída Serial

### Opção A: Via Interface Gráfica

1. Na barra lateral do PlatformIO
2. Expanda **PROJECT TASKS → esp32dev**
3. Clique em **General → Monitor**

### Opção B: Via Terminal

```bash
cd hardware
pio device monitor
```

**Configuração do monitor:**
- Baud rate: 115200 (configurado automaticamente)
- Para sair: Ctrl+C

**Saída esperada no boot:**
```
═══════════════════════════════════════════════════════
  Firmware ESP32 Andon - Sistema ID Visual AX
  Versão: 1.0.0
═══════════════════════════════════════════════════════

[234] BOOT: Iniciando firmware ID Visual AX v1.0.0
[456] GPIOs inicializados
[478] Watchdog Timer inicializado (30s timeout)
[501] MAC Address: AA:BB:CC:DD:EE:FF
[523] Device Name: ESP32-Andon-EEFF
[545] MQTT: Cliente configurado
[567] BOOT: Transição para WIFI_CONNECTING
[589] WIFI: Conectando a AX-CORPORATIVO...
[3421] WIFI: Conectado! IP: 192.168.10.87
[3443] WIFI: Transição para MQTT_CONNECTING
[3465] MQTT: Conectando ao broker 192.168.10.55:1883...
[3789] MQTT: Conectado ao broker!
[3812] MQTT: Status 'online' publicado
[3834] MQTT: Discovery publicado: {"mac_address":"AA:BB:CC:DD:EE:FF","device_name":"ESP32-Andon-EEFF","firmware_version":"1.0.0"}
[3901] MQTT: Subscrito em andon/led/AA:BB:CC:DD:EE:FF/command
[3923] MQTT: Transição para OPERATIONAL
```

---

## Passo 7: Testar o Dispositivo

### Teste 1: Verificar Conexão MQTT

No backend ou em um cliente MQTT (como MQTT Explorer), verifique:
- Tópico `andon/discovery` recebeu a mensagem de discovery
- Tópico `andon/status/{mac}` mostra "online"

### Teste 2: Testar Botões

1. Pressione o botão verde
2. Verifique no Serial Monitor:
   ```
   [12345] BUTTON: green pressionado → publicado andon/button/AA:BB:CC:DD:EE:FF/green
   ```
3. Repita para os botões amarelo e vermelho

### Teste 3: Testar LEDs

Publique um comando MQTT no tópico `andon/led/{mac}/command`:

```json
{"red": false, "yellow": true, "green": false}
```

Verifique:
- LED amarelo acende
- Serial Monitor mostra:
  ```
  [23456] MQTT: Mensagem recebida no tópico: andon/led/AA:BB:CC:DD:EE:FF/command
  [23478] LED: Comando aplicado - red=0 yellow=1 green=0
  ```

---

## Troubleshooting

### Problema: "Port not found" durante upload

**Solução:**
1. Verifique se o cabo USB está conectado corretamente
2. Instale o driver CP210x (link acima)
3. Tente outra porta USB
4. Reinicie o VS Code

### Problema: ESP32 não conecta ao WiFi

**Solução:**
1. Verifique SSID e senha no `config.h`
2. Certifique-se de que a rede é 2.4GHz (ESP32 não suporta 5GHz)
3. Verifique se o roteador permite novos dispositivos
4. Monitore o Serial para ver mensagens de erro

### Problema: ESP32 não conecta ao MQTT

**Solução:**
1. Verifique se o broker MQTT está rodando (`192.168.10.55:1883`)
2. Teste a conectividade: `telnet 192.168.10.55 1883`
3. Verifique firewall do servidor
4. Monitore o Serial para ver código de erro MQTT (rc=N)

### Problema: Botões não respondem

**Solução:**
1. Verifique a montagem dos botões (GPIO correto, GND conectado)
2. Para GPIO 34 e 35: adicione resistores pull-up externos (10kΩ)
3. Teste continuidade com multímetro
4. Monitore o Serial para ver se há leituras de GPIO

### Problema: LEDs não acendem

**Solução:**
1. Verifique polaridade dos LEDs (anodo no GPIO, catodo no GND)
2. Verifique resistores (220Ω em série)
3. Teste LEDs com multímetro (modo diodo)
4. Verifique se comandos MQTT estão chegando (Serial Monitor)

### Problema: Watchdog reset constante

**Solução:**
1. Verifique se há loops bloqueantes no código
2. Certifique-se de que `esp_task_wdt_reset()` é chamado no loop
3. Aumente o timeout do watchdog em `config.h` (se necessário)

---

## Atualização de Firmware

Para atualizar o firmware após mudanças no código:

1. Edite os arquivos necessários
2. **Incremente a versão** em `config.h`:
   ```cpp
   #define FIRMWARE_VERSION     "1.0.1"  // Era 1.0.0
   ```
3. Compile novamente (Passo 4)
4. Faça upload (Passo 5)
5. Verifique a nova versão no Serial Monitor

---

## Comandos Úteis

### Limpar build anterior
```bash
pio run --target clean
```

### Compilar + Upload + Monitor (tudo de uma vez)
```bash
pio run --target upload --target monitor
```

### Listar portas COM disponíveis
```bash
pio device list
```

### Ver informações do projeto
```bash
pio project config
```

---

## Referências

- [Documentação PlatformIO](https://docs.platformio.org/)
- [ESP32 Pinout Reference](https://randomnerdtutorials.com/esp32-pinout-reference-gpios/)
- [PubSubClient Library](https://github.com/knolleary/pubsubclient)
- [ArduinoJson Documentation](https://arduinojson.org/)

---

## Suporte

Para problemas ou dúvidas:
1. Verifique a seção Troubleshooting acima
2. Consulte o `README.md` principal
3. Revise os logs do Serial Monitor
4. Verifique a documentação da spec em `.kiro/specs/esp32-andon-firmware/`
