# 📦 Instruções de Atualização OTA - ESP32 Andon

## ⚠️ IMPORTANTE: Correção Crítica Aplicada

Esta versão do firmware **corrige um bug crítico** que impedia o processamento de comandos OTA via MQTT. **Todos os dispositivos devem ser atualizados** para esta versão ou superior.

## 🔧 Compilação do Firmware

### Pré-requisitos
- PlatformIO instalado
- Arquivo `hardware/.env` configurado com credenciais WiFi e MQTT

### Compilar
```bash
cd hardware
pio run
```

### Compilar e Fazer Upload via USB
```bash
cd hardware
pio run -t upload
```

O firmware compilado estará em: `hardware/.pio/build/esp32dev/firmware.bin`

## 📤 Upload Manual para Sistema OTA

### Opção 1: Via Interface Web (Recomendado)

1. Acesse a interface de administração: `http://seu-servidor/admin/ota-settings`

2. Clique em **"Upload Manual"**

3. Preencha os campos:
   - **Arquivo**: Selecione `hardware/.pio/build/esp32dev/firmware.bin`
   - **Versão**: Digite a versão semântica (ex: `1.2.0`)
     - ⚠️ **Importante**: A versão deve ser diferente da atual nos devices
     - Formato obrigatório: `X.Y.Z` (ex: `1.2.0`, `2.0.1`)

4. Clique em **"Upload"**

5. Aguarde confirmação de upload bem-sucedido

### Opção 2: Via API (Avançado)

```bash
# Obter token de autenticação
TOKEN=$(curl -X POST http://seu-servidor/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"sua-senha"}' \
  | jq -r '.access_token')

# Upload do firmware
curl -X POST http://seu-servidor/api/v1/ota/firmware/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@hardware/.pio/build/esp32dev/firmware.bin" \
  -F "version=1.2.0"
```

## 🚀 Disparar Atualização OTA

### Via Interface Web

1. Na página **OTA Settings**, localize a versão recém-enviada

2. Clique no botão **"Disparar OTA"**

3. Revise o modal de confirmação:
   - Verifique a contagem de dispositivos online/offline
   - Confirme a versão alvo
   - Leia os avisos sobre o processo

4. Clique em **"Confirmar Atualização"**

5. Você será redirecionado para o **Dashboard de Progresso OTA**

### Via API

```bash
# Obter ID do firmware release
RELEASE_ID=$(curl -X GET http://seu-servidor/api/v1/ota/firmware/releases \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.[0].id')

# Disparar OTA
curl -X POST http://seu-servidor/api/v1/ota/trigger \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"firmware_release_id\":\"$RELEASE_ID\"}"
```

## 📊 Monitorar Progresso

### Dashboard Web
Acesse: `http://seu-servidor/admin/ota-progress`

O dashboard mostra em tempo real:
- Status de cada dispositivo (downloading, installing, success, failed)
- Progresso percentual
- Erros (se houver)
- Tempo decorrido

### Monitor Serial (Dispositivo Individual)

Conecte via USB e abra o monitor serial:
```bash
pio device monitor
```

Você verá logs detalhados:
```
[OTA] ========================================
[OTA] Comando de atualização OTA recebido
[OTA] ========================================
[OTA] Versão alvo: 1.2.0
[OTA] URL: http://192.168.10.55:8000/static/ota/firmware-1.2.0.bin
[OTA] Tamanho: 1234567 bytes
[OTA] Versão atual: 1.1.0 -> Nova versão: 1.2.0
[OTA] Iniciando processo de atualização...
[OTA] Iniciando download do firmware...
[OTA] Download: 10% (123456 / 1234567 bytes)
[OTA] Download: 20% (246912 / 1234567 bytes)
[OTA] Download: 30% (370368 / 1234567 bytes)
...
[OTA] Download: 100% (1234567 / 1234567 bytes)
[OTA] ========================================
[OTA] Atualização concluída com sucesso!
[OTA] Reiniciando em 3 segundos...
[OTA] ========================================
```

