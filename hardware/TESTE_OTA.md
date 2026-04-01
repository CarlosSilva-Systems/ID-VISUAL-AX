# Guia de Teste OTA - Firmware ESP32 Andon

## Visão Geral

Este documento descreve como testar a funcionalidade de atualização OTA (Over-The-Air) do firmware ESP32 Andon em ambiente de desenvolvimento.

## Pré-requisitos

1. **Backend rodando**: O backend FastAPI deve estar rodando e acessível na rede
2. **MQTT Broker**: Broker MQTT deve estar rodando (ex: Mosquitto)
3. **ESP32 conectado**: Pelo menos um ESP32 deve estar conectado ao WiFi e MQTT
4. **Firmware compilado**: Arquivo `.bin` do firmware deve estar disponível

## Preparação do Ambiente

### 1. Compilar Firmware de Teste

```bash
cd hardware
pio run
```

O arquivo `.bin` será gerado em: `.pio/build/esp32dev/firmware.bin`

### 2. Copiar Firmware para Backend

```bash
# Copiar firmware para storage do backend
cp .pio/build/esp32dev/firmware.bin ../backend/storage/ota/firmware/firmware-2.3.0.bin
```

### 3. Verificar Conectividade

Abra o monitor serial do ESP32:

```bash
pio device monitor
```

Verifique que o dispositivo está:
- ✅ Conectado ao WiFi
- ✅ Conectado ao MQTT broker
- ✅ Publicando heartbeats
- ✅ Versão atual do firmware exibida no boot

## Cenários de Teste

### Teste 1: Atualização OTA Bem-Sucedida

**Objetivo**: Validar que o ESP32 baixa, instala e reinicia com novo firmware.

**Passos**:

1. Anote a versão atual do firmware no monitor serial:
   ```
   [OTA] Versão atual do firmware: 2.2.0
   ```

2. Publique comando OTA via MQTT:
   ```bash
   mosquitto_pub -h localhost -t "andon/ota/trigger" -m '{
     "version": "2.3.0",
     "url": "http://192.168.10.55:8000/static/ota/firmware-2.3.0.bin",
     "size": 1234567
   }'
   ```

3. Observe o monitor serial:
   ```
   [OTA] Comando de atualização OTA recebido
   [OTA] Versão alvo: 2.3.0
   [OTA] Aguardando X segundos antes de iniciar download...
   [OTA] Iniciando download do firmware...
   [OTA] Download: 10% (123456 / 1234567 bytes)
   [OTA] Download: 20% (246912 / 1234567 bytes)
   ...
   [OTA] Download: 100% (1234567 / 1234567 bytes)
   [OTA] Atualização concluída com sucesso!
   [OTA] Reiniciando em 3 segundos...
   ```

4. Após reboot, verifique nova versão:
   ```
   [OTA] Versão atual do firmware: 2.3.0
   [OTA] Primeiro boot após atualização - validando...
   [OTA] Firmware validado com sucesso!
   ```

5. Verifique mensagens MQTT de progresso:
   ```bash
   mosquitto_sub -h localhost -t "andon/ota/progress/#" -v
   ```

**Resultado Esperado**:
- ✅ Firmware baixado com sucesso
- ✅ Progresso reportado a cada 10%
- ✅ ESP32 reiniciou automaticamente
- ✅ Nova versão confirmada após boot
- ✅ Firmware validado (sem rollback)

---

### Teste 2: Versão Já Instalada

**Objetivo**: Validar que ESP32 ignora comando OTA se já está na versão solicitada.

**Passos**:

1. Publique comando OTA com versão atual:
   ```bash
   mosquitto_pub -h localhost -t "andon/ota/trigger" -m '{
     "version": "2.3.0",
     "url": "http://192.168.10.55:8000/static/ota/firmware-2.3.0.bin",
     "size": 1234567
   }'
   ```

2. Observe o monitor serial:
   ```
   [OTA] Comando de atualização OTA recebido
   [OTA] Versão alvo: 2.3.0
   [OTA] Já estou na versão 2.3.0 - ignorando comando
   ```

**Resultado Esperado**:
- ✅ Comando ignorado
- ✅ Mensagem de progresso `success` publicada
- ✅ ESP32 não reiniciou

---

### Teste 3: URL Inválida

