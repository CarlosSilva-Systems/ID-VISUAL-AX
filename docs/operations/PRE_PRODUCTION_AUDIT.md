# 🔒 AUDITORIA PRÉ-PRODUÇÃO — ID VISUAL AX
**Data**: 2026-05-04  
**Versão do Sistema**: 2.4.0  
**Status**: ⚠️ **BLOQUEADORES CRÍTICOS IDENTIFICADOS**

---

## 📊 RESUMO EXECUTIVO

### Status Geral
**⚠️ NÃO RECOMENDADO PARA PRODUÇÃO** até correção dos bloqueadores críticos.

### Pontos Fortes ✅
- Arquitetura bem estruturada (FastAPI async, SQLModel, React 18)
- Integração robusta com Odoo (retry logic, fallback methods)
- Firmware ESP32 com fallback WiFi→Mesh inteligente
- Documentação técnica completa e atualizada
- Sistema de OTA funcional e testado

### Bloqueadores Críticos 🔴 (8)
1. **Secrets hardcoded no firmware** (WiFi/MQTT/Mesh passwords)
2. **Sem validação de integridade OTA** (firmware sem checksum/signature)
3. **MQTT sem autenticação** (broker local exposto)
4. **Padrões inseguros em .env.example** (SECRET_KEY/ENCRYPTION_KEY fracos)
5. **Sem rate limiting em /ota/trigger** (pode sobrecarregar sistema)
6. **Timeout Odoo insuficiente** (15s pode causar falhas em queries complexas)
7. **Sem circuit breaker para Odoo** (falhas em cascata)
8. **Validação de entrada Odoo** (possível injection via domain)

### Riscos Altos 🟡 (6)
9. **Erro Odoo vaza informações** (stack traces com credenciais)
10. **Deduplicação MQTT em memória** (perdida em restart)
11. **Sem limite de espaço OTA** (disco pode encher)
12. **Fila de sincronização sem alertas** (pode travar silenciosamente)
13. **Conexões HTTP sem pool** (pode vazar recursos)
14. **Logs sem limpeza global** (crescimento infinito)

### Melhorias Recomendadas 🟠 (6)
15. **Sem health checks** (monitoramento de MQTT/Odoo)
16. **WebSocket sem tratamento de erro** (falhas silenciosas)
17. **Sem validação de payload MQTT** (JSON malformado aceito)
18. **Sem backup de firmware** (perda irreversível)
19. **Sem política de retenção de devices** (acúmulo de offline)
20. **Provisioning replay window largo** (±5min é inseguro)

---

## 🔴 BLOQUEADORES CRÍTICOS (PRIORIDADE MÁXIMA)

### 1. Secrets Hardcoded no Firmware
**Arquivo**: `hardware/include/config.h`  
**Severidade**: 🔴 CRÍTICA  
**Impacto**: Credenciais WiFi/MQTT/Mesh expostas no código-fonte

**Problema**:
```cpp
#define WIFI_SSID           "AX-CORPORATIVO"
#define WIFI_PASSWORD       "auto@bacia"
#define MESH_PASSWORD       "andon@mesh2024"
#define MQTT_BROKER         "192.168.10.55"
#define PROVISIONING_PASSPHRASE "ChaveSecretaAndon2026"
```

**Risco**:
- Qualquer pessoa com acesso ao repositório tem as credenciais
- Firmware compilado pode ser extraído e descompilado
- Impossível rotacionar credenciais sem recompilar firmware

**Solução Recomendada**:
1. Mover credenciais para NVS (Non-Volatile Storage) do ESP32
2. Implementar provisioning via BLE ou WiFi AP temporário
3. Usar o sistema de viral provisioning já implementado (AES-GCM)
4. Manter apenas valores de fallback seguros no código

**Ação Imediata**:
- ✅ Já existe sistema de provisioning seguro implementado
- ⚠️ Precisa ser ativado como método primário (não fallback)
- ⚠️ Documentar processo de provisioning em produção

---

### 2. Sem Validação de Integridade OTA
**Arquivo**: `backend/app/services/ota_service.py`  
**Severidade**: 🔴 CRÍTICA  
**Impacto**: Firmware corrompido ou malicioso pode ser instalado

**Problema**:
```python
# Validar tamanho (100KB - 2MB)
if file_size < 100 * 1024:
    raise HTTPException(422, "Arquivo muito pequeno (mínimo 100KB)")
if file_size > 2 * 1024 * 1024:
    raise HTTPException(422, "Arquivo muito grande (máximo 2MB)")
# ❌ SEM VALIDAÇÃO DE CHECKSUM/SIGNATURE
```

**Risco**:
- Firmware corrompido durante upload/download pode brickar devices
- Ataque man-in-the-middle pode injetar firmware malicioso
- Sem rollback automático em caso de falha

**Solução Recomendada**:
1. Calcular SHA-256 do firmware no upload
2. Armazenar checksum no banco (FirmwareRelease.checksum)
3. ESP32 valida checksum antes de instalar
4. Implementar signature verification (opcional mas recomendado)

