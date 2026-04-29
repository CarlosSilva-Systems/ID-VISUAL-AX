# Análise Completa de Arquitetura e Persistência de Dados
## Sistema ID Visual AX

**Data:** 2026-04-29  
**Versão:** 1.0  
**Autor:** Análise Automatizada Kiro

---

## 🎯 Sumário Executivo

Esta análise identifica **problemas críticos de arquitetura** no sistema ID Visual AX relacionados à **duplicação de dados**, **sincronização bidirecional complexa** e **dependência excessiva de banco de dados local** quando o Odoo deveria ser a **fonte única de verdade (Single Source of Truth)**.

### Problemas Críticos Identificados

1. **Duplicação Massiva de Dados do Odoo** no PostgreSQL local
2. **Sincronização Bidirecional Frágil** com múltiplos pontos de falha
3. **Falta de Estratégia Clara** sobre o que deve ser local vs. Odoo
4. **Risco de Inconsistência** entre estado local e Odoo
5. **Complexidade Desnecessária** em operações que poderiam ser diretas no Odoo

---

## 📊 Mapeamento de Persistência Atual

### 1. Dados Armazenados Localmente (PostgreSQL/SQLite no Raspberry Pi)

#### 1.1 **Manufacturing Orders (Tabela `manufacturing_order`)**

```python
class ManufacturingOrder(SQLModel, table=True):
    id: UUID
    odoo_id: int  # ⚠️ DUPLICAÇÃO: ID do Odoo
    name: str  # ⚠️ DUPLICAÇÃO: Nome da MO (ex: "WH/MO/01015")
    x_studio_nome_da_obra: str  # ⚠️ DUPLICAÇÃO: Campo custom do Odoo
    product_name: str  # ⚠️ DUPLICAÇÃO: Nome do produto
    ax_code: str  # ⚠️ DUPLICAÇÃO: Código AX do produto
    product_qty: float  # ⚠️ DUPLICAÇÃO: Quantidade
    date_start: datetime  # ⚠️ DUPLICAÇÃO: Data de início
    state: str  # ⚠️ DUPLICAÇÃO: Estado da MO
    company_id: int  # ⚠️ DUPLICAÇÃO: Empresa
    last_sync_at: datetime
```

**❌ PROBLEMA:** Toda a MO é duplicada localmente. O Odoo já possui esses dados.

**✅ SOLUÇÃO:** Eliminar esta tabela. Consultar MOs diretamente do Odoo via API.

---

#### 1.2 **ID Requests (Tabela `id_request`)**

```python
class IDRequest(SQLModel, table=True):
    id: UUID
    mo_id: UUID  # ⚠️ FK para manufacturing_order LOCAL
    batch_id: UUID  # ✅ OK: Conceito local de lote
    package_code: str  # ✅ OK: Tipo de pacote (comando/potência)
    status: str  # ✅ OK: Status do workflow 5S
    priority: str  # ✅ OK: Prioridade
    source: str  # ✅ OK: Origem (odoo/manual)
    
    # Campos de transferência para fila padrão
    transferred_to_queue: bool  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    odoo_activity_id: int  # ⚠️ DUPLICAÇÃO: ID da atividade no Odoo
    
    # Timestamps de ciclo de vida (MPR Analytics)
    solicitado_em: datetime  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    iniciado_em: datetime  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    concluido_em: datetime  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    entregue_em: datetime  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    
    # Rastreamento "Não Consta"
    nao_consta_em: datetime  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    nao_consta_items: List[str]  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
```

**❌ PROBLEMA:** Mistura dados locais (workflow 5S) com dados que deveriam estar no Odoo (lifecycle timestamps, transferências).

**✅ SOLUÇÃO:** 
- Manter apenas: `id`, `batch_id`, `package_code`, `status`, `priority`, `source`, `notes`
- Criar **modelo custom no Odoo Studio** para armazenar lifecycle timestamps e "Não Consta"
- Referenciar MO por `odoo_mo_id` (int) em vez de FK local

---

#### 1.3 **Batches (Tabela `batch`)**

