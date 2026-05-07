# 14 - Troubleshooting e Problemas Comuns

## 🔍 Guia de Diagnóstico Rápido

### Sintomas e Soluções

---

## 🔴 Problemas de Conectividade

### ESP32 não conecta ao WiFi

**Sintomas**:
- LED onboard piscando 500ms indefinidamente
- LEDs fazendo animação de onda (verde→amarelo→vermelho)
- Serial Monitor mostra "WIFI: timeout"

**Causas Possíveis**:

1. **Credenciais incorretas**
   ```cpp
   // Verificar em config.h
   #define WIFI_SSID "AX-CORPORATIVO"
   #define WIFI_PASSWORD "auto@bacia"
   ```
   - ✅ Verificar SSID (case-sensitive)
   - ✅ Verificar senha
   - ✅ Recompilar e fazer upload

2. **Rede WiFi fora de alcance**
   - ✅ Verificar sinal WiFi no local
   - ✅ Aproximar ESP32 do roteador
   - ✅ Verificar RSSI no Serial Monitor (deve ser > -70 dBm)

3. **Rede WiFi 5GHz**
   - ❌ ESP32 só suporta 2.4 GHz
   - ✅ Configurar roteador para 2.4 GHz
   - ✅ Usar SSID separado para 2.4 GHz

4. **Canal WiFi incompatível**
   - ✅ Verificar se roteador está em canal 1-11
   - ✅ Evitar canais 12-14 (não suportados em algumas regiões)

5. **Autenticação WPA3**
   - ❌ ESP32 pode ter problemas com WPA3
   - ✅ Configurar roteador para WPA2 ou WPA2/WPA3 misto

**Solução Rápida**:
```cpp
// Adicionar logs detalhados em handleWiFiConnecting()
Serial.printf("WiFi status: %d\n", WiFi.status());
Serial.printf("SSID: %s\n", WIFI_SSID);
```

**Fallback Automático**:
- Após 15 segundos, ESP32 entra em modo MESH_NODE
- Continua funcionando via mesh (se houver outros nós)

---

### ESP32 não conecta ao MQTT

**Sintomas**:
- WiFi conectado (IP obtido)
- LED onboard piscando 1000ms
- LEDs vermelho/amarelo alternando
- Serial Monitor mostra "MQTT: falha rc=X"

**Códigos de Erro MQTT**:

| Código | Significado | Solução |
|--------|-------------|---------|
| -4 | Timeout de conexão | Verificar IP do broker |
| -3 | Conexão perdida | Verificar rede |
| -2 | Falha de conexão | Verificar firewall |
| 1 | Protocolo incorreto | Atualizar PubSubClient |
| 2 | Client ID rejeitado | Verificar nome do dispositivo |
| 3 | Servidor indisponível | Verificar se broker está rodando |
| 4 | Credenciais inválidas | Verificar usuário/senha (se houver) |
| 5 | Não autorizado | Verificar ACLs do broker |

**Causas Possíveis**:

1. **Broker MQTT não está rodando**
   ```bash
   # Verificar se Mosquitto está rodando
   sudo systemctl status mosquitto
   
   # Iniciar Mosquitto
   sudo systemctl start mosquitto
   ```

2. **IP do broker incorreto**
   ```cpp
   // Verificar em config.h
   #define MQTT_BROKER "192.168.1.28"
   #define MQTT_PORT 1883
   ```
   - ✅ Pingar o IP do broker
   - ✅ Verificar se IP mudou (DHCP)

3. **Firewall bloqueando porta 1883**
   ```bash
   # Verificar se porta está aberta
   telnet 192.168.1.28 1883
   
   # Abrir porta no firewall
   sudo ufw allow 1883/tcp
   ```

4. **Buffer MQTT muito pequeno**
   ```cpp
   // Aumentar em config.h se mensagens grandes
   #define MQTT_BUFFER_SIZE 512  // Tentar 1024
   ```

**Solução Rápida**:
```bash
# Testar conexão MQTT manualmente
mosquitto_sub -h 192.168.1.28 -t "andon/#" -v
```

**Comportamento Após Max Tentativas**:
- Após 10 tentativas, ESP32 reinicia automaticamente
- Backoff exponencial: 5s → 10s → 20s → 40s → 60s

---

### Mesh não funciona