**Objetivo**: Validar tratamento de erro quando URL do firmware é inválida.

**Passos**:

1. Publique comando OTA com URL inexistente:
   ```bash
   mosquitto_pub -h localhost -t "andon/ota/trigger" -m '{
     "version": "2.4.0",
     "url": "http://192.168.10.55:8000/static/ota/firmware-inexistente.bin",
     "size": 1234567
   }'
   ```

2. Observe o monitor serial:
   ```
   [OTA] Comando de atualização OTA recebido
   [OTA] Iniciando download do firmware...
   [OTA] ERRO: Atualização falhou - HTTP error: 404
   ```

**Resultado Esperado**:
- ✅ Erro detectado
- ✅ Mensagem de progresso `failed` publicada com erro
- ✅ ESP32 não reiniciou
- ✅ Firmware anterior permanece ativo

---

### Teste 4: JSON Inválido

**Objetivo**: Validar tratamento de erro quando payload JSON é malformado.

**Passos**:

1. Publique comando OTA com JSON inválido:
   ```bash
   mosquitto_pub -h localhost -t "andon/ota/trigger" -m '{invalid json'
   ```

2. Observe o monitor serial:
   ```
   [OTA] Comando de atualização OTA recebido
   [OTA] ERRO: Falha ao parsear JSON - ...
   ```

**Resultado Esperado**:
- ✅ Erro de parsing detectado
- ✅ Mensagem de progresso `failed` publicada
- ✅ ESP32 não reiniciou

---

### Teste 5: Campos Obrigatórios Ausentes

**Objetivo**: Validar que ESP32 rejeita payload sem campos obrigatórios.

**Passos**:

1. Publique comando OTA sem campo `url`:
   ```bash
   mosquitto_pub -h localhost -t "andon/ota/trigger" -m '{
     "version": "2.4.0",
     "size": 1234567
   }'
   ```

2. Observe o monitor serial:
   ```
   [OTA] Comando de atualização OTA recebido
   [OTA] ERRO: Campos obrigatórios ausentes no payload
   ```

**Resultado Esperado**:
- ✅ Validação de campos detectou ausência
- ✅ Mensagem de progresso `failed` publicada
- ✅ ESP32 não reiniciou

---

### Teste 6: Rollback Automático (Firmware Defeituoso)

**Objetivo**: Validar que ESP32 reverte para firmware anterior se novo firmware falhar.

**Passos**:

1. Crie um firmware defeituoso que crashe no boot:
   ```cpp
   void setup() {
       // Crashar intencionalmente
       int* ptr = nullptr;
       *ptr = 42;  // Segmentation fault
   }
   ```

2. Compile e copie para backend:
   ```bash
   pio run
   cp .pio/build/esp32dev/firmware.bin ../backend/storage/ota/firmware/firmware-2.4.0-broken.bin
   ```

3. Publique comando OTA:
   ```bash
   mosquitto_pub -h localhost -t "andon/ota/trigger" -m '{
     "version": "2.4.0",
     "url": "http://192.168.10.55:8000/static/ota/firmware-2.4.0-broken.bin",
     "size": 1234567
   }'
   ```

4. Observe o monitor serial:
   ```
   [OTA] Atualização concluída com sucesso!
   [OTA] Reiniciando em 3 segundos...
   
   # ESP32 reinicia, crashe ocorre, bootloader detecta falha
   
   [BOOTLOADER] Rollback detectado - revertendo para partição anterior
   
   # ESP32 reinicia novamente com firmware anterior
   
   [OTA] Versão atual do firmware: 2.3.0
   [OTA] Firmware já validado anteriormente
   ```

**Resultado Esperado**:
- ✅ Firmware defeituoso instalado inicialmente
- ✅ Crash detectado pelo bootloader
- ✅ Rollback automático executado
- ✅ Firmware anterior restaurado
- ✅ ESP32 operacional com versão anterior

---

### Teste 7: Múltiplos Dispositivos (Propagação Mesh)

**Objetivo**: Validar que múltiplos ESP32s atualizam sem sobrecarregar servidor.

**Passos**:

1. Conecte 3+ ESP32s ao mesmo broker MQTT

