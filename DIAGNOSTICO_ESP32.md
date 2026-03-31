# Diagnóstico Rápido - ESP32 Não Conecta

## Passo 1: Verificar Monitor Serial

**CRÍTICO**: Abra o Monitor Serial do ESP32 para ver o que está acontecendo.

No VS Code com PlatformIO:
1. Clique no ícone de "Serial Monitor" na barra inferior
2. Ou: `Ctrl+Shift+P` → "PlatformIO: Serial Monitor"
3. Baud Rate: 115200

**Me envie os logs que aparecem no Monitor Serial.**

## Passo 2: Verificar se Mosquitto está acessível

Execute este comando no PowerShell:

```powershell
Test-NetConnection -ComputerName 192.168.10.55 -Port 1883
```

**Resultado esperado:**
```
TcpTestSucceeded : True
```

Se der `False`, o problema é que o ESP32 não consegue acessar o Mosquitto.

## Passo 3: Verificar IP da máquina

Execute no PowerShell:

```powershell
ipconfig | Select-String -Pattern "IPv4"
```

**Verifique se `192.168.10.55` é realmente o IP da sua máquina.**

Se o IP mudou, você precisa atualizar o arquivo `hardware/include/config.h`:

```cpp
#define MQTT_BROKER "SEU_IP_AQUI"  // Trocar pelo IP correto
```

## Passo 4: Verificar se ESP32 está travado

Se o ESP32 não está mostrando nada no Monitor Serial:

1. **Pressione o botão RESET** no ESP32
2. Observe se aparecem logs no Monitor Serial
3. Se não aparecer nada, **re-compile e faça upload** do firmware

## Passo 5: Verificar logs do Mosquitto

Execute:

```powershell
docker compose logs mosquitto --tail=50 | Select-String -Pattern "ESP32"
```

**Me envie o resultado.**

## Passo 6: Teste Rápido de Conectividade

Vamos testar se o Mosquitto está funcionando:

```powershell
# Instalar cliente MQTT (se não tiver)
# Baixar de: https://mosquitto.org/download/

# Testar conexão
mosquitto_sub -h 192.168.10.55 -t "#" -v
```

Se conectar, você verá mensagens MQTT aparecendo.

## Ações Imediatas

**Se o ESP32 está travado:**
1. Pressione RESET no ESP32
2. Observe o Monitor Serial
3. Me envie os logs

**Se o IP mudou:**
1. Descubra o IP atual: `ipconfig`
2. Atualize `hardware/include/config.h`
3. Re-compile e faça upload

**Se o Mosquitto não está acessível:**
1. Verifique se o container está rodando: `docker compose ps`
2. Reinicie o Mosquitto: `docker compose restart mosquitto`
3. Verifique o firewall do Windows

## Informações que Preciso

Para te ajudar melhor, me envie:

1. **Logs do Monitor Serial do ESP32** (os últimos 50 linhas)
2. **Resultado do comando**: `Test-NetConnection -ComputerName 192.168.10.55 -Port 1883`
3. **IP da sua máquina**: `ipconfig | Select-String -Pattern "IPv4"`
4. **Status dos containers**: `docker compose ps`

Com essas informações, consigo identificar exatamente o problema.
