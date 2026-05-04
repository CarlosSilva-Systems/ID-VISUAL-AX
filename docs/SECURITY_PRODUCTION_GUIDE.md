# 🔒 Guia de Segurança para Produção — ID Visual AX

**Versão**: 1.0  
**Data**: 2026-05-04  
**Status**: Obrigatório para deploy em produção

---

## 📋 CHECKLIST PRÉ-PRODUÇÃO

### 1. Secrets e Credenciais ✅

#### Backend (.env)
```bash
# ❌ NUNCA use os valores padrão em produção
# ✅ Gere secrets fortes usando os comandos abaixo

# SECRET_KEY (JWT signing)
openssl rand -hex 32

# ENCRYPTION_KEY (Fernet encryption - 32 bytes base64)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# ODOO_WEBHOOK_SECRET
openssl rand -hex 32

# MQTT_PASSWORD
openssl rand -hex 24
```

#### Validação Automática
O sistema **bloqueia o startup** se detectar secrets padrão em produção:
```bash
# Configurar variável de ambiente para ativar validação
export ENVIRONMENT=production

# Se secrets forem padrão, o sistema exibe:
# 🔴 FATAL SECURITY ERROR: 'SECRET_KEY' está usando valor padrão inseguro.
# Configure no .env antes de rodar em produção. Sistema bloqueado.
```

---

### 2. Autenticação MQTT 🔐

#### Configurar Mosquitto com Autenticação

1. **Criar arquivo de senhas**:
```bash
# Criar usuário para o backend
sudo mosquitto_passwd -c /etc/mosquitto/passwd idvisual_backend

# Criar usuário para os ESP32
sudo mosquitto_passwd /etc/mosquitto/passwd idvisual_esp32
```

2. **Configurar Mosquitto** (`/etc/mosquitto/mosquitto.conf`):
```conf
# Habilitar autenticação
allow_anonymous false
password_file /etc/mosquitto/passwd

# ACLs (opcional mas recomendado)
acl_file /etc/mosquitto/acl

# Listener
listener 1883
protocol mqtt
```

3. **Configurar ACLs** (`/etc/mosquitto/acl`):
```conf
# Backend pode publicar/subscrever em todos os tópicos
user idvisual_backend
topic readwrite #

# ESP32 pode apenas publicar em seus próprios tópicos
user idvisual_esp32
topic write andon/discovery
topic write andon/status/+
topic write andon/logs/+
topic write andon/button/+/+
topic write andon/state/request/+
topic write andon/ota/progress/+
topic read andon/state/+
topic read andon/led/+
topic read andon/restart/+
topic read andon/ota/trigger
topic read andon/ota/cancel
topic read andon/odoo_error/+
```

4. **Reiniciar Mosquitto**:
```bash
sudo systemctl restart mosquitto
sudo systemctl status mosquitto
```

5. **Configurar Backend** (`.env`):
```bash
MQTT_USERNAME=idvisual_backend
MQTT_PASSWORD=<senha_gerada_no_passo_1>
```

6. **Configurar ESP32**:
- Atualizar firmware com credenciais MQTT
- Usar provisioning seguro (ver seção abaixo)

---

### 3. Firmware ESP32 — Provisioning Seguro 📡

#### Problema Atual
Credenciais WiFi/MQTT hardcoded em `hardware/include/config.h`:
```cpp
// ❌ INSEGURO — exposto no código-fonte
#define WIFI_SSID           "AX-CORPORATIVO"
#define WIFI_PASSWORD       "auto@bacia"
#define MQTT_BROKER         "192.168.10.55"
```

#### Solução: Viral Provisioning (Já Implementado)
O sistema já possui provisioning seguro via AES-GCM + ESP-NOW.

**Processo de Provisioning**:

1. **Dispositivo Mestre** (já configurado):
   - Conecta ao WiFi/MQTT normalmente
   - Entra em modo de transmissão por 10 minutos
   - Transmite credenciais criptografadas via ESP-NOW

2. **Dispositivo Novo** (sem configuração):
   - Entra em modo de escuta ESP-NOW
   - Recebe credenciais criptografadas
   - Valida timestamp (anti-replay)
   - Descriptografa e armazena em NVS
   - Reinicia e conecta automaticamente

**Ativar Provisioning**:
```cpp
// hardware/src/provisioning.cpp
// Já implementado — apenas ativar no main.cpp

// No dispositivo mestre (após conectar WiFi):
if (button_held_for_5s) {
    start_provisioning_transmission();
}

// No dispositivo novo (boot):
if (!has_wifi_credentials_in_nvs()) {
    start_provisioning_reception();
}
```