**Sintomas**:
- ESP32 entra em MESH_NODE mas não se conecta a outros nós
- Serial Monitor mostra "MESH: iniciada como NO-FOLHA"
- Nenhum nó raiz disponível

**Causas Possíveis**:

1. **Nenhum nó raiz na rede**
   - ✅ Pelo menos um ESP32 deve ter WiFi direto
   - ✅ Verificar se algum ESP32 está em OPERATIONAL

2. **Canal WiFi diferente**
   ```cpp
   // Todos os nós devem usar o mesmo canal
   #define MESH_CHANNEL 6
   ```
   - ✅ Verificar se roteador está no canal 6
   - ✅ Recompilar todos os ESP32 com mesmo canal

3. **MESH_ID ou senha diferentes**
   ```cpp
   #define MESH_ID "IDVISUAL_ANDON"
   #define MESH_PASSWORD "andon@mesh2024"
   ```
   - ✅ Todos os nós devem ter mesmo MESH_ID e senha

4. **Capacidade da mesh cheia**
   - Cada nó suporta máximo 4 filhos diretos
   - ✅ Verificar topologia da mesh
   - ✅ Adicionar mais nós raiz

**Solução Rápida**:
```cpp
// Adicionar logs detalhados em startMesh()
Serial.printf("Mesh ID: %s\n", MESH_ID);
Serial.printf("Mesh Channel: %d\n", MESH_CHANNEL);
Serial.printf("Node ID: %u\n", g_mesh.getNodeId());
```

---

## 🔘 Problemas com Botões

### Botão não responde

**Sintomas**:
- Pressionar botão não gera evento
- Serial Monitor não mostra "BUTTON: GPIO X"

**Causas Possíveis**:

1. **Conexão física solta**
   - ✅ Verificar se botão está conectado corretamente
   - ✅ Testar continuidade com multímetro
   - ✅ Verificar se fio não está partido

2. **Pino incorreto**
   ```cpp
   // Verificar em config.h
   #define BTN_VERDE 12
   #define BTN_AMARELO 13
   #define BTN_VERMELHO 32
   #define BTN_PAUSE 33
   ```
   - ✅ Verificar se botão está no pino correto

3. **Botão invertido (NO vs NC)**
   - Botões devem ser Normalmente Abertos (NO)
   - Pressionado = LOW, Solto = HIGH
   - ✅ Testar com multímetro

4. **ESP32 não está em OPERATIONAL ou MESH_NODE**
   - Botões só funcionam nesses estados
   - ✅ Verificar estado atual no Serial Monitor

**Teste de Hardware**:
```cpp
// Adicionar no loop() temporariamente
Serial.printf("BTN Verde: %d | Amarelo: %d | Vermelho: %d | Pause: %d\n",
              digitalRead(BTN_VERDE),
              digitalRead(BTN_AMARELO),
              digitalRead(BTN_VERMELHO),
              digitalRead(BTN_PAUSE));
delay(500);
```

**Resultado Esperado**:
- Botão solto: 1 (HIGH)
- Botão pressionado: 0 (LOW)

---

### Botão dispara múltiplas vezes

**Sintomas**:
- Um pressionamento gera 2-3 eventos
- Serial Monitor mostra múltiplos "BUTTON: GPIO X"

**Causas Possíveis**:

1. **Bouncing do botão**
   - Botões mecânicos geram ruído elétrico
   - ✅ Aumentar tempo de debounce
   ```cpp
   // Em config.h
   #define DEBOUNCE_MS 50UL  // Tentar 100UL
   ```

2. **Botão de má qualidade**
   - ✅ Usar botões de melhor qualidade
   - ✅ Adicionar capacitor 100nF entre GPIO e GND

3. **Interferência elétrica**
   - ✅ Usar cabos blindados
   - ✅ Manter cabos longe de fontes de ruído

**Solução Rápida**:
```cpp
// Adicionar capacitor 100nF em paralelo com botão
//
//  GPIO ──┬── Botão ── GND
//         │
//         └── 100nF ── GND
```

---

## 💡 Problemas com LEDs

### LED não acende

**Sintomas**:
- Comando MQTT recebido mas LED não acende
- Serial Monitor mostra "LED: red=true" mas LED apagado

**Causas Possíveis**:

1. **Conexão física solta**
   - ✅ Verificar se LED está conectado corretamente
   - ✅ Verificar polaridade (ânodo no GPIO, cátodo no GND)
   - ✅ Verificar resistor (220Ω)