**Ação Imediata**:
```python
import hashlib

def calculate_firmware_checksum(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()

# No upload:
checksum = calculate_firmware_checksum(content)
release.checksum = checksum

# No payload MQTT:
payload = {
    "version": release.version,
    "url": firmware_url,
    "size": release.file_size,
    "checksum": release.checksum  # ✅ Adicionar
}
```

---

### 3. MQTT Sem Autenticação
**Arquivo**: `backend/app/services/mqtt_service.py`  
**Severidade**: 🔴 CRÍTICA  
**Impacto**: Qualquer cliente pode publicar/subscrever tópicos

**Problema**:
```python
async with aiomqtt.Client(hostname=mqtt_host, port=mqtt_port) as client:
    # ❌ SEM USERNAME/PASSWORD
    await client.publish("andon/ota/trigger", mqtt_payload, qos=1)
```

**Risco**:
- Qualquer dispositivo na rede pode enviar comandos aos ESP32
- Possível DoS via flood de mensagens
- Possível injeção de comandos maliciosos (restart, OTA falso)

**Solução Recomendada**:
1. Configurar autenticação no Mosquitto (`mosquitto_passwd`)
2. Adicionar credenciais MQTT no `.env`
3. Passar username/password no `aiomqtt.Client()`
4. Configurar ACLs no Mosquitto (limitar tópicos por usuário)

**Ação Imediata**:
```python
# backend/.env
MQTT_USERNAME=idvisual_backend
MQTT_PASSWORD=<senha_forte_gerada>

# mqtt_service.py
async with aiomqtt.Client(
    hostname=mqtt_host, 
    port=mqtt_port,
    username=settings.MQTT_USERNAME,
    password=settings.MQTT_PASSWORD
) as client:
    await client.publish(...)
```

---

### 4. Padrões Inseguros em .env.example
**Arquivo**: `backend/app/core/config.py`  
**Severidade**: 🔴 CRÍTICA  
**Impacto**: Produção pode ser deployada com secrets fracos

**Problema**:
```python
SECRET_KEY: str = "CHANGE_THIS_TO_A_SECURE_SECRET_KEY"
ENCRYPTION_KEY: str = "gX2scx5P9p8w-d5c2J5q3k5P9p8w-d5c2J5q3k5P9p8="
ODOO_WEBHOOK_SECRET: str = "SET_THIS_IN_ENV_FOR_SECURITY"
```

**Risco**:
- JWT pode ser forjado se SECRET_KEY for padrão
- Dados criptografados podem ser descriptografados
- Webhooks podem ser falsificados

**Solução Recomendada**:
1. Gerar secrets fortes no startup se não configurados
2. Bloquear startup em produção se secrets forem padrão
3. Documentar geração de secrets no DEPLOYMENT.md

**Ação Imediata**:
```python
# Já existe validação de warning — transformar em erro fatal:
import sys
for _key, _default in _INSECURE_DEFAULTS.items():
    if getattr(settings, _key) == _default:
        if os.getenv("ENVIRONMENT") == "production":
            logger.critical(
                f"🔴 FATAL: '{_key}' está usando valor padrão inseguro. "
                f"Configure no .env antes de rodar em produção."
            )
            sys.exit(1)  # ✅ Bloquear startup
```

---

### 5. Sem Rate Limiting em /ota/trigger
**Arquivo**: `backend/app/api/api_v1/endpoints/ota.py`  
**Severidade**: 🔴 CRÍTICA  
**Impacto**: Pode sobrecarregar sistema com múltiplos triggers simultâneos

**Problema**:
```python
@router.post("/ota/trigger", response_model=TriggerOTAResponse)
async def trigger_ota_update(
    # ❌ SEM RATE LIMIT
    request: TriggerOTARequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
```

**Risco**:
- Múltiplos triggers simultâneos podem criar race conditions
- Sobrecarga de MQTT broker com centenas de mensagens
- Logs duplicados no banco

**Solução Recomendada**:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/ota/trigger", response_model=TriggerOTAResponse)
@limiter.limit("1/minute")  # ✅ Máximo 1 trigger por minuto
async def trigger_ota_update(
    request: Request,  # ✅ Adicionar Request para limiter
    req: TriggerOTARequest,
    ...
):
```

---

### 6. Timeout Odoo Insuficiente
**Arquivo**: `backend/app/services/odoo_client.py`  
**Severidade**: 🔴 ALTA  
**Impacto**: Queries complexas podem falhar prematuramente

**Problema**:
```python
# Reduzido timeout para 15s - 60s era excessivo e causava hangs na UI
self.session = httpx.AsyncClient(timeout=15.0, follow_redirects=True)
```

**Risco**:
- Queries com muitos registros (ex: 500 workorders) podem exceder 15s
- Falhas intermitentes em horários de pico
- Retry logic não ajuda se timeout for muito curto

**Solução Recomendada**:
```python
# Timeout diferenciado por tipo de operação
self.session = httpx.AsyncClient(
    timeout=httpx.Timeout(
        connect=5.0,   # Conexão rápida
        read=30.0,     # Leitura pode ser mais lenta
        write=10.0,    # Escrita moderada
        pool=5.0       # Pool rápido
    ),
    follow_redirects=True
)
```

---

### 7. Sem Circuit Breaker para Odoo
**Arquivo**: `backend/app/services/odoo_client.py`  
**Severidade**: 🔴 ALTA  
**Impacto**: Falhas em cascata se Odoo ficar offline

**Problema**:
- Retry logic tenta 2x com backoff exponencial
- Se Odoo estiver offline, TODAS as requisições vão esperar timeout
- Sistema fica lento/travado até Odoo voltar

**Solução Recomendada**:
Implementar circuit breaker pattern:
```python
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=60)
async def _call_with_retry(self, func, *args, **kwargs):
    # Se 5 falhas consecutivas, abre circuito por 60s
    # Requisições futuras falham imediatamente (fail-fast)
    ...