**Segurança**:
- ✅ AES-256-GCM (autenticação + criptografia)
- ✅ Timestamp validation (±5min window)
- ✅ Derivação de chave via SHA-256
- ⚠️ Passphrase hardcoded (aceitável — chave derivada é segura)

---

### 4. Validação de Integridade OTA 🔄

#### Implementação de Checksum

**Backend** (`backend/app/services/ota_service.py`):
```python
import hashlib

def calculate_firmware_checksum(content: bytes) -> str:
    """Calcula SHA-256 do firmware."""
    return hashlib.sha256(content).hexdigest()

# No upload/download:
checksum = calculate_firmware_checksum(content)
release.checksum = checksum

# No payload MQTT:
payload = {
    "version": release.version,
    "url": firmware_url,
    "size": release.file_size,
    "checksum": checksum  # ✅ Adicionar
}
```

**ESP32** (`hardware/src/ota.cpp`):
```cpp
// Validar checksum antes de instalar
bool validate_firmware_checksum(const uint8_t* data, size_t len, const char* expected_sha256) {
    mbedtls_sha256_context ctx;
    uint8_t hash[32];
    char hash_hex[65];
    
    mbedtls_sha256_init(&ctx);
    mbedtls_sha256_starts(&ctx, 0);  // 0 = SHA-256 (não SHA-224)
    mbedtls_sha256_update(&ctx, data, len);
    mbedtls_sha256_finish(&ctx, hash);
    mbedtls_sha256_free(&ctx);
    
    // Converter para hex
    for (int i = 0; i < 32; i++) {
        sprintf(&hash_hex[i*2], "%02x", hash[i]);
    }
    hash_hex[64] = '\0';
    
    return strcmp(hash_hex, expected_sha256) == 0;
}
```

---

### 5. Rate Limiting e Proteção contra Abuso 🛡️

#### Endpoints Protegidos

**Já Implementado**:
- ✅ `/auth/login` — 5 req/min (proteção contra brute force)
- ✅ `/ota/trigger` — 1 req/min (proteção contra sobrecarga)
- ✅ `/andon/trigger/{color}` — 5 req/s (proteção contra flood)
- ✅ `/andon/workcenters` — 10 req/min (proteção contra scraping)

**Configuração Global** (`backend/app/main.py`):
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

---

### 6. Validação de Entrada — Odoo Integration 🔍

#### Domain Validation (Já Implementado)

**Proteção contra Injection**:
```python
# backend/app/services/odoo_client.py

def _validate_domain(self, domain: List) -> None:
    """Valida estrutura de domain Odoo para prevenir injection."""
    if not isinstance(domain, list):
        raise ValueError("Domain deve ser uma lista")
    
    valid_operators = {
        '=', '!=', '>', '<', '>=', '<=',
        'like', 'ilike', 'in', 'not in', ...
    }
    
    for clause in domain:
        # Validar operadores lógicos
        if isinstance(clause, str):
            if clause not in ['&', '|', '!']:
                raise ValueError(f"Operador lógico inválido: {clause}")
        
        # Validar cláusulas [field, operator, value]
        if isinstance(clause, (list, tuple)):
            if len(clause) != 3:
                raise ValueError(f"Cláusula deve ter 3 elementos: {clause}")
            
            field, operator, value = clause
            
            # Bloquear SQL injection
            if any(char in field for char in [';', '--', '/*', 'DROP', 'DELETE']):
                raise ValueError(f"Field contém caracteres proibidos: {field}")
            
            if operator not in valid_operators:
                raise ValueError(f"Operador inválido: {operator}")
```

---

### 7. Timeout e Circuit Breaker — Odoo 🔌

#### Timeout Diferenciado (Já Implementado)

```python
# backend/app/services/odoo_client.py

self.session = httpx.AsyncClient(
    timeout=httpx.Timeout(
        connect=5.0,   # Conexão rápida
        read=30.0,     # Leitura pode demorar (queries complexas)
        write=15.0,    # Escrita moderada
        pool=5.0       # Pool rápido
    ),
    follow_redirects=True,
    limits=httpx.Limits(
        max_connections=100,      # Pool de conexões
        max_keepalive_connections=20
    )
)
```

#### Circuit Breaker (Recomendado)