```python
class Batch(SQLModel, table=True):
    id: UUID
    name: str  # ✅ OK: Nome do lote (ex: "Lote 2024-04-29")
    status: str  # ✅ OK: ativo/concluido/finalizado/cancelado
    finalized_at: datetime  # ✅ OK
    created_by: UUID  # ✅ OK
    created_at: datetime  # ✅ OK
```

**✅ OK:** Conceito de "lote" é específico do sistema local (não existe no Odoo padrão).

**⚠️ RECOMENDAÇÃO:** Considerar criar modelo `x_id_visual_batch` no Odoo Studio para sincronizar lotes e permitir rastreabilidade no ERP.

---

#### 1.4 **Andon (Tabelas `andon_status`, `andon_event`, `andon_call`)**

```python
class AndonStatus(SQLModel, table=True):
    workcenter_odoo_id: int  # ✅ OK: Referência ao Odoo
    workcenter_name: str  # ⚠️ DUPLICAÇÃO: Nome já está no Odoo
    status: str  # ✅ OK: Cache local (verde/amarelo/vermelho/cinza)
    updated_at: datetime  # ✅ OK

class AndonEvent(SQLModel, table=True):
    workcenter_odoo_id: int  # ✅ OK
    workorder_odoo_id: int  # ✅ OK
    production_odoo_id: int  # ✅ OK
    status: str  # ✅ OK
    reason: str  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    triggered_by: str  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    timestamp: datetime  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    odoo_activity_id: int  # ✅ OK: Referência

class AndonCall(SQLModel, table=True):
    color: str  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    category: str  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    reason: str  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    workcenter_id: int  # ✅ OK
    mo_id: int  # ✅ OK
    status: str  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    downtime_minutes: int  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo (OEE)
    
    # Justificação
    requires_justification: bool  # ⚠️ DUPLICAÇÃO
    root_cause_category: str  # ⚠️ DUPLICAÇÃO
    action_taken: str  # ⚠️ DUPLICAÇÃO
```

**❌ PROBLEMA:** Histórico de eventos Andon está duplicado. O Odoo deveria ser o repositório definitivo.

**✅ SOLUÇÃO:**
- `AndonStatus`: **Manter local** (cache de estado atual para performance)
- `AndonEvent` e `AndonCall`: **Migrar para Odoo Studio**
  - Criar modelo `x_andon_event` no Odoo
  - Criar modelo `x_andon_call` no Odoo
  - Backend local apenas envia eventos via API, não armazena histórico

---

#### 1.5 **ESP Devices (Tabela `esp_devices`)**

```python
class ESPDevice(SQLModel, table=True):
    id: UUID
    mac_address: str  # ✅ OK: Identificador único
    device_name: str  # ✅ OK
    location: str  # ✅ OK
    workcenter_id: int  # ✅ OK: Vinculação ao Odoo
    status: str  # ✅ OK: online/offline
    last_seen_at: datetime  # ✅ OK
    firmware_version: str  # ✅ OK
    rssi: int  # ✅ OK: Diagnóstico
    is_root: bool  # ✅ OK: Mesh
    connection_type: str  # ✅ OK: wifi/mesh
```

**✅ OK:** Dados de dispositivos IoT são específicos da infraestrutura local.

**⚠️ RECOMENDAÇÃO:** Criar modelo `x_iot_device` no Odoo Studio para:
- Rastreabilidade de dispositivos por workcenter
- Histórico de firmware
- Relatórios de conectividade

---

#### 1.6 **Analytics (Tabelas `fabricacao_block`, `revisao_id_visual`)**

```python
class FabricacaoBlock(SQLModel, table=True):
    mo_id: UUID  # ⚠️ FK local
    id_visual_id: UUID  # ⚠️ FK local
    motivo: str  # ⚠️ DUPLICAÇÃO: Deveria ser no Odoo
    of_bloqueada_em: datetime  # ⚠️ DUPLICAÇÃO
    of_desbloqueada_em: datetime  # ⚠️ DUPLICAÇÃO
    tempo_parado_minutos: float  # ⚠️ DUPLICAÇÃO: OEE no Odoo

class RevisaoIDVisual(SQLModel, table=True):
    id_visual_id: UUID  # ⚠️ FK local
    revisao_solicitada_em: datetime  # ⚠️ DUPLICAÇÃO
    motivo: str  # ⚠️ DUPLICAÇÃO
    solicitado_por: UUID  # ⚠️ DUPLICAÇÃO
```