2. Publique comando OTA:
   ```bash
   mosquitto_pub -h localhost -t "andon/ota/trigger" -m '{
     "version": "2.3.0",
     "url": "http://192.168.10.55:8000/static/ota/firmware-2.3.0.bin",
     "size": 1234567
   }'
   ```

3. Observe que cada ESP32 aguarda um delay aleatório diferente:
   ```
   ESP32-1: [OTA] Aguardando 15 segundos antes de iniciar download...
   ESP32-2: [OTA] Aguardando 42 segundos antes de iniciar download...
   ESP32-3: [OTA] Aguardando 8 segundos antes de iniciar download...
   ```

4. Monitore logs do backend para verificar downloads distribuídos no tempo

**Resultado Esperado**:
- ✅ Todos os ESP32s recebem comando simultaneamente
- ✅ Cada ESP32 aguarda delay aleatório (0-60s)
- ✅ Downloads distribuídos no tempo
- ✅ Servidor não sobrecarregado
- ✅ Todos os ESP32s atualizam com sucesso

---

## Monitoramento via MQTT

### Subscrever a Todos os Tópicos OTA

```bash
# Progresso de todos os dispositivos
mosquitto_sub -h localhost -t "andon/ota/progress/#" -v

# Logs de todos os dispositivos
mosquitto_sub -h localhost -t "andon/logs/#" -v

# Status de todos os dispositivos
mosquitto_sub -h localhost -t "andon/status/#" -v
```

### Formato de Mensagens de Progresso

```json
{
  "status": "downloading",  // downloading, installing, success, failed
  "progress": 45,           // 0-100
  "error": null             // null ou mensagem de erro
}
```

## Troubleshooting

### Problema: ESP32 não recebe comando OTA

**Possíveis causas**:
- ESP32 não está conectado ao MQTT
- Tópico MQTT incorreto
- QoS do MQTT incompatível

**Solução**:
1. Verificar conexão MQTT no monitor serial
2. Verificar subscrição ao tópico `andon/ota/trigger`
3. Testar com `mosquitto_sub` se mensagens estão sendo publicadas

---

### Problema: Download falha com timeout

**Possíveis causas**:
- URL do backend incorreta
- Firewall bloqueando conexão HTTP
- Arquivo .bin não existe no storage

**Solução**:
1. Verificar que backend está acessível: `curl http://192.168.10.55:8000/static/ota/firmware-2.3.0.bin`
2. Verificar que arquivo existe: `ls backend/storage/ota/firmware/`
3. Verificar logs do backend para erros HTTP

---

### Problema: ESP32 reinicia em loop após OTA

**Possíveis causas**:
- Firmware novo tem bug crítico
- Firmware incompatível com hardware
- Partição OTA corrompida

**Solução**:
1. Aguardar rollback automático (ocorre após 3-5 reinicializações)
2. Se rollback não ocorrer, fazer flash via USB:
   ```bash
   pio run --target upload
   ```

---

### Problema: Progresso não é publicado via MQTT

**Possíveis causas**:
- MQTT desconectado durante download
- Buffer MQTT insuficiente
- QoS incorreto

**Solução**:
1. Verificar que `MQTT_BUFFER_SIZE` é >= 512 bytes
2. Verificar conexão MQTT durante download
3. Aumentar `MQTT_KEEPALIVE_S` se necessário

---

## Checklist de Validação

Antes de considerar OTA pronto para produção:

- [ ] Teste 1: Atualização bem-sucedida ✅
- [ ] Teste 2: Versão já instalada ✅
- [ ] Teste 3: URL inválida ✅
- [ ] Teste 4: JSON inválido ✅
- [ ] Teste 5: Campos ausentes ✅
- [ ] Teste 6: Rollback automático ✅
- [ ] Teste 7: Múltiplos dispositivos ✅
- [ ] Progresso reportado a cada 10% ✅
- [ ] Firmware validado após boot ✅
- [ ] Logs detalhados no monitor serial ✅
- [ ] Mensagens MQTT publicadas corretamente ✅
- [ ] Delay aleatório funcionando (0-60s) ✅

## Próximos Passos

Após validação do firmware ESP32:

1. Testar integração com backend (Tasks 1-16)
2. Testar interface frontend (Tasks 9-14)
3. Executar testes end-to-end completos
4. Validar em ambiente de staging com dispositivos reais
5. Documentar processo de rollout para produção