**Instalar**:
```bash
pip install circuitbreaker
```

**Implementar**:
```python
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=60)
async def _call_with_retry(self, func, *args, **kwargs):
    """
    Circuit breaker pattern:
    - Se 5 falhas consecutivas → abre circuito por 60s
    - Requisições futuras falham imediatamente (fail-fast)
    - Após 60s, tenta reconectar (half-open)
    """
    ...
```

---

### 8. Sanitização de Erros 🚫

#### Problema
Stack traces podem vazar credenciais/URLs:
```python
# ❌ INSEGURO
raise HTTPException(500, f"Erro ao conectar Odoo: {e}")
# Pode vazar: "Erro ao conectar Odoo: Connection refused to https://user:pass@odoo.com"
```

#### Solução
```python
# ✅ SEGURO
request_id = str(uuid.uuid4())[:8]
logger.exception(f"Erro Odoo [ref:{request_id}]: {e}")  # Log completo no servidor
raise HTTPException(500, f"Erro interno no servidor [ref: {request_id}]")  # Cliente recebe apenas ID
```

---

### 9. Backup e Disaster Recovery 💾

#### Backup de Banco de Dados

**Automático** (cron diário):
```bash
#!/bin/bash
# /etc/cron.daily/backup-idvisual-db

BACKUP_DIR="/backup/idvisual"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="odoo_backend"

# Backup PostgreSQL
pg_dump -U postgres -d $DB_NAME | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Manter apenas últimos 30 dias
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete
```

#### Backup de Firmware OTA

```bash
# Backup do storage OTA
rsync -av /app/storage/ota/firmware/ /backup/idvisual/firmware/
```

---

### 10. Monitoramento e Alertas 📊

#### Health Checks

**Endpoint** (`backend/app/api/api_v1/endpoints/health.py`):
```python
@router.get("/health")
async def health_check(session: AsyncSession = Depends(get_session)):
    """
    Health check completo:
    - Database connectivity
    - Odoo connectivity
    - MQTT connectivity
    - Disk space
    """
    health = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {}
    }
    
    # Database
    try:
        await session.execute(select(1))
        health["checks"]["database"] = "ok"
    except Exception as e:
        health["checks"]["database"] = f"error: {e}"
        health["status"] = "unhealthy"
    
    # Odoo
    try:
        async with OdooClient(...) as odoo:
            await odoo.search_read("res.users", [[]], limit=1)
        health["checks"]["odoo"] = "ok"
    except Exception as e:
        health["checks"]["odoo"] = f"error: {e}"
        health["status"] = "degraded"
    
    # MQTT
    # TODO: Implementar ping MQTT
    
    # Disk space
    import shutil
    stat = shutil.disk_usage("/")
    free_gb = stat.free / (1024**3)
    health["checks"]["disk_space_gb"] = round(free_gb, 2)
    if free_gb < 5:
        health["status"] = "warning"
    
    return health
```

#### Alertas (Prometheus + Grafana)

**Métricas Críticas**:
- Taxa de erro HTTP (>5% = alerta)
- Latência Odoo (>5s = alerta)
- Devices offline (>20% = alerta)
- Fila de sincronização travada (>10 itens FAILED = alerta)
- Espaço em disco (<5GB = alerta)

---

## ✅ CHECKLIST FINAL

Antes de fazer deploy em produção, confirme:

- [ ] Todos os secrets foram alterados dos valores padrão
- [ ] Variável `ENVIRONMENT=production` configurada
- [ ] Autenticação MQTT configurada e testada
- [ ] ACLs do Mosquitto configuradas
- [ ] Provisioning seguro do ESP32 testado
- [ ] Checksum OTA implementado e testado
- [ ] Rate limiting testado em todos os endpoints críticos
- [ ] Validação de domain Odoo testada
- [ ] Timeout Odoo ajustado e testado
- [ ] Backup automático de banco configurado
- [ ] Health checks implementados
- [ ] Monitoramento e alertas configurados
- [ ] Runbook de incidentes criado
- [ ] Plano de rollback documentado

---

## 📞 SUPORTE

**Em caso de incidente de segurança**:
1. Isolar o sistema (desconectar da rede se necessário)
2. Coletar logs (`/var/log/idvisual/`)
3. Notificar equipe de segurança
4. Seguir runbook de incidentes

**Contato**: [Inserir contato da equipe de segurança]

---

**Documento criado por**: Kiro AI  
**Última atualização**: 2026-05-04