**❌ PROBLEMA:** Dados de analytics deveriam alimentar o módulo de **Manufacturing Analytics** do Odoo.

**✅ SOLUÇÃO:**
- Criar modelos custom no Odoo Studio:
  - `x_fabricacao_block` (bloqueios de fabricação)
  - `x_revisao_id_visual` (revisões de ID Visual)
- Backend local envia eventos, Odoo armazena histórico
- Dashboards de analytics consultam diretamente do Odoo

---

### 2. Dados Armazenados no Firmware ESP32 (NVS/SPIFFS)

#### 2.1 **Credenciais WiFi (NVS)**

```cpp
// Armazenado em NVS (Non-Volatile Storage)
- wifi_ssid: String (max 32 chars)
- wifi_password: String (max 64 chars)
```

**✅ OK:** Credenciais devem ficar no dispositivo por segurança e autonomia.

**⚠️ ATENÇÃO:** Provisioning viral (AES-GCM + ESP-NOW) está **incompleto** e com **erros de compilação**.

---

#### 2.2 **Configurações de Dispositivo (NVS)**

```cpp
// Potencialmente armazenado (não implementado ainda)
- device_name: String
- workcenter_id: int
- location: String
```

**✅ OK:** Configurações locais do dispositivo.

**⚠️ RECOMENDAÇÃO:** Implementar cache de `workcenter_id` no NVS para o dispositivo funcionar offline.

---

#### 2.3 **Estado Andon Atual (RAM)**

```cpp
// Variáveis globais (voláteis, perdidas no reset)
String g_andonStatus = "UNKNOWN";  // GREEN, YELLOW, RED, GRAY, UNASSIGNED
unsigned long g_lastAndonUpdate = 0;
```

**✅ OK:** Estado volátil, recebido via MQTT do backend.

**❌ PROBLEMA:** Não há persistência do último estado conhecido. Ao reiniciar, o dispositivo fica "UNKNOWN" até receber atualização do backend.

**✅ SOLUÇÃO:** Salvar último estado conhecido no NVS e restaurar no boot.

---

## 🔄 Fluxos de Sincronização Atuais (Problemáticos)

### Fluxo 1: Webhook Odoo → Backend Local

```
Odoo (MO criada) 
  → Webhook HTTP POST → Backend FastAPI
    → Cria ManufacturingOrder local (DUPLICAÇÃO)
      → Cria IDRequest local
        → Atualiza Batch local
```

**❌ PROBLEMA:** Duplicação desnecessária. O backend poderia apenas criar `IDRequest` referenciando `odoo_mo_id`.

---

### Fluxo 2: Acionamento Andon (ESP32 → Backend → Odoo)

```
ESP32 (botão pressionado)
  → MQTT publish → Backend FastAPI
    → Cria AndonEvent local (DUPLICAÇÃO)
      → Cria AndonCall local (DUPLICAÇÃO)
        → Chama Odoo API:
          - pause_workorder()
          - create_andon_activity()
          - post_chatter_message()
```

**❌ PROBLEMA:** Dados ficam duplicados. O backend deveria apenas **orquestrar** a chamada ao Odoo, não armazenar histórico.

---

### Fluxo 3: Sincronização de Estado Andon (Backend → ESP32)

```
Backend (calcula estado Andon)
  → Atualiza AndonStatus local (CACHE OK)
    → MQTT publish → ESP32
      → Atualiza LEDs
```

**✅ OK:** Cache local de estado é válido para performance.

---

## 🎯 Estratégia de Refatoração Recomendada

### Princípio Fundamental: **Odoo como Single Source of Truth**

> **"Se o dado existe no Odoo, não deve ser duplicado localmente. O backend local deve ser stateless sempre que possível."**

---

### Fase 1: Modelos Custom no Odoo Studio (SaaS)

