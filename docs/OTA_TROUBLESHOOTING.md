# Guia de Troubleshooting OTA

## Problemas Identificados e Soluções

### ❌ PROBLEMA 1: Endpoint `/ota/devices/count` retorna 404

**Sintoma:**
```
GET http://localhost:5173/api/v1/ota/devices/count 404 (Not Found)
```

**Causa:**
O endpoint existe no backend mas pode não estar sendo roteado corretamente.

**Solução:**
✅ Verificado - O router OTA está configurado corretamente com `prefix="/ota"` em `backend/app/api/api_v1/endpoints/ota.py` e incluído sem prefixo adicional em `backend/app/api/api_v1/api.py`.

**Teste:**
```bash
cd backend
python test_ota_diagnostics.py
```

---

### ❌ PROBLEMA 2: Firmware ESP32 não recebe comandos OTA

**Sintoma:**
- Dispositivos aparecem como online no sistema
- Ao disparar OTA, nada acontece nos dispositivos
- Logs do ESP32 não mostram mensagens de OTA

**Causa:**
O firmware ESP32 **NÃO estava subscrito** aos tópicos MQTT de OTA:
- `andon/ota/trigger` - Comando para iniciar atualização
- `andon/ota/cancel` - Comando para cancelar atualização

**Solução:**
✅ **CORRIGIDO** em `hardware/src/main.cpp`:
- Adicionada subscrição ao tópico `andon/ota/trigger`
- Adicionada subscrição ao tópico `andon/ota/cancel`
- Adicionado handler para `andon/ota/cancel` no callback MQTT

**Código corrigido:**
```cpp
// Em handleMQTTConnecting()
String otaTrigger = "andon/ota/trigger";
String otaCancel  = "andon/ota/cancel";
mqttClient.subscribe(otaTrigger.c_str(), 1);
mqttClient.subscribe(otaCancel.c_str(),  1);

// Em mqttCallback()
else if (String(topic) == "andon/ota/cancel") {
    logSerial("OTA: Cancel recebido via MQTT");
    publishOTAProgress("cancelled", 0, "Cancelado pelo backend");
}
```

**Teste:**
1. Compile e faça upload do firmware corrigido
2. Verifique os logs do ESP32 ao conectar ao MQTT
3. Deve aparecer: `MQTT: conectado -> OPERATIONAL`
4. Dispare uma atualização OTA pelo frontend
5. Deve aparecer: `OTA: Trigger recebido via MQTT`

---

### ⚠️ PROBLEMA 3: URL do firmware inacessível pelos ESP32

**Sintoma:**
- OTA é disparado
- ESP32 recebe o comando
- Download falha com erro de conexão

**Causa:**
O backend estava configurado com `BACKEND_HOST=localhost:8000`, mas os dispositivos ESP32 não conseguem acessar `localhost` - eles precisam do IP real do servidor.

**Solução:**
✅ **CORRIGIDO** em `backend/app/services/ota_service.py`:
- Adicionada detecção automática de `localhost` no `BACKEND_HOST`
- Se detectado, substitui pelo IP do broker MQTT (assumindo que estão no mesmo servidor)
- Adiciona warning no log para configurar corretamente

**Configuração recomendada:**
```bash
# backend/.env
BACKEND_HOST=192.168.10.55:8000  # Use o IP real do servidor, não localhost
```

**Teste:**
```bash
# Do ESP32, teste se consegue acessar o firmware:
curl http://192.168.10.55:8000/static/ota/firmware-2.4.0.bin
```

---

### ⚠️ PROBLEMA 4: Modal mostra "0 dispositivos online"

**Sintoma:**
- Dispositivos estão conectados ao MQTT
- Backend recebe heartbeats
- Modal de confirmação OTA mostra "0 dispositivos online"

**Causa:**
O endpoint `/ota/devices/count` filtra apenas por `status == DeviceStatus.online`, mas:
1. Dispositivos podem estar conectados ao MQTT mas não ter reportado status
2. O campo `status` pode não estar sendo atualizado corretamente
3. O serviço OTA já faz broadcast para todos os dispositivos cadastrados

**Solução:**
O endpoint já está correto - ele retorna:
- `total`: Total de dispositivos cadastrados
- `online`: Dispositivos com status=online
- `offline`: Dispositivos com status=offline
- `root_count`: Dispositivos raiz (WiFi direto)
- `mesh_count`: Dispositivos mesh (nós folha)

O modal foi atualizado para mostrar que o OTA é broadcast e funciona mesmo com devices offline.

**Diagnóstico:**
```bash
cd backend
python test_ota_diagnostics.py
```

Verifique:
1. Quantos dispositivos estão cadastrados
2. Qual o status de cada um
3. Se `last_seen_at` está sendo atualizado

---

## Checklist de Verificação

### Backend

- [ ] Variável `BACKEND_HOST` configurada com IP real (não localhost)
- [ ] Variável `OTA_STORAGE_PATH` configurada corretamente
- [ ] Diretório de storage existe e tem permissões corretas
- [ ] Rota estática `/static/ota/` está montada
- [ ] MQTT broker está acessível
- [ ] Endpoint `/ota/devices/count` retorna 200
- [ ] Endpoint `/ota/devices/diagnostics` retorna dados corretos

### Firmware ESP32

- [ ] Firmware compilado com as correções mais recentes
- [ ] Versão do firmware é >= 2.4.0
- [ ] ESP32 conecta ao WiFi ou mesh
- [ ] ESP32 conecta ao broker MQTT
- [ ] Logs mostram subscrição aos tópicos OTA
- [ ] ESP32 consegue acessar a URL do firmware (teste com curl)

### Frontend

