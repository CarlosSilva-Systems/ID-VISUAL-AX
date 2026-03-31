# Instalação e Configuração do Mosquitto MQTT Broker

## Problema Identificado

O ESP32 está tentando conectar ao broker MQTT em `192.168.10.55:1883`, mas não há nenhum broker MQTT rodando nesse endereço.

**Erro no ESP32:**
```
[8193] MQTT: Falha na conexão, rc=-2, tentando novamente em 5s
```

**rc=-2** = `MQTT_CONNECT_FAILED` - O broker não está acessível.

---

## Solução: Instalar Mosquitto

### Opção 1: Instalar via Chocolatey (Recomendado no Windows)

```powershell
# Instalar Chocolatey (se ainda não tiver)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Instalar Mosquitto
choco install mosquitto -y
```

### Opção 2: Download Manual

1. Baixe o instalador: https://mosquitto.org/download/
2. Execute o instalador
3. Mosquitto será instalado em `C:\Program Files\mosquitto\`

---

## Configuração do Mosquitto

### 1. Criar arquivo de configuração

Crie o arquivo `C:\Program Files\mosquitto\mosquitto.conf` com o seguinte conteúdo:

```conf
# Porta padrão MQTT
listener 1883

# Permitir conexões anônimas (sem autenticação)
# ATENÇÃO: Use apenas em ambiente de desenvolvimento/teste
allow_anonymous true

# Bind em todas as interfaces (0.0.0.0) para aceitar conexões da rede local
bind_address 0.0.0.0

# Logs
log_dest file C:/Program Files/mosquitto/mosquitto.log
log_type all
```

### 2. Iniciar o serviço Mosquitto

#### Via Serviços do Windows (Recomendado)

1. Pressione `Win + R`, digite `services.msc` e pressione Enter
2. Procure por "Mosquitto Broker"
3. Clique com botão direito → **Iniciar**
4. Clique com botão direito → **Propriedades** → Tipo de inicialização: **Automático**

#### Via Linha de Comando (Alternativa)

```powershell
# Iniciar Mosquitto manualmente
cd "C:\Program Files\mosquitto"
.\mosquitto.exe -c mosquitto.conf -v
```

---

## Verificar se o Mosquitto está rodando

```powershell
# Verificar se a porta 1883 está escutando
netstat -an | Select-String "1883"
```

**Saída esperada:**
```
TCP    0.0.0.0:1883           0.0.0.0:0              LISTENING
```

---

## Testar a conexão MQTT

### Usando mosquitto_sub (cliente de teste)

```powershell
# Subscrever ao tópico de discovery
cd "C:\Program Files\mosquitto"
.\mosquitto_sub.exe -h 192.168.10.55 -t "andon/#" -v
```

Se funcionar, você verá as mensagens MQTT quando o ESP32 conectar.

---

## Atualizar configuração do ESP32 (se necessário)

Se o IP `192.168.10.55` não for o IP correto da sua máquina, atualize em `hardware/include/config.h`:

```cpp
#define MQTT_BROKER "192.168.10.55"  // Trocar pelo IP correto
```

Para descobrir seu IP:
```powershell
ipconfig
```

Procure por "Endereço IPv4" na interface de rede ativa.

---

## Configurar Firewall do Windows

O Windows Firewall pode bloquear a porta 1883. Adicione uma regra:

```powershell
# Executar como Administrador
New-NetFirewallRule -DisplayName "Mosquitto MQTT" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow
```

Ou via interface gráfica:
1. Painel de Controle → Firewall do Windows → Configurações Avançadas
2. Regras de Entrada → Nova Regra
3. Tipo: Porta → TCP → Porta específica: 1883
4. Ação: Permitir conexão
5. Nome: "Mosquitto MQTT"

---

## Verificar logs do Mosquitto

```powershell
Get-Content "C:\Program Files\mosquitto\mosquitto.log" -Tail 50
```

Você deve ver mensagens como:
```
1234567890: New connection from 192.168.10.72 on port 1883.
1234567890: New client connected from 192.168.10.72 as ESP32-Andon-7714
```

---

## Próximos Passos

Após instalar e iniciar o Mosquitto:

1. Reinicie o ESP32 (pressione o botão RESET)
2. Monitore o Serial do ESP32
3. Você deve ver:
   ```
   [5177] MQTT: Conectando ao broker 192.168.10.55:1883...
   [5234] MQTT: Conectado ao broker!
   [5256] MQTT: Status 'online' publicado
   [5278] MQTT: Discovery publicado
   ```

4. O LED onboard deve parar de piscar e ficar **aceso fixo** (estado OPERATIONAL)

---

## Troubleshooting

### Mosquitto não inicia

- Verifique se a porta 1883 não está em uso por outro processo
- Verifique o arquivo de log em `C:\Program Files\mosquitto\mosquitto.log`
- Tente rodar manualmente: `mosquitto.exe -c mosquitto.conf -v`

### ESP32 ainda não conecta (rc=-2)

- Verifique se o IP `192.168.10.55` está correto (use `ipconfig`)
- Verifique se o Firewall está bloqueando a porta 1883
- Teste a conexão com `mosquitto_sub` primeiro
- Verifique se ESP32 e PC estão na mesma rede

### Backend Python não recebe mensagens

- Verifique se o backend está rodando
- Verifique as variáveis de ambiente `MQTT_BROKER_HOST` e `MQTT_BROKER_PORT` no `.env`
- O backend deve conectar ao mesmo broker que o ESP32

---

## Configuração de Produção (Segurança)

⚠️ **IMPORTANTE**: A configuração acima usa `allow_anonymous true`, que é **insegura** para produção.

Para produção, configure autenticação:

```conf
# mosquitto.conf (produção)
listener 1883
allow_anonymous false
password_file C:/Program Files/mosquitto/passwd
```

Criar arquivo de senhas:
```powershell
cd "C:\Program Files\mosquitto"
.\mosquitto_passwd.exe -c passwd esp32_user
# Digite a senha quando solicitado
```

Atualizar ESP32 para usar autenticação (modificar `main.cpp`):
```cpp
mqttClient.connect(clientId.c_str(), "esp32_user", "senha_aqui", ...);
```