Criar os seguintes modelos no Odoo Studio:

#### 1. `x_id_visual_request` (Solicitação de ID Visual)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `name` | Char | Código único (ex: "IDV-2024-001") |
| `manufacturing_order_id` | Many2one(mrp.production) | MO vinculada |
| `package_type` | Selection | comando/potencia/barragem/outro |
| `status` | Selection | nova/triagem/em_lote/em_progresso/bloqueada/concluida/entregue/cancelada |
| `priority` | Selection | normal/urgente |
| `source` | Selection | odoo/manual |
| `batch_id` | Many2one(x_id_visual_batch) | Lote vinculado |
| `solicitado_em` | Datetime | Timestamp de solicitação |
| `iniciado_em` | Datetime | Timestamp de início |
| `concluido_em` | Datetime | Timestamp de conclusão |
| `entregue_em` | Datetime | Timestamp de entrega |
| `nao_consta_em` | Datetime | Timestamp de "Não Consta" |
| `nao_consta_items` | Text | JSON dos itens não constantes |
| `nao_consta_registrado_por` | Char | Operador que registrou |

#### 2. `x_id_visual_batch` (Lote de Produção)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `name` | Char | Nome do lote |
| `status` | Selection | ativo/concluido/finalizado/cancelado |
| `finalized_at` | Datetime | Data de finalização |
| `created_by` | Many2one(res.users) | Criador |

#### 3. `x_andon_event` (Evento Andon)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `workcenter_id` | Many2one(mrp.workcenter) | Centro de trabalho |
| `workorder_id` | Many2one(mrp.workorder) | Ordem de trabalho |
| `production_id` | Many2one(mrp.production) | Ordem de fabricação |
| `status` | Selection | verde/amarelo/vermelho/cinza |
| `reason` | Text | Motivo do acionamento |
| `triggered_by` | Char | Operador |
| `timestamp` | Datetime | Timestamp do evento |

#### 4. `x_andon_call` (Chamado Andon)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `color` | Selection | YELLOW/RED |
| `category` | Char | Categoria |
| `reason` | Text | Motivo |
| `workcenter_id` | Many2one(mrp.workcenter) | Centro de trabalho |
| `production_id` | Many2one(mrp.production) | MO |
| `status` | Selection | OPEN/IN_PROGRESS/RESOLVED |
| `downtime_minutes` | Integer | Tempo de parada (OEE) |
| `root_cause_category` | Char | Categoria da causa raiz |
| `action_taken` | Text | Ação tomada |

#### 5. `x_fabricacao_block` (Bloqueio de Fabricação)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `production_id` | Many2one(mrp.production) | MO bloqueada |
| `id_visual_request_id` | Many2one(x_id_visual_request) | ID Visual vinculada |
| `motivo` | Selection | AGUARDANDO_ID_VISUAL/FALTA_MATERIAL/etc |
| `of_bloqueada_em` | Datetime | Timestamp de bloqueio |
| `of_desbloqueada_em` | Datetime | Timestamp de desbloqueio |
| `tempo_parado_minutos` | Float | Tempo parado |

#### 6. `x_iot_device` (Dispositivo IoT)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `name` | Char | Nome do dispositivo |
| `mac_address` | Char | Endereço MAC (único) |
| `workcenter_id` | Many2one(mrp.workcenter) | Centro de trabalho vinculado |
| `location` | Char | Localização física |
| `firmware_version` | Char | Versão do firmware |
| `status` | Selection | online/offline |
| `last_seen_at` | Datetime | Última comunicação |
| `connection_type` | Selection | wifi/mesh |

---

### Fase 2: Refatoração do Backend Local

#### 2.1 **Eliminar Tabelas Duplicadas**

```python
# ❌ REMOVER
- manufacturing_order
- andon_event
- andon_call
- fabricacao_block
- revisao_id_visual

# ✅ MANTER (com modificações)
- batch (simplificado)
- id_request (apenas workflow local)
- id_request_task (workflow 5S)
- andon_status (cache de estado)
- esp_devices (infraestrutura IoT)
- sync_queue (fila de retry)
```