- [ ] Modal de confirmação OTA abre corretamente
- [ ] Contagem de dispositivos é exibida
- [ ] Não há erros 404 no console
- [ ] Dashboard de progresso OTA funciona

---

## Comandos Úteis

### Testar endpoints OTA
```bash
cd backend
python test_ota_diagnostics.py
```

### Verificar logs do backend
```bash
cd backend
tail -f logs/app.log
```

### Verificar logs do ESP32
```bash
# Via Serial Monitor (PlatformIO)
pio device monitor

# Ou via MQTT (se configurado)
mosquitto_sub -h 192.168.10.55 -t "andon/logs/#" -v
```

### Testar conectividade do ESP32 ao firmware
```bash
# Do computador na mesma rede
curl -I http://192.168.10.55:8000/static/ota/firmware-2.4.0.bin

# Deve retornar:
# HTTP/1.1 200 OK
# content-type: application/octet-stream
```

### Verificar dispositivos no banco
```bash
cd backend
python -c "
from app.db.session import async_session_factory
from app.models.esp_device import ESPDevice
from sqlmodel import select
import asyncio

async def check():
    async with async_session_factory() as session:
        result = await session.execute(select(ESPDevice))
        devices = result.scalars().all()
        print(f'Total: {len(devices)}')
        for d in devices:
            print(f'{d.device_name}: {d.status.value} (last_seen: {d.last_seen_at})')

asyncio.run(check())
"
```

---

## Fluxo Completo de OTA

### 1. Preparação
1. Backend: Firmware .bin está em `OTA_STORAGE_PATH`
2. Backend: Registro de `FirmwareRelease` existe no banco
3. ESP32: Conectado ao MQTT e subscrito aos tópicos OTA

### 2. Trigger
1. Usuário clica em "Atualizar" no frontend
2. Frontend chama `POST /api/v1/ota/trigger`
3. Backend:
   - Cria `OTAUpdateLog` para cada dispositivo
   - Publica mensagem MQTT em `andon/ota/trigger`:
     ```json
     {
       "version": "2.4.0",
       "url": "http://192.168.10.55:8000/static/ota/firmware-2.4.0.bin",
       "size": 1234567
     }
     ```

### 3. Download (ESP32)
1. ESP32 recebe mensagem MQTT
2. Valida que não está na versão solicitada
3. Publica progresso: `andon/ota/progress/{mac}` com `status=downloading`
4. Inicia download via HTTP
5. Publica progresso a cada 10%

### 4. Instalação (ESP32)
1. Download completo
2. Publica `status=installing`
3. Valida firmware
4. Instala e marca como válido
5. Publica `status=success`
6. Reinicia

### 5. Validação (ESP32)
1. Primeiro boot após OTA
2. Marca firmware como válido (evita rollback)
3. Conecta ao MQTT
4. Envia discovery com nova versão

### 6. Confirmação (Backend)
1. Recebe heartbeat com nova versão
2. Atualiza `ESPDevice.firmware_version`
3. Marca `OTAUpdateLog` como `success`

---

## Logs Esperados

### Backend (trigger)
```
INFO: OTA: Update triggered for version 2.4.0 by user admin
INFO: OTA: MQTT trigger published for version 2.4.0
INFO: OTA: Firmware download request - firmware-2.4.0.bin from 192.168.10.10
```

### ESP32 (download)
```
[12345] OTA: ========================================
[12345] OTA: Comando de atualização OTA recebido
[12345] OTA: ========================================
[12346] OTA: Versão alvo: 2.4.0
[12346] OTA: URL: http://192.168.10.55:8000/static/ota/firmware-2.4.0.bin
[12346] OTA: Tamanho: 1234567 bytes
[12347] OTA: Versão atual: 2.3.0 -> Nova versão: 2.4.0
[12347] OTA: Iniciando processo de atualização...
[12348] OTA: Download: 10% (123456 / 1234567 bytes)
[12349] OTA: Download: 20% (246912 / 1234567 bytes)
...
[12360] OTA: ========================================
[12360] OTA: Atualização concluída com sucesso!
[12360] OTA: Reiniciando em 3 segundos...
[12360] OTA: ========================================
```

### ESP32 (primeiro boot)
```
[0] ═══════════════════════════════════════════════════════
[0]   Firmware ESP32 Andon v2.4.0 - ID Visual AX
[0]   WiFi Direto + Fallback ESP-MESH
[0] ═══════════════════════════════════════════════════════
[100] OTA: Subsistema OTA inicializado
[100] OTA: Versão atual do firmware: 2.4.0
[101] OTA: Primeiro boot após atualização - validando...
[102] OTA: Firmware validado com sucesso!
```

---

## Próximos Passos

1. ✅ Compilar e fazer upload do firmware corrigido (v2.4.0+)
2. ✅ Atualizar `BACKEND_HOST` no `.env` com IP real
3. ✅ Reiniciar o backend
4. ✅ Testar endpoints com `test_ota_diagnostics.py`
5. ✅ Testar OTA end-to-end com um dispositivo
6. ✅ Monitorar logs durante o processo
7. ✅ Validar que o dispositivo reinicia com nova versão

---

## Suporte

Se os problemas persistirem após seguir este guia:

1. Execute o diagnóstico completo:
   ```bash
   cd backend
   python test_ota_diagnostics.py > ota_diagnostics.log 2>&1
   ```

2. Capture logs do ESP32:
   ```bash
   pio device monitor > esp32_logs.log 2>&1
   ```

3. Verifique os logs do backend:
   ```bash
   cd backend
   tail -100 logs/app.log > backend_logs.log
   ```

4. Compartilhe os 3 arquivos de log para análise.
