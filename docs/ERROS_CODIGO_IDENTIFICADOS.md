# Erros de Código e Lógica Identificados
## Sistema ID Visual AX

**Data:** 2026-04-29  
**Versão:** 1.0  
**Severidade:** 🔴 CRÍTICA

---

## 🚨 Erros Críticos no Firmware ESP32

### 1. **Provisioning Viral Completamente Quebrado**

**Arquivo:** `hardware/src/provisioning.cpp`  
**Severidade:** 🔴 CRÍTICA  
**Status:** ❌ NÃO COMPILA

#### Erros de Compilação Identificados:

```cpp
// ERRO 1: Falta de includes
#include <cstring>      // ❌ FALTANDO: strncpy, strlen, memcpy
#include <ArduinoJson.h> // ❌ FALTANDO: JsonDocument

// ERRO 2: StaticJsonDocument deprecated (ArduinoJson 7)
StaticJsonDocument<256> doc;  // ❌ DEPRECATED
// ✅ CORRETO:
JsonDocument doc;

// ERRO 3: Funções não declaradas
nvsKeyExists("wifi_ssid")  // ❌ Função não existe
rtcGetTimestamp()          // ❌ Função não existe
encryptPayload()           // ❌ Função não existe
decryptPayload()           // ❌ Função não existe
espnowSendEncryptedPayload() // ❌ Função não existe
```

#### Correção Necessária:

```cpp
// provisioning.cpp (CORRIGIDO)
#include "provisioning.h"
#include "crypto.h"
#include "nvs_storage.h"
#include "rtc_sync.h"
#include "espnow_comm.h"
#include "config.h"
#include <cstring>       // ✅ ADICIONAR
#include <ArduinoJson.h> // ✅ ADICIONAR

// Substituir StaticJsonDocument por JsonDocument
bool serializeProvisioningPayload(const ProvisioningPayload& payload, char* json_out, size_t max_len) {
    JsonDocument doc;  // ✅ CORRETO (ArduinoJson 7)
    
    doc["ssid"] = payload.ssid;
    doc["password"] = payload.password;
    doc["timestamp"] = payload.timestamp;
    doc["device_id"] = payload.device_id;
    
    size_t len = serializeJson(doc, json_out, max_len);
    
    if (len == 0 || len > 200) {
        Serial.printf("[PROVISIONING] ERRO: JSON muito grande (%zu bytes, max 200)\n", len);
        return false;
    }
    
    return true;
}
```

---

### 2. **Falta de Persistência de Estado Andon no ESP32**

**Arquivo:** `hardware/src/main.cpp`  
**Severidade:** 🟡 MÉDIA  
**Impacto:** Dispositivo perde estado ao reiniciar

#### Problema:

```cpp
// Estado Andon é volátil (RAM)
String g_andonStatus = "UNKNOWN";  // ❌ Perdido no reset
unsigned long g_lastAndonUpdate = 0;
```

#### Solução:

```cpp
// Salvar no NVS ao receber atualização MQTT
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    // ... código existente ...
    
    if (String(topic) == stateTopic) {
        payloadStr.trim();
        payloadStr.toUpperCase();
        if (payloadStr == "GREEN" || payloadStr == "YELLOW" ||
            payloadStr == "RED"   || payloadStr == "GRAY"   ||
            payloadStr == "UNASSIGNED") {
            g_andonStatus = payloadStr;
            g_lastAndonUpdate = millis();
            
            // ✅ ADICIONAR: Salvar no NVS
            nvsSaveString("last_andon_state", payloadStr.c_str());
            
            updateAndonLEDs();
            logSerial("ANDON STATE: " + payloadStr);
        }
    }
}

// Restaurar no setup()
void setup() {
    // ... código existente ...
    
    // ✅ ADICIONAR: Restaurar estado do NVS
    char buffer[20];
    if (nvsLoadString("last_andon_state", buffer, sizeof(buffer))) {
        g_andonStatus = String(buffer);
        updateAndonLEDs();
        logSerial("ANDON STATE: restaurado do NVS -> " + g_andonStatus);
    }
}
```

---

### 3. **Falta de Validação de Timestamp (Anti-Replay)**

**Arquivo:** `hardware/src/provisioning.cpp`  
**Severidade:** 🔴 CRÍTICA (Segurança)  
**Impacto:** Vulnerável a replay attacks

#### Problema:

```cpp
// Validação de timestamp não implementada
if (!rtcValidateTimestamp(payload.timestamp, PROVISIONING_TIMESTAMP_WINDOW_S)) {
    Serial.println("[PROVISIONING] ERRO: Timestamp inválido (possível replay attack)");
    return;  // ❌ Função rtcValidateTimestamp() não existe
}
```