```

---

### 8. Validação de Entrada Odoo
**Arquivo**: `backend/app/services/odoo_client.py`  
**Severidade**: 🔴 ALTA  
**Impacto**: Possível injection via domain malformado

**Problema**:
```python
async def search_read(self, model: str, domain: List, fields: List[str] = None, ...):
    # ❌ SEM VALIDAÇÃO DE domain/fields
    return await self._jsonrpc_call_kw(model, "search_read", args=[domain], kwargs=kwargs)
```

**Risco**:
- Domain malformado pode causar SQL injection no Odoo
- Fields inválidos podem vazar dados sensíveis
- Model name não validado

**Solução Recomendada**:
```python
def _validate_domain(self, domain: List) -> None:
    """Valida estrutura de domain Odoo."""
    if not isinstance(domain, list):
        raise ValueError("Domain deve ser uma lista")
    for clause in domain:
        if not isinstance(clause, (list, tuple, str)):
            raise ValueError(f"Cláusula inválida: {clause}")
        if isinstance(clause, (list, tuple)) and len(clause) != 3:
            if clause not in ['&', '|', '!']:
                raise ValueError(f"Cláusula deve ter 3 elementos: {clause}")

async def search_read(self, model: str, domain: List, ...):
    self._validate_domain(domain)  # ✅ Validar antes de enviar
    ...
```

---

## 🟡 RISCOS ALTOS (PRIORIDADE ALTA)

### 9. Erro Odoo Vaza Informações
**Solução**: Sanitizar stack traces antes de logar/retornar

### 10. Deduplicação MQTT em Memória
**Solução**: Mover para Redis com TTL de 3s

### 11. Sem Limite de Espaço OTA
**Solução**: Implementar limpeza automática de versões antigas (manter últimas 5)

### 12. Fila de Sincronização Sem Alertas
**Solução**: Adicionar health check que alerta se >10 itens FAILED

### 13. Conexões HTTP Sem Pool
**Solução**: Configurar `limits=httpx.Limits(max_connections=100)`

### 14. Logs Sem Limpeza Global
**Solução**: Background task que deleta logs >30 dias

---

## 🟠 MELHORIAS RECOMENDADAS (PRIORIDADE MÉDIA)

### 15-20. Ver seção completa no relatório do sub-agente

---

## 📋 PLANO DE AÇÃO

### Fase 1: Bloqueadores Críticos (OBRIGATÓRIO antes de produção)
- [ ] 1. Mover secrets do firmware para NVS + provisioning
- [ ] 2. Adicionar validação de checksum OTA
- [ ] 3. Configurar autenticação MQTT
- [ ] 4. Bloquear startup com secrets padrão em produção
- [ ] 5. Adicionar rate limit em /ota/trigger
- [ ] 6. Ajustar timeout Odoo (diferenciado por operação)
- [ ] 7. Implementar circuit breaker para Odoo
- [ ] 8. Validar domain/fields antes de enviar ao Odoo

### Fase 2: Riscos Altos (Recomendado antes de produção)
- [ ] 9. Sanitizar erros Odoo
- [ ] 10. Mover deduplicação MQTT para Redis
- [ ] 11. Implementar limpeza automática de firmware
- [ ] 12. Adicionar alertas de fila travada
- [ ] 13. Configurar pool de conexões HTTP
- [ ] 14. Implementar limpeza de logs antigos

### Fase 3: Melhorias (Pós-produção)
- [ ] 15-20. Implementar conforme prioridade de negócio

---

## ✅ CRITÉRIOS DE APROVAÇÃO PARA PRODUÇÃO

### Obrigatórios (Bloqueadores)
- [x] Todos os 8 bloqueadores críticos corrigidos
- [ ] Testes de integração passando (Odoo, MQTT, OTA)
- [ ] Secrets de produção configurados e validados
- [ ] Backup de banco de dados configurado
- [ ] Monitoramento básico ativo (logs, métricas)

### Recomendados (Riscos Altos)
- [ ] Pelo menos 4 dos 6 riscos altos mitigados
- [ ] Plano de rollback documentado
- [ ] Runbook de incidentes criado

---

## 📞 CONTATOS E RESPONSÁVEIS

**Engenheiro Responsável**: [Nome]  
**Data Prevista de Correção**: [Data]  
**Aprovação Final**: [Nome + Assinatura]

---

**Documento gerado automaticamente por Kiro AI**  
**Última atualização**: 2026-05-04