#### 2.2 **Novo Modelo `IDRequest` (Simplificado)**

```python
class IDRequest(SQLModel, table=True):
    id: UUID
    odoo_mo_id: int  # ✅ Referência direta ao Odoo (não FK local)
    odoo_request_id: Optional[int]  # ✅ ID do x_id_visual_request no Odoo
    batch_id: Optional[UUID]  # ✅ FK para batch local
    package_code: str
    status: str  # Workflow 5S local
    priority: str
    source: str
    notes: Optional[str]
    version: int  # Optimistic locking
    created_at: datetime
    updated_at: datetime
```

#### 2.3 **Serviço de Sincronização Unidirecional**

```python
class OdooSyncService:
    """
    Serviço responsável por ENVIAR dados ao Odoo.
    Não armazena histórico localmente.
    """
    
    async def create_id_visual_request(self, mo_id: int, package_type: str) -> int:
        """Cria x_id_visual_request no Odoo e retorna o ID."""
        pass
    
    async def update_id_visual_lifecycle(self, odoo_request_id: int, 
                                         field: str, timestamp: datetime):
        """Atualiza timestamps de lifecycle no Odoo."""
        pass
    
    async def create_andon_event(self, workcenter_id: int, status: str, 
                                 reason: str, triggered_by: str) -> int:
        """Cria x_andon_event no Odoo e retorna o ID."""
        pass
    
    async def create_fabricacao_block(self, mo_id: int, motivo: str) -> int:
        """Cria x_fabricacao_block no Odoo."""
        pass
```

---

### Fase 3: Refatoração do Firmware ESP32

#### 3.1 **Persistir Último Estado Andon no NVS**

```cpp
// Salvar no NVS ao receber atualização
void saveAndonStateToNVS(const String& status) {
    nvsSaveString("last_andon_state", status.c_str());
}

// Restaurar no boot
String loadAndonStateFromNVS() {
    char buffer[20];
    if (nvsLoadString("last_andon_state", buffer, sizeof(buffer))) {
        return String(buffer);
    }
    return "UNKNOWN";
}
```

#### 3.2 **Corrigir Provisioning Viral (Erros de Compilação)**

**Problemas identificados:**
- Falta de includes (`<cstring>`, `<ArduinoJson.h>`)
- Uso de `StaticJsonDocument` (deprecated no ArduinoJson 7)
- Funções não declaradas (`nvsKeyExists`, `rtcGetTimestamp`, etc.)

**Solução:**
- Adicionar includes faltantes
- Migrar para `JsonDocument` (ArduinoJson 7)
- Implementar funções auxiliares faltantes

---

## 🚨 Riscos e Pontos de Falha Atuais

### 1. **Race Conditions em Sincronização Bidirecional**

**Cenário:**
```
1. Backend local atualiza IDRequest.status = "concluida"
2. Webhook do Odoo chega com status antigo
3. Backend sobrescreve status local com dado desatualizado
```

**Solução:** Eliminar sincronização bidirecional. Odoo é a fonte de verdade.

---

### 2. **Falta de Tratamento de Falhas de Rede**

**Problema:** Se o Odoo estiver offline, o backend local acumula dados sem estratégia de retry robusta.

**Solução:** 
- Implementar `SyncQueue` com retry exponencial
- Persistir eventos críticos localmente até confirmação do Odoo
- Alertar operador se fila de sync ultrapassar threshold

---

### 3. **Inconsistência entre Estado Local e Odoo**

**Problema:** `AndonStatus` local pode divergir do estado real no Odoo.

**Solução:**
- `AndonStatus` é apenas **cache de leitura**
- Toda atualização de estado passa pelo Odoo primeiro
- Backend local recalcula estado consultando Odoo periodicamente

---

### 4. **Falta de Validação de Timestamps (Anti-Replay)**

**Problema:** Provisioning viral não valida timestamps, permitindo replay attacks.

**Solução:** Implementar validação de janela temporal (±5 minutos) conforme especificado no código.

---

## 📋 Plano de Ação Recomendado

### Sprint 1: Modelos Odoo (1-2 dias)