2. **LED queimado**
   - ✅ Testar LED com bateria 3V
   - ✅ Substituir LED

3. **Pino incorreto**
   ```cpp
   // Verificar em config.h
   #define LED_VERMELHO_PIN 17
   #define LED_AMARELO_PIN 18
   #define LED_VERDE_PIN 19
   ```
   - ✅ Verificar se LED está no pino correto

4. **GPIO não configurado como OUTPUT**
   - ✅ Verificar initializeGPIOs()
   - ✅ Recompilar e fazer upload

**Teste de Hardware**:
```cpp
// Adicionar no setup() temporariamente
pinMode(LED_VERMELHO_PIN, OUTPUT);
digitalWrite(LED_VERMELHO_PIN, HIGH);
delay(1000);
digitalWrite(LED_VERMELHO_PIN, LOW);
```

---

### LED muito fraco

**Sintomas**:
- LED acende mas muito fraco
- Difícil ver em ambiente iluminado

**Causas Possíveis**:

1. **Resistor muito alto**
   - ✅ Reduzir resistor de 220Ω para 100Ω
   - ⚠️ Não usar menos de 47Ω (pode danificar GPIO)

2. **LED de baixo brilho**
   - ✅ Usar LED de alto brilho (10mm, 50mA)
   - ✅ Usar LED difuso para melhor visibilidade

3. **Tensão insuficiente**
   - ESP32 fornece 3.3V (suficiente para maioria dos LEDs)
   - ✅ Verificar se LED não requer mais tensão

**Cálculo de Resistor**:
```
Para LED vermelho (Vf = 2.0V):
R = (3.3V - 2.0V) / 0.020A = 65Ω → Usar 100Ω

Para LED verde/amarelo (Vf = 2.2V):
R = (3.3V - 2.2V) / 0.020A = 55Ω → Usar 100Ω
```

---

### LEDs piscam aleatoriamente

**Sintomas**:
- LEDs piscam sem comando MQTT
- Padrão de piscar não corresponde a nenhum estado conhecido

**Causas Possíveis**:

1. **Estado Andon GRAY (pausado)**
   - LEDs piscam juntos a ~70 BPM
   - ✅ Verificar se backend enviou estado "GRAY"
   - ✅ Normal durante pausa de fabricação

2. **Estado UNASSIGNED**
   - LED amarelo pisca rápido (200ms)
   - ✅ Dispositivo não está vinculado a uma mesa
   - ✅ Vincular no backend

3. **Erro de integração Odoo**
   - Todos os LEDs piscam em vermelho rápido (150ms) por 5s
   - ✅ Verificar logs do backend
   - ✅ Verificar integração com Odoo

4. **Estado de conectividade**
   - WIFI_CONNECTING: Onda verde→amarelo→vermelho
   - MQTT_CONNECTING: Vermelho/amarelo alternados
   - MESH_NODE: Amarelo piscando lento (1s)
   - ✅ Verificar conectividade

---

## ⚡ Problemas de Estabilidade

### Watchdog reset detectado

**Sintomas**:
- ESP32 reinicia sozinho
- Serial Monitor mostra "AVISO: Reset por watchdog detectado"

**Causas Possíveis**:

1. **Loop bloqueado**
   - Código bloqueante no loop() por mais de 60s
   - ✅ Remover delay() longos
   - ✅ Usar timers não-bloqueantes

2. **Operação demorada**
   - Download OTA muito lento
   - Scan WiFi bloqueante
   - ✅ Aumentar timeout do watchdog
   ```cpp
   #define WATCHDOG_TIMEOUT_S 120  // 2 minutos
   ```

3. **Travamento em biblioteca**
   - painlessMesh travou
   - PubSubClient travou
   - ✅ Atualizar bibliotecas
   - ✅ Verificar issues no GitHub

**Solução Rápida**:
```cpp
// Adicionar logs antes de operações demoradas
logSerial("Iniciando operação X...");
// operação demorada
logSerial("Operação X concluída");
```

---

### Heap baixo

**Sintomas**:
- Serial Monitor mostra "AVISO: Heap baixo - X bytes"
- ESP32 fica lento ou trava

**Causas Possíveis**:

1. **Vazamento de memória**
   - Alocações dinâmicas não liberadas
   - ✅ Verificar new/delete, malloc/free
   - ✅ Usar StaticJsonDocument em vez de DynamicJsonDocument

2. **Buffers muito grandes**
   ```cpp
   // Reduzir tamanhos em config.h
   #define MQTT_BUFFER_SIZE 512  // Era 1024
   ```

3. **Fragmentação de heap**
   - Muitas alocações/desalocações pequenas
   - ✅ Usar buffers estáticos quando possível
   - ✅ Reiniciar ESP32 periodicamente (ex: 1x por dia)

**Monitoramento**:
```cpp
// Adicionar no loop() temporariamente
if (millis() % 10000 == 0) {
    Serial.printf("Heap livre: %u bytes\n", ESP.getFreeHeap());
}
```

**Heap Saudável**:
- Boot: ~280 KB
- Operação: ~240 KB
- Crítico: < 10 KB

---

### ESP32 reinicia aleatoriamente

**Sintomas**:
- ESP32 reinicia sem motivo aparente
- Sem mensagem de watchdog

**Causas Possíveis**:

1. **Fonte de alimentação insuficiente**
   - ESP32 consome até 500mA (picos de WiFi)
   - ✅ Usar fonte de 5V 2A
   - ✅ Adicionar capacitor 100µF na alimentação

2. **Brownout detector**
   - Tensão cai abaixo de 2.8V
   - ✅ Verificar fonte de alimentação
   - ✅ Adicionar capacitor de desacoplamento

3. **Sobrecarga de corrente nos GPIOs**
   - LEDs sem resistor
   - ✅ Adicionar resistores limitadores
   - ✅ Usar transistores para cargas maiores

4. **Interferência elétrica**
   - Ruído na alimentação
   - ✅ Usar fonte estabilizada
   - ✅ Adicionar filtro LC

**Verificar Causa do Reset**:
```cpp
// Adicionar no setup()
esp_reset_reason_t reason = esp_reset_reason();
Serial.printf("Reset reason: %d\n", reason);
// 1 = Power-on, 3 = Software, 4 = Watchdog, 5 = Deep sleep, 6 = Brownout
```

---

## 🔄 Problemas com OTA

### OTA falha no download

**Sintomas**:
- Serial Monitor mostra "OTA: Atualização falhou"
- Progresso para em X%

**Causas Possíveis**:

1. **URL incorreta**
   - ✅ Verificar URL no comando OTA
   - ✅ Testar URL no navegador

2. **Servidor HTTP não acessível**
   - ✅ Verificar se servidor está rodando
   - ✅ Verificar firewall

3. **Arquivo .bin corrompido**
   - ✅ Recompilar firmware
   - ✅ Verificar tamanho do arquivo

4. **Timeout de download**
   - Arquivo muito grande ou rede lenta
   - ✅ Aumentar timeout (padrão: 5 minutos)

**Teste Manual**:
```bash
# Baixar firmware manualmente
curl -O http://192.168.1.28:8000/static/ota/firmware-2.4.1.bin

# Verificar tamanho
ls -lh firmware-2.4.1.bin
```

---

### OTA instala mas não boota

**Sintomas**:
- Download completo
- ESP32 reinicia
- Volta para firmware antigo (rollback)

**Causas Possíveis**:

1. **Firmware incompatível**
   - Compilado para board diferente
   - ✅ Verificar platformio.ini
   - ✅ Recompilar para esp32dev

2. **Partição OTA cheia**
   - Firmware muito grande (> 1.5 MB)
   - ✅ Reduzir tamanho do firmware
   - ✅ Desabilitar debug logs

3. **Firmware crasheia no boot**
   - Erro de inicialização
   - ✅ Testar firmware via USB primeiro
   - ✅ Verificar logs de boot

**Verificar Partições**:
```cpp
// Adicionar no setup()
const esp_partition_t* running = esp_ota_get_running_partition();
Serial.printf("Running partition: %s\n", running->label);
```

---

## 🌐 Problemas de Rede

### Latência alta

**Sintomas**:
- Botão pressionado demora para refletir no backend
- Latência > 1 segundo

**Causas Possíveis**:

1. **Muitos hops na mesh**
   - Cada hop adiciona ~50-100ms
   - ✅ Reduzir profundidade da mesh
   - ✅ Adicionar mais nós raiz

