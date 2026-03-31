# Troubleshooting - ESP32 Andon

## Problema: ESP32 não conecta ou desconecta frequentemente

### 1. Verificar Monitor Serial

Abra o Monitor Serial no VS Code (PlatformIO) ou Arduino IDE para ver os logs do ESP32:

```
Baud Rate: 115200
```

**Logs esperados:**
```
[timestamp] BOOT: Iniciando firmware ID Visual AX v1.0.0
[timestamp] GPIOs inicializados
[timestamp] Watchdog Timer inicializado (30s timeout)
[timestamp] MAC Address: 24:DC:C3:A1:77:14
[timestamp] Device Name: ESP32-Andon-7714
[timestamp] MQTT: Cliente configurado
[timestamp] BOOT: Transição para WIFI_CONNECTING
[timestamp] WIFI: Conectando a AX-CORPORATIVO...
[timestamp] WIFI: Conectado! IP: 192.168.10.72
[timestamp] WIFI: Transição para MQTT_CONNECTING
[timestamp] MQTT: Conectando ao broker 192.168.10.55:1883...
[timestamp] MQTT: Conectado ao broker!
[timestamp] MQTT: Status 'online' publicado
[timestamp] MQTT: Discovery publicado: {...}
[timestamp] MQTT: Subscrito em andon/led/24:DC:C3:A1:77:14/command
[timestamp] MQTT: Transição para OPERATIONAL
```

### 2. Problemas Comuns

#### A. ESP32 trava em WIFI_CONNECTING
**Sintomas:**
- Logs mostram "WIFI: Conectando a..." mas nunca conecta
- LED onboard piscando a cada 500ms

**Soluções:**
1. Verificar se o SSID e senha estão corretos em `hardware/include/config.h`
2. Verificar se o ESP32 está no alcance do WiFi
3. Verificar se a rede WiFi está funcionando

#### B. ESP32 trava em MQTT_CONNECTING
**Sintomas:**
- WiFi conecta mas MQTT falha
- LED onboard piscando a cada 1000ms
- Logs mostram "MQTT: Falha na conexão, rc=-2"

**Soluções:**
1. Verificar se o IP do broker MQTT está correto em `hardware/include/config.h`
2. Verificar se o Mosquitto está rodando: `docker compose ps`
3. Verificar se a porta 1883 está acessível: `telnet 192.168.10.55 1883`
4. Verificar logs do Mosquitto: `docker compose logs mosquitto --tail=50`

**Códigos de erro MQTT:**
- `rc=-2`: Broker não acessível (IP errado ou firewall bloqueando)
- `rc=-4`: Credenciais inválidas (não aplicável, estamos usando anonymous)
- `rc=5`: Não autorizado

#### C. ESP32 desconecta após alguns minutos
**Sintomas:**
- Conecta com sucesso mas desconecta depois
- Logs do Mosquitto mostram "exceeded timeout"

**Causas possíveis:**
1. **Watchdog Timer**: ESP32 travou e foi resetado
   - Verificar se há algum código bloqueante no loop
   - Verificar se `esp_task_wdt_reset()` está sendo chamado

2. **WiFi instável**: Sinal fraco ou interferência
   - Aproximar ESP32 do roteador
   - Verificar qualidade do sinal WiFi

3. **Heap baixo**: Memória insuficiente
   - Verificar logs: "AVISO: Heap baixo"
   - Reduzir `MQTT_BUFFER_SIZE` em `config.h`

### 3. Comandos de Diagnóstico

#### Verificar se Mosquitto está acessível da rede local
```bash
# Windows (PowerShell)
Test-NetConnection -ComputerName 192.168.10.55 -Port 1883

# Linux/Mac
nc -zv 192.168.10.55 1883
```

#### Verificar logs do Mosquitto
```bash
docker compose logs mosquitto --tail=100 | grep "ESP32-Andon"
```

#### Verificar logs do backend
```bash
docker compose logs api --tail=100 | grep "MQTT"
```

#### Reiniciar Mosquitto
```bash
docker compose restart mosquitto
```

### 4. Reset do ESP32

Se o ESP32 estiver travado, você pode:

1. **Reset via botão**: Pressionar o botão RESET físico no ESP32
2. **Reset via código**: Adicionar `ESP.restart()` no código
3. **Re-upload do firmware**: Compilar e fazer upload novamente

### 5. Verificar Configuração de Rede

#### IP do Mosquitto
O ESP32 deve usar o IP da máquina host na rede local, NÃO o IP do container Docker.

**Verificar IP da máquina:**
```bash
# Windows
ipconfig

# Linux/Mac
ifconfig
```

Atualizar `MQTT_BROKER` em `hardware/include/config.h` com o IP correto.

### 6. Logs Detalhados

Para debug mais detalhado, você pode adicionar mais logs no código:

```cpp
// No loop principal
void loop() {
    static unsigned long lastLog = 0;
    if (millis() - lastLog > 10000) {
        logSerial("LOOP: Heap livre: " + String(ESP.getFreeHeap()));
        logSerial("LOOP: WiFi status: " + String(WiFi.status()));
        logSerial("LOOP: MQTT connected: " + String(mqttClient.connected()));
        lastLog = millis();
    }
    
    // ... resto do código
}
```

### 7. Teste de Conectividade MQTT

Você pode testar a conexão MQTT usando um cliente MQTT externo:

```bash
# Instalar mosquitto_pub/sub (Windows)
# Baixar de: https://mosquitto.org/download/

# Testar publicação
mosquitto_pub -h 192.168.10.55 -t "test/topic" -m "hello"

# Testar subscrição
mosquitto_sub -h 192.168.10.55 -t "#" -v
```

### 8. Problemas Conhecidos

#### Problema: "exceeded timeout" no Mosquitto
**Causa**: ESP32 não está enviando PINGREQ (keep-alive)
**Solução**: Verificar se `mqttClient.loop()` está sendo chamado no loop principal

#### Problema: ESP32 reinicia constantemente
**Causa**: Watchdog Timer expirando
**Solução**: Verificar se há código bloqueante (delays longos, loops infinitos)

#### Problema: Botões não funcionam
**Causa**: Dispositivo não vinculado a uma mesa
**Solução**: Vincular o ESP32 a uma mesa no painel Andon antes de testar os botões

### 9. Contato e Suporte

Se o problema persistir:
1. Copie os logs completos do Monitor Serial
2. Copie os logs do Mosquitto: `docker compose logs mosquitto --tail=200`
3. Copie os logs do backend: `docker compose logs api --tail=200 | grep "MQTT"`
4. Descreva o comportamento observado