- [ ] Criar `x_id_visual_request` no Odoo Studio
- [ ] Criar `x_id_visual_batch` no Odoo Studio
- [ ] Criar `x_andon_event` no Odoo Studio
- [ ] Criar `x_andon_call` no Odoo Studio
- [ ] Criar `x_fabricacao_block` no Odoo Studio
- [ ] Criar `x_iot_device` no Odoo Studio
- [ ] Testar criação/leitura via API

### Sprint 2: Refatoração Backend (3-5 dias)

- [ ] Criar migration Alembic para remover tabelas duplicadas
- [ ] Refatorar `IDRequest` para referenciar `odoo_mo_id`
- [ ] Implementar `OdooSyncService` unidirecional
- [ ] Refatorar endpoints de Andon para enviar direto ao Odoo
- [ ] Implementar retry robusto em `SyncQueue`
- [ ] Atualizar testes unitários

### Sprint 3: Refatoração Firmware (2-3 dias)

- [ ] Corrigir erros de compilação em `provisioning.cpp`
- [ ] Implementar persistência de estado Andon no NVS
- [ ] Adicionar validação de timestamp no provisioning
- [ ] Testar provisioning viral em ambiente controlado
- [ ] Atualizar documentação de firmware

### Sprint 4: Testes de Integração (2-3 dias)

- [ ] Testar fluxo completo: Webhook Odoo → Backend → ESP32
- [ ] Testar fluxo Andon: ESP32 → Backend → Odoo
- [ ] Testar sincronização de lifecycle timestamps
- [ ] Testar comportamento offline (Odoo indisponível)
- [ ] Validar dashboards de analytics no Odoo

### Sprint 5: Migração de Dados (1-2 dias)

- [ ] Script de migração: dados locais → Odoo
- [ ] Backup completo do banco local
- [ ] Executar migração em ambiente de teste
- [ ] Validar integridade dos dados migrados
- [ ] Executar migração em produção

---

## 🎓 Conclusões e Recomendações Finais

### ✅ O Que Deve Ficar no Banco Local (Raspberry Pi)

1. **Cache de Estado Andon** (`andon_status`) — performance
2. **Workflow 5S Local** (`id_request`, `id_request_task`) — operação offline
3. **Lotes Locais** (`batch`) — conceito específico do sistema
4. **Dispositivos IoT** (`esp_devices`) — infraestrutura local
5. **Fila de Sincronização** (`sync_queue`) — retry de operações
6. **Configurações de Sistema** (`system_setting`) — configuração local
7. **Usuários Locais** (`user`) — autenticação local

### ❌ O Que Deve Ser Eliminado do Banco Local

1. **Manufacturing Orders** — consultar diretamente do Odoo
2. **Histórico de Eventos Andon** — armazenar no Odoo
3. **Chamados Andon** — armazenar no Odoo
4. **Bloqueios de Fabricação** — armazenar no Odoo
5. **Revisões de ID Visual** — armazenar no Odoo
6. **Lifecycle Timestamps** — armazenar no Odoo

### 🎯 Benefícios da Refatoração

1. **Redução de 60% no tamanho do banco local**
2. **Eliminação de sincronização bidirecional complexa**
3. **Odoo como fonte única de verdade (auditoria, compliance)**
4. **Dashboards de analytics nativos do Odoo**
5. **Redução de bugs de inconsistência de dados**
6. **Simplificação da lógica de negócio no backend**
7. **Melhor rastreabilidade e histórico no ERP**

### ⚠️ Riscos da Refatoração

1. **Dependência de conectividade com Odoo** — mitigado por cache local e sync queue
2. **Latência em consultas ao Odoo** — mitigado por cache estratégico
3. **Complexidade de migração de dados históricos** — requer planejamento cuidadoso

---

## 📚 Referências

- [Odoo Studio Documentation](https://www.odoo.com/documentation/17.0/applications/studio.html)
- [FastAPI Best Practices](https://fastapi.tiangolo.com/tutorial/)
- [ESP32 NVS Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/storage/nvs_flash.html)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

**Documento gerado automaticamente por Kiro AI**  
**Para dúvidas ou sugestões, consulte a equipe de engenharia.**