Após reiniciar:
```
[OTA] Subsistema OTA inicializado
[OTA] Versão atual do firmware: 1.2.0
[OTA] Primeiro boot após atualização - validando...
[OTA] Firmware validado com sucesso!
```

## 🔍 Troubleshooting

### Dispositivo Não Recebe OTA

**Sintoma**: Device está online mas não inicia download

**Possíveis Causas**:
1. Firmware antigo sem correção do callback MQTT
2. Device não está subscrito ao tópico `andon/ota/trigger`
3. Broker MQTT não está acessível

**Solução**:
```bash
# 1. Verificar versão do firmware no monitor serial
# Deve mostrar: [OTA] Versão atual do firmware: X.Y.Z

# 2. Verificar subscrição MQTT no monitor serial
# Deve mostrar: [MQTT] Subscrito a andon/ota/trigger

# 3. Se versão < 1.2.0, fazer upload via USB:
cd hardware
pio run -t upload
```

### Download Falha com Erro HTTP

**Sintoma**: `[OTA] ERRO: Atualização falhou - HTTP error`

**Possíveis Causas**:
1. URL do firmware inacessível
2. Arquivo não existe no storage
3. Firewall bloqueando acesso

**Solução**:
```bash
# Verificar se arquivo existe no backend
ls -la backend/static/ota/

# Testar URL manualmente
curl -I http://seu-servidor:8000/static/ota/firmware-1.2.0.bin

# Verificar configuração BACKEND_HOST no .env do backend
cat backend/.env | grep BACKEND_HOST
```

### Device Fica em Loop de Reinicialização

**Sintoma**: Device reinicia continuamente após OTA

**Causa**: Firmware corrompido ou incompatível

**Solução**:
```bash
# ESP32 faz rollback automático após 3 falhas de boot
# Aguarde ~30 segundos para rollback automático

# Se não funcionar, fazer upload via USB do firmware estável:
cd hardware
pio run -t upload
```

### Progresso Travado em X%

**Sintoma**: Download para em determinada porcentagem

**Possíveis Causas**:
1. Conexão WiFi instável
2. Heap baixo no ESP32
3. Timeout de rede

**Solução**:
```bash
# Verificar heap no monitor serial
# Deve ter > 50KB livre durante OTA

# Cancelar OTA via interface e tentar novamente
# Ou aguardar timeout automático (10 minutos)
```

## 📋 Checklist de Atualização em Produção

- [ ] Compilar firmware com versão incrementada
- [ ] Testar em 1 dispositivo de desenvolvimento primeiro
- [ ] Verificar que device reinicia corretamente após OTA
- [ ] Fazer backup do firmware atual (`.pio/build/esp32dev/firmware.bin`)
- [ ] Upload do novo firmware para o sistema OTA
- [ ] Verificar que arquivo foi salvo corretamente no storage
- [ ] Disparar OTA para 1-2 devices de teste em produção
- [ ] Monitorar progresso no dashboard
- [ ] Aguardar confirmação de sucesso (devices reiniciam e reconectam)
- [ ] Disparar OTA para todos os devices restantes
- [ ] Monitorar dashboard até 100% de conclusão
- [ ] Verificar logs de erro para devices que falharam
- [ ] Fazer upload via USB em devices que falharam (se necessário)

## 🔐 Segurança

- ✅ Firmware é validado pelo ESP32 após download (assinatura digital)
- ✅ Rollback automático se firmware falhar no boot (3 tentativas)
- ✅ Validação de tamanho no backend (100KB - 2MB)
- ✅ Validação de versão semântica
- ✅ Path traversal protection
- ✅ Autenticação obrigatória para upload e trigger

## 📚 Referências

- [Documentação Completa da Correção OTA](../docs/FIX_OTA_DEVICES_NOT_FOUND.md)
- [Resumo Executivo](../docs/RESUMO_CORRECAO_OTA.md)
- [Guia de Compilação](./GUIA_COMPILACAO.md)
- [Arquitetura do Sistema](./ARQUITETURA.md)

---

**Última Atualização**: 2026-04-30  
**Versão Mínima Recomendada**: 1.2.0