#### Solução:

```cpp
// rtc_sync.cpp (CRIAR ARQUIVO)
#include "rtc_sync.h"
#include <time.h>
#include <sys/time.h>

// Sincronizar RTC via NTP
bool rtcSyncNTP(const char* ntp_server, unsigned long timeout_ms) {
    configTime(0, 0, ntp_server);
    
    unsigned long start = millis();
    while (millis() - start < timeout_ms) {
        time_t now = time(nullptr);
        if (now > 1000000000) {  // Timestamp válido (após 2001)
            Serial.printf("[RTC] Sincronizado via NTP: %ld\n", now);
            return true;
        }
        delay(100);
    }
    
    Serial.println("[RTC] ERRO: Timeout ao sincronizar NTP");
    return false;
}

// Obter timestamp atual
time_t rtcGetTimestamp() {
    return time(nullptr);
}

// Validar timestamp (anti-replay)
bool rtcValidateTimestamp(time_t received_timestamp, int window_seconds) {
    time_t now = rtcGetTimestamp();
    
    // Verifica se RTC está sincronizado
    if (now < 1000000000) {
        Serial.println("[RTC] AVISO: RTC não sincronizado, aceitando timestamp");
        return true;  // Aceita se RTC não estiver sincronizado
    }
    
    // Calcula diferença absoluta
    time_t diff = (received_timestamp > now) ? 
                  (received_timestamp - now) : 
                  (now - received_timestamp);
    
    if (diff > window_seconds) {
        Serial.printf("[RTC] ERRO: Timestamp fora da janela (%ld segundos)\n", diff);
        return false;
    }
    
    return true;
}
```

---

## 🐛 Erros de Lógica no Backend

### 1. **Race Condition em Sincronização Bidirecional**

**Arquivo:** `backend/app/api/api_v1/endpoints/batches.py` (presumido)  
**Severidade:** 🔴 CRÍTICA  
**Impacto:** Perda de dados, inconsistência

#### Problema:

```python
# Webhook do Odoo atualiza MO local
@router.post("/webhook/mo_updated")
async def webhook_mo_updated(payload: dict, session: AsyncSession = Depends(get_session)):
    mo_id = payload["id"]
    
    # ❌ PROBLEMA: Sobrescreve dados locais sem verificar versão
    stmt = select(ManufacturingOrder).where(ManufacturingOrder.odoo_id == mo_id)
    result = await session.execute(stmt)
    mo = result.scalars().first()
    
    if mo:
        mo.state = payload["state"]  # ❌ Pode sobrescrever mudança local recente
        mo.product_qty = payload["product_qty"]
        await session.commit()
```

#### Solução:

```python
# ✅ SOLUÇÃO: Eliminar tabela ManufacturingOrder local
# Consultar MOs diretamente do Odoo via API

@router.get("/manufacturing-orders/{mo_id}")
async def get_manufacturing_order(
    mo_id: int,
    odoo: OdooClient = Depends(get_odoo_client)
):
    """Consulta MO diretamente do Odoo (sem cache local)."""
    mo_data = await odoo.search_read(
        "mrp.production",
        domain=[["id", "=", mo_id]],
        fields=["name", "product_id", "product_qty", "state", "date_start"],
        limit=1
    )
    
    if not mo_data:
        raise HTTPException(status_code=404, detail="MO não encontrada no Odoo")
    
    return mo_data[0]
```

---

### 2. **Falta de Retry Robusto em Operações Odoo**

**Arquivo:** `backend/app/services/odoo_client.py`  
**Severidade:** 🟡 MÉDIA  
**Impacto:** Falhas silenciosas em operações críticas

#### Problema:

```python
async def pause_workorder(self, workorder_id: int) -> dict:
    """Tenta pausar a WO via fallback encadeado."""
    for method in ["button_pending", "button_pause", "action_pause"]:
        try:
            await self.call_kw("mrp.workorder", method, args=[[workorder_id]])
            logger.info(f"pause_workorder: WO {workorder_id} paused via {method}")
            return {"ok": True, "method_used": method, "error": None}
        except Exception as e:
            logger.warning(f"pause_workorder: {method} failed: {e}")
    
    # ❌ PROBLEMA: Retorna erro mas não adiciona à fila de retry
    msg = "Nenhum método de pausa funcionou..."
    logger.error(f"pause_workorder: ALL methods failed for WO {workorder_id}")
    return {"ok": False, "method_used": None, "error": msg}
```

#### Solução:

```python
async def pause_workorder(self, workorder_id: int, session: AsyncSession) -> dict:
    """Tenta pausar a WO via fallback encadeado com retry."""
    for method in ["button_pending", "button_pause", "action_pause"]:
        try:
            await self.call_kw("mrp.workorder", method, args=[[workorder_id]])
            logger.info(f"pause_workorder: WO {workorder_id} paused via {method}")
            return {"ok": True, "method_used": method, "error": None}
        except Exception as e:
            logger.warning(f"pause_workorder: {method} failed: {e}")
    
    # ✅ ADICIONAR: Adiciona à fila de retry
    msg = "Nenhum método de pausa funcionou - adicionado à fila de retry"
    logger.error(f"pause_workorder: ALL methods failed for WO {workorder_id}")
    
    await add_to_sync_queue(
        session,
        action="pause_workorder",
        payload={"workorder_id": workorder_id}
    )
    
    return {"ok": False, "method_used": None, "error": msg, "queued": True}
```

---

### 3. **Falta de Validação de Payload em Webhooks**

**Arquivo:** `backend/app/api/api_v1/endpoints/webhook.py` (presumido)  
**Severidade:** 🔴 CRÍTICA (Segurança)  
**Impacto:** Vulnerável a injeção de dados maliciosos

#### Problema:

```python
@router.post("/webhook/odoo")
async def webhook_odoo(request: Request):
    payload = await request.json()  # ❌ Sem validação
    
    # ❌ PROBLEMA: Aceita qualquer payload sem verificar assinatura
    event_type = payload.get("event")
    if event_type == "mo.created":
        await handle_mo_created(payload["data"])
```

#### Solução:

```python
from app.core.config import settings
import hmac
import hashlib

@router.post("/webhook/odoo")
async def webhook_odoo(
    request: Request,
    x_odoo_signature: str = Header(None)
):
    """Webhook do Odoo com validação de assinatura HMAC."""
    
    # ✅ ADICIONAR: Validar assinatura HMAC
    body = await request.body()
    expected_signature = hmac.new(
        settings.ODOO_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(x_odoo_signature or "", expected_signature):
        logger.error("WEBHOOK: Assinatura inválida - possível ataque")
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    # ✅ ADICIONAR: Validar schema com Pydantic
    try:
        payload = OdooWebhookPayload.parse_raw(body)
    except ValidationError as e:
        logger.error(f"WEBHOOK: Payload inválido: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    
    # Processar evento
    if payload.event == "mo.created":
        await handle_mo_created(payload.data)
    
    return {"status": "ok"}
```

---

### 4. **Timeout Excessivo em Requisições Odoo**

**Arquivo:** `backend/app/services/odoo_client.py`  
**Severidade:** 🟡 MÉDIA  
**Impacto:** UI trava por até 15 segundos

#### Problema:

```python
class OdooClient:
    def __init__(self, url: str, db: str, ...):
        # ❌ PROBLEMA: 15s é muito tempo para UI
        self.session = httpx.AsyncClient(timeout=15.0, follow_redirects=True)
```

#### Solução:

```python
class OdooClient:
    def __init__(self, url: str, db: str, ...):
        # ✅ SOLUÇÃO: Timeout diferenciado por tipo de operação
        self.session = httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=5.0,   # 5s para conectar
                read=10.0,     # 10s para ler resposta
                write=5.0,     # 5s para enviar request
                pool=2.0       # 2s para obter conexão do pool
            ),
            follow_redirects=True
        )
    
    async def search_read_fast(self, model: str, domain: List, fields: List[str], limit: int = 100):
        """Consulta rápida com timeout reduzido (5s total)."""
        # Override timeout para operações de leitura rápida
        async with httpx.AsyncClient(timeout=5.0) as fast_client:
            # ... implementação ...
            pass
```

---

## 🔍 Erros de Lógica de Negócio

### 1. **Cálculo de `fab_code` Frágil**

**Arquivo:** `backend/app/models/manufacturing.py`  
**Severidade:** 🟡 MÉDIA  
**Impacto:** Falha silenciosa se formato de MO mudar

#### Problema:

```python
@property
def fab_code(self) -> Optional[str]:
    """
    Extrai código de fabricação do campo name.
    Exemplo: "WH/MO/01015" → "FAB01015"
    """
    if not self.name:
        return None
    
    try:
        parts = self.name.split("/")
        if len(parts) < 2:
            return None
        
        last_part = parts[-1].strip()
        
        # ❌ PROBLEMA: Assume que última parte é sempre numérica
        if not last_part.isdigit():
            return None
        
        return f"FAB{last_part}"
    except Exception:
        return None
```

#### Solução:

```python
import re

@property
def fab_code(self) -> Optional[str]:
    """
    Extrai código de fabricação do campo name com regex robusto.
    Suporta formatos: "WH/MO/01015", "MO/2024/001", "FAB-123"
    """
    if not self.name:
        return None
    
    # ✅ SOLUÇÃO: Regex robusto que captura números após última barra ou hífen
    match = re.search(r'[/-](\d+)$', self.name)
    if match:
        return f"FAB{match.group(1)}"
    
    # Fallback: se name já começa com FAB, retorna como está
    if self.name.startswith("FAB"):
        return self.name
    
    logger.warning(f"fab_code: formato não reconhecido para MO name='{self.name}'")
    return None
```

---

### 2. **Falta de Validação de Estado em Transições**

**Arquivo:** `backend/app/api/api_v1/endpoints/batches.py` (presumido)  
**Severidade:** 🟡 MÉDIA  
**Impacto:** Transições de estado inválidas

#### Problema:

```python
@router.patch("/batches/{batch_id}/finalize")
async def finalize_batch(batch_id: UUID, session: AsyncSession = Depends(get_session)):
    stmt = select(Batch).where(Batch.id == batch_id)
    result = await session.execute(stmt)
    batch = result.scalars().first()
    
    if not batch:
        raise HTTPException(status_code=404, detail="Batch não encontrado")
    
    # ❌ PROBLEMA: Não valida se batch pode ser finalizado
    batch.status = BatchStatus.FINALIZED
    batch.finalized_at = datetime.now(timezone.utc)
    await session.commit()
```

#### Solução:

```python
# Máquina de estados válida
VALID_BATCH_TRANSITIONS = {
    BatchStatus.ACTIVE: [BatchStatus.CONCLUDED, BatchStatus.CANCELED],
    BatchStatus.CONCLUDED: [BatchStatus.FINALIZED, BatchStatus.ACTIVE],  # Pode reabrir
    BatchStatus.FINALIZED: [],  # Estado final
    BatchStatus.CANCELED: []    # Estado final
}

@router.patch("/batches/{batch_id}/finalize")
async def finalize_batch(batch_id: UUID, session: AsyncSession = Depends(get_session)):
    stmt = select(Batch).where(Batch.id == batch_id)
    result = await session.execute(stmt)
    batch = result.scalars().first()
    
    if not batch:
        raise HTTPException(status_code=404, detail="Batch não encontrado")
    
    # ✅ ADICIONAR: Validar transição de estado
    if BatchStatus.FINALIZED not in VALID_BATCH_TRANSITIONS.get(batch.status, []):
        raise HTTPException(
            status_code=400,
            detail=f"Transição inválida: {batch.status} → FINALIZED"
        )
    
    batch.status = BatchStatus.FINALIZED
    batch.finalized_at = datetime.now(timezone.utc)
    await session.commit()
    
    return {"status": "ok", "batch_id": str(batch.id)}
```

---

## 📋 Checklist de Correções Prioritárias

### 🔴 Críticas (Corrigir Imediatamente)

- [ ] **Firmware:** Corrigir erros de compilação em `provisioning.cpp`
- [ ] **Firmware:** Implementar validação de timestamp (anti-replay)
- [ ] **Backend:** Adicionar validação de assinatura HMAC em webhooks
- [ ] **Backend:** Eliminar race conditions em sincronização bidirecional
- [ ] **Backend:** Implementar retry robusto em operações Odoo críticas

### 🟡 Médias (Corrigir em Sprint Atual)

- [ ] **Firmware:** Adicionar persistência de estado Andon no NVS
- [ ] **Backend:** Reduzir timeout de requisições Odoo (UI responsiva)
- [ ] **Backend:** Adicionar validação de transições de estado
- [ ] **Backend:** Melhorar regex de extração de `fab_code`

### 🟢 Baixas (Backlog)

- [ ] **Backend:** Adicionar métricas de performance (Prometheus)
- [ ] **Backend:** Implementar circuit breaker para Odoo API
- [ ] **Firmware:** Adicionar telemetria de diagnóstico (heap, uptime)
- [ ] **Firmware:** Implementar OTA rollback automático em caso de falha

---

## 🎯 Impacto Estimado das Correções

| Correção | Tempo Estimado | Impacto | Risco |
|----------|----------------|---------|-------|
| Provisioning viral | 4-6 horas | Alto | Médio |
| Validação HMAC webhooks | 2-3 horas | Alto | Baixo |
| Persistência estado Andon | 1-2 horas | Médio | Baixo |
| Retry robusto Odoo | 3-4 horas | Alto | Médio |
| Validação transições estado | 2-3 horas | Médio | Baixo |
| Timeout diferenciado | 1 hora | Médio | Baixo |

**Total Estimado (Críticas + Médias):** 13-19 horas (~2-3 dias de trabalho)

---

**Documento gerado automaticamente por Kiro AI**  
**Para dúvidas ou sugestões, consulte a equipe de engenharia.**