2. **Rede WiFi congestionada**
   - Muitos dispositivos no mesmo canal
   - ✅ Mudar canal do roteador
   - ✅ Usar analisador de espectro WiFi

3. **Broker MQTT sobrecarregado**
   - Muitos dispositivos publicando
   - ✅ Otimizar backend
   - ✅ Usar broker mais potente

**Medição de Latência**:
```cpp
// Adicionar timestamp no evento de botão
unsigned long pressTime = millis();
// ... publicar MQTT
// Backend deve retornar timestamp no comando LED
// Calcular: latência = tempoLED - pressTime
```

---

### Perda de pacotes

**Sintomas**:
- Alguns eventos de botão não chegam ao backend
- Alguns comandos LED não chegam ao ESP32

**Causas Possíveis**:

1. **QoS MQTT muito baixo**
   - QoS 0 não garante entrega
   - ✅ Usar QoS 1 (padrão no código)

2. **Buffer MQTT cheio**
   - Mensagens grandes sendo descartadas
   - ✅ Aumentar MQTT_BUFFER_SIZE

3. **Rede WiFi instável**
   - Sinal fraco (RSSI < -70 dBm)
   - ✅ Melhorar cobertura WiFi
   - ✅ Adicionar access points

**Monitoramento**:
```cpp
// Adicionar contador de mensagens
static uint32_t msgCount = 0;
msgCount++;
Serial.printf("Mensagem #%u enviada\n", msgCount);
```

---

## 🛠️ Ferramentas de Diagnóstico

### Serial Monitor

**Configuração**:
- Velocidade: 115200 baud
- Newline: LF ou CR+LF

**Logs Importantes**:
```
[0] BOOT: Iniciando firmware
[150] GPIO: inicializados
[250] MAC: AA:BB:CC:DD:EE:FF
[3500] WIFI: Conectado! IP=192.168.1.87 RSSI=-45dBm
[4000] MQTT: Conectado ao broker!
[4040] MQTT: Transição para OPERATIONAL
```

### MQTT Explorer

**Instalação**:
```bash
# Linux
sudo snap install mqtt-explorer

# Windows/Mac
# Baixar de: http://mqtt-explorer.com/
```

**Uso**:
1. Conectar ao broker (192.168.1.28:1883)
2. Subscrever em `andon/#`
3. Monitorar todos os tópicos
4. Publicar comandos manualmente

### Mosquitto CLI

**Subscrever**:
```bash
# Todos os tópicos
mosquitto_sub -h 192.168.1.28 -t "andon/#" -v

# Tópico específico
mosquitto_sub -h 192.168.1.28 -t "andon/button/+/green" -v
```

**Publicar**:
```bash
# Comando LED
mosquitto_pub -h 192.168.1.28 -t "andon/state/AA:BB:CC:DD:EE:FF" -m "GREEN"

# Comando OTA
mosquitto_pub -h 192.168.1.28 -t "andon/ota/trigger" -m '{
  "version": "2.4.1",
  "url": "http://192.168.1.28:8000/static/ota/firmware-2.4.1.bin",
  "size": 1234567
}'
```

### Analisador de Espectro WiFi

**Apps Recomendados**:
- **Android**: WiFi Analyzer (Farproc)
- **iOS**: AirPort Utility
- **Windows**: inSSIDer
- **Linux**: LinSSID

**O que verificar**:
- Canal menos congestionado
- Força do sinal (RSSI)
- Interferência de outras redes

---

## 📞 Quando Pedir Ajuda

Se após seguir este guia o problema persistir:

1. **Coletar informações**:
   - Logs completos do Serial Monitor
   - Versão do firmware
   - Configuração de rede (SSID, canal, etc.)
   - Topologia da mesh (quantos nós, distâncias)

2. **Reproduzir o problema**:
   - Passos exatos para reproduzir
   - Frequência (sempre, às vezes, raramente)
   - Condições (horário, carga de rede, etc.)

3. **Testar isoladamente**:
   - Testar com um único ESP32
   - Testar em rede diferente
   - Testar com firmware limpo

4. **Contatar equipe de desenvolvimento**:
   - Fornecer todas as informações acima
   - Anexar logs completos
   - Descrever o que já foi tentado

---

**Próximo**: [15_MANUTENCAO.md](15_MANUTENCAO.md) - Guia de Manutenção
