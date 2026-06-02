# Plano de Migração para Odoo Studio
## Modelos Custom para ID Visual AX

**Data:** 2026-04-29  
**Versão:** 1.0  
**Objetivo:** Migrar dados do banco local para modelos custom no Odoo SaaS

---

## 🎯 Visão Geral

Este documento detalha o processo de criação de modelos custom no Odoo Studio (SaaS) para eliminar a duplicação de dados entre o banco local (Raspberry Pi) e o Odoo ERP.

### Princípio Fundamental

> **"Odoo é a fonte única de verdade (Single Source of Truth). O backend local deve ser stateless sempre que possível."**

---

## 📋 Modelos Custom a Criar no Odoo Studio

### 1. `x_id_visual_request` — Solicitação de ID Visual

**Descrição:** Rastreia o ciclo de vida completo de uma solicitação de ID Visual, desde a criação até a entrega.

#### Campos

| Nome Técnico | Label | Tipo | Obrigatório | Descrição |
|--------------|-------|------|-------------|-----------|
| `name` | Código | Char | ✅ | Código único (ex: "IDV-2024-001") |
| `manufacturing_order_id` | Ordem de Fabricação | Many2one(mrp.production) | ✅ | MO vinculada |
| `package_type` | Tipo de Pacote | Selection | ✅ | comando / potencia / barragem / outro |
| `status` | Status | Selection | ✅ | nova / triagem / em_lote / em_progresso / bloqueada / concluida / entregue / cancelada |
| `priority` | Prioridade | Selection | ✅ | normal / urgente |
| `source` | Origem | Selection | ✅ | odoo / manual |
| `batch_id` | Lote | Many2one(x_id_visual_batch) | ❌ | Lote vinculado |
| `requester_name` | Solicitante | Char | ❌ | Nome do solicitante |
| `notes` | Observações | Text | ❌ | Notas adicionais |
| `solicitado_em` | Solicitado Em | Datetime | ❌ | Timestamp de solicitação |
| `iniciado_em` | Iniciado Em | Datetime | ❌ | Timestamp de início |
| `concluido_em` | Concluído Em | Datetime | ❌ | Timestamp de conclusão |
| `entregue_em` | Entregue Em | Datetime | ❌ | Timestamp de entrega |
| `aprovado_em` | Aprovado Em | Datetime | ❌ | Timestamp de aprovação |
| `nao_consta_em` | Não Consta Em | Datetime | ❌ | Timestamp de "Não Consta" |
| `nao_consta_items` | Itens Não Constantes | Text | ❌ | JSON dos itens (ex: ["WAGO_210_804"]) |
| `nao_consta_registrado_por` | Registrado Por | Char | ❌ | Operador que registrou |
| `transferred_to_queue` | Transferido para Fila | Boolean | ❌ | Se foi transferido para fila padrão |
| `transferred_at` | Transferido Em | Datetime | ❌ | Timestamp de transferência |
| `odoo_activity_id` | ID da Atividade | Integer | ❌ | ID da mail.activity criada |
| `transfer_note` | Nota de Transferência | Text | ❌ | Nota da transferência |

#### Regras de Negócio

- **Sequência automática:** `name` deve ser gerado automaticamente (ex: "IDV-2024-001")
- **Validação:** `manufacturing_order_id` deve estar em estado válido (não cancelado)
- **Computed field:** `tempo_total_horas` = `entregue_em` - `solicitado_em` (em horas)
- **Computed field:** `tempo_producao_horas` = `concluido_em` - `iniciado_em` (em horas)

#### Views

- **Tree View:** Mostrar `name`, `manufacturing_order_id`, `package_type`, `status`, `priority`, `solicitado_em`
- **Form View:** Agrupado em abas:
  - **Geral:** Dados principais
  - **Lifecycle:** Timestamps de ciclo de vida
  - **Não Consta:** Campos de rastreamento de "Não Consta"
  - **Transferência:** Campos de transferência para fila padrão
- **Kanban View:** Agrupado por `status`
- **Calendar View:** Por `solicitado_em`
- **Pivot View:** Para analytics (tempo médio por tipo de pacote, etc.)

---

### 2. `x_id_visual_batch` — Lote de Produção

**Descrição:** Agrupa múltiplas solicitações de ID Visual para processamento em lote.

#### Campos

| Nome Técnico | Label | Tipo | Obrigatório | Descrição |
|--------------|-------|------|-------------|-----------|
| `name` | Nome do Lote | Char | ✅ | Nome do lote (ex: "Lote 2024-04-29") |
| `status` | Status | Selection | ✅ | ativo / concluido / finalizado / cancelado |
| `request_ids` | Solicitações | One2many(x_id_visual_request, batch_id) | ❌ | Solicitações no lote |
| `finalized_at` | Finalizado Em | Datetime | ❌ | Data de finalização |
| `created_by` | Criado Por | Many2one(res.users) | ❌ | Usuário criador |
| `request_count` | Quantidade de Solicitações | Integer | ❌ | Computed: len(request_ids) |

#### Regras de Negócio

- **Sequência automática:** `name` pode ser gerado automaticamente ou manual
- **Validação:** Não permitir finalizar lote com solicitações em aberto
- **Computed field:** `request_count` = contagem de `request_ids`

#### Views

- **Tree View:** Mostrar `name`, `status`, `request_count`, `created_by`, `create_date`
- **Form View:** 
  - **Geral:** Dados principais
  - **Solicitações:** Lista de solicitações (One2many)
- **Kanban View:** Agrupado por `status`

---

### 3. `x_andon_event` — Evento Andon

**Descrição:** Histórico imutável de cada acionamento do sistema Andon.

#### Campos

| Nome Técnico | Label | Tipo | Obrigatório | Descrição |
|--------------|-------|------|-------------|-----------|
| `name` | Código | Char | ✅ | Código único (ex: "ANDON-2024-001") |
| `workcenter_id` | Centro de Trabalho | Many2one(mrp.workcenter) | ✅ | Centro de trabalho |
| `workorder_id` | Ordem de Trabalho | Many2one(mrp.workorder) | ❌ | Ordem de trabalho |
| `production_id` | Ordem de Fabricação | Many2one(mrp.production) | ❌ | Ordem de fabricação |
| `status` | Status | Selection | ✅ | verde / amarelo / vermelho / cinza |
| `reason` | Motivo | Text | ❌ | Motivo do acionamento |
| `triggered_by` | Acionado Por | Char | ✅ | Operador que acionou |
| `timestamp` | Timestamp | Datetime | ✅ | Data/hora do evento |
| `odoo_picking_id` | ID do Picking | Integer | ❌ | ID do stock.picking criado |
| `odoo_activity_id` | ID da Atividade | Integer | ❌ | ID da mail.activity criada |
| `pause_ok` | Pausa OK | Boolean | ❌ | Se a pausa foi bem-sucedida |
| `pause_method` | Método de Pausa | Char | ❌ | Método usado para pausar |

#### Regras de Negócio

- **Sequência automática:** `name` deve ser gerado automaticamente
- **Imutável:** Registros não podem ser editados após criação (apenas leitura)
- **Validação:** `timestamp` não pode ser futuro

#### Views

- **Tree View:** Mostrar `name`, `workcenter_id`, `status`, `triggered_by`, `timestamp`
- **Form View:** Somente leitura
- **Graph View:** Eventos por status ao longo do tempo
- **Pivot View:** Para analytics (eventos por workcenter, por turno, etc.)

---

### 4. `x_andon_call` — Chamado Andon

**Descrição:** Chamados estruturados do sistema Andon (amarelo/vermelho) com rastreamento de resolução.

#### Campos

| Nome Técnico | Label | Tipo | Obrigatório | Descrição |
|--------------|-------|------|-------------|-----------|
| `name` | Código | Char | ✅ | Código único (ex: "CALL-2024-001") |
| `color` | Cor | Selection | ✅ | YELLOW / RED |
| `category` | Categoria | Char | ✅ | Categoria do chamado |
| `reason` | Motivo | Text | ✅ | Motivo do chamado |
| `description` | Descrição | Text | ❌ | Descrição detalhada |
| `workcenter_id` | Centro de Trabalho | Many2one(mrp.workcenter) | ✅ | Centro de trabalho |
| `production_id` | Ordem de Fabricação | Many2one(mrp.production) | ❌ | MO vinculada |
| `status` | Status | Selection | ✅ | OPEN / IN_PROGRESS / RESOLVED |
| `triggered_by` | Acionado Por | Char | ✅ | Operador que acionou |
| `assigned_team` | Equipe Responsável | Char | ❌ | Equipe atribuída |
| `resolved_note` | Nota de Resolução | Text | ❌ | Nota da resolução |
| `is_stop` | É Parada | Boolean | ❌ | Se causou parada de produção |
| `downtime_minutes` | Tempo de Parada (min) | Integer | ❌ | Tempo de parada em minutos (OEE) |
| `requires_justification` | Requer Justificativa | Boolean | ❌ | Se requer justificativa |
| `justified_at` | Justificado Em | Datetime | ❌ | Timestamp de justificativa |
| `justified_by` | Justificado Por | Char | ❌ | Quem justificou |
| `root_cause_category` | Categoria da Causa Raiz | Char | ❌ | Categoria da causa raiz |
| `root_cause_detail` | Detalhe da Causa Raiz | Text | ❌ | Detalhe da causa raiz |
| `action_taken` | Ação Tomada | Text | ❌ | Ação corretiva tomada |

#### Regras de Negócio

- **Sequência automática:** `name` deve ser gerado automaticamente
- **Validação:** Se `is_stop` = True, `downtime_minutes` é obrigatório
- **Validação:** Se `requires_justification` = True, campos de justificativa são obrigatórios ao resolver
- **Computed field:** `resolution_time_minutes` = `write_date` - `create_date` (em minutos)

#### Views

- **Tree View:** Mostrar `name`, `color`, `workcenter_id`, `status`, `downtime_minutes`, `create_date`
- **Form View:**
  - **Geral:** Dados principais
  - **Resolução:** Campos de resolução
  - **Justificativa:** Campos de justificativa (visível se `requires_justification`)
- **Kanban View:** Agrupado por `status`, colorido por `color`
- **Graph View:** Chamados por cor ao longo do tempo
- **Pivot View:** Para OEE (downtime por workcenter, por turno, etc.)

---

### 5. `x_fabricacao_block` — Bloqueio de Fabricação

**Descrição:** Rastreia bloqueios de ordens de fabricação e tempo de parada.

#### Campos

| Nome Técnico | Label | Tipo | Obrigatório | Descrição |
|--------------|-------|------|-------------|-----------|
| `name` | Código | Char | ✅ | Código único (ex: "BLOCK-2024-001") |
| `production_id` | Ordem de Fabricação | Many2one(mrp.production) | ✅ | MO bloqueada |
| `id_visual_request_id` | Solicitação ID Visual | Many2one(x_id_visual_request) | ❌ | ID Visual vinculada |
| `motivo` | Motivo | Selection | ✅ | AGUARDANDO_ID_VISUAL / FALTA_MATERIAL / PROBLEMA_QUALIDADE / MANUTENCAO / OUTRO |
| `of_bloqueada_em` | Bloqueada Em | Datetime | ✅ | Timestamp de bloqueio |
| `of_desbloqueada_em` | Desbloqueada Em | Datetime | ❌ | Timestamp de desbloqueio |
| `tempo_parado_minutos` | Tempo Parado (min) | Float | ❌ | Computed: diferença em minutos |

#### Regras de Negócio

- **Sequência automática:** `name` deve ser gerado automaticamente
- **Validação:** `of_desbloqueada_em` deve ser posterior a `of_bloqueada_em`
- **Computed field:** `tempo_parado_minutos` = `of_desbloqueada_em` - `of_bloqueada_em` (em minutos)

#### Views

- **Tree View:** Mostrar `name`, `production_id`, `motivo`, `of_bloqueada_em`, `tempo_parado_minutos`
- **Form View:** Dados principais
- **Graph View:** Bloqueios por motivo ao longo do tempo
- **Pivot View:** Tempo parado por motivo, por produto, etc.

---

### 6. `x_revisao_id_visual` — Revisão de ID Visual

**Descrição:** Rastreia solicitações de revisão de IDs Visuais.

#### Campos

| Nome Técnico | Label | Tipo | Obrigatório | Descrição |
|--------------|-------|------|-------------|-----------|
| `name` | Código | Char | ✅ | Código único (ex: "REV-2024-001") |
| `id_visual_request_id` | Solicitação ID Visual | Many2one(x_id_visual_request) | ✅ | ID Visual a revisar |
| `revisao_solicitada_em` | Solicitada Em | Datetime | ✅ | Timestamp da solicitação |
| `motivo` | Motivo | Selection | ✅ | INFORMACAO_INCORRETA / FALTA_COMPONENTE / MUDANCA_ESPECIFICACAO / ERRO_DIAGRAMACAO / OUTRO |
| `solicitado_por` | Solicitado Por | Many2one(res.users) | ❌ | Usuário solicitante |
| `detalhes` | Detalhes | Text | ❌ | Detalhes da revisão |

#### Regras de Negócio

- **Sequência automática:** `name` deve ser gerado automaticamente
- **Validação:** `id_visual_request_id` deve estar em estado válido (não cancelado)

#### Views

- **Tree View:** Mostrar `name`, `id_visual_request_id`, `motivo`, `revisao_solicitada_em`
- **Form View:** Dados principais
- **Graph View:** Revisões por motivo ao longo do tempo

---

### 7. `x_iot_device` — Dispositivo IoT

**Descrição:** Rastreia dispositivos ESP32 Andon e seu estado de conectividade.

#### Campos

| Nome Técnico | Label | Tipo | Obrigatório | Descrição |
|--------------|-------|------|-------------|-----------|
| `name` | Nome do Dispositivo | Char | ✅ | Nome do dispositivo (ex: "ESP32-Andon-A1B2") |
| `mac_address` | Endereço MAC | Char | ✅ | Endereço MAC (único) |
| `workcenter_id` | Centro de Trabalho | Many2one(mrp.workcenter) | ❌ | Centro de trabalho vinculado |
| `location` | Localização | Char | ❌ | Localização física |
| `firmware_version` | Versão do Firmware | Char | ❌ | Versão do firmware |
| `status` | Status | Selection | ✅ | online / offline |
| `last_seen_at` | Última Comunicação | Datetime | ❌ | Última vez que comunicou |
| `connection_type` | Tipo de Conexão | Selection | ❌ | wifi / mesh |
| `rssi` | RSSI | Integer | ❌ | Força do sinal WiFi |
| `is_root` | É Raiz | Boolean | ❌ | Se é nó raiz da mesh |
| `mesh_node_count` | Nós na Mesh | Integer | ❌ | Quantidade de nós na mesh |
| `ip_address` | Endereço IP | Char | ❌ | Endereço IP |
| `uptime_seconds` | Uptime (s) | Integer | ❌ | Tempo ligado em segundos |
| `notes` | Observações | Text | ❌ | Notas adicionais |

#### Regras de Negócio

- **Validação:** `mac_address` deve ser único
- **Computed field:** `uptime_formatted` = formatação legível de `uptime_seconds`
- **Computed field:** `is_online` = `status` == 'online' AND `last_seen_at` < 5 minutos atrás

#### Views

- **Tree View:** Mostrar `name`, `mac_address`, `workcenter_id`, `status`, `firmware_version`, `last_seen_at`
- **Form View:**
  - **Geral:** Dados principais
  - **Conectividade:** Campos de rede
  - **Diagnóstico:** RSSI, uptime, mesh
- **Kanban View:** Agrupado por `workcenter_id`, colorido por `status`
- **Map View:** Se houver coordenadas de localização

---

## 🔧 Passo a Passo de Criação no Odoo Studio

### 1. Acessar Odoo Studio

1. Login no Odoo SaaS
2. Ativar modo desenvolvedor: **Settings → Activate Developer Mode**
3. Abrir Odoo Studio: **Apps → Studio**

### 2. Criar Novo Módulo (Opcional)

1. **Studio → New App**
2. Nome: "ID Visual AX"
3. Ícone: Escolher ícone apropriado
4. Menu: "Manufacturing"

### 3. Criar Modelo `x_id_visual_request`

1. **Studio → Models → New Model**
2. Nome: "ID Visual Request"
3. Nome Técnico: `x_id_visual_request`
4. Adicionar campos conforme tabela acima
5. Configurar views (Tree, Form, Kanban, Calendar, Pivot)
6. Adicionar regras de negócio (Automated Actions)

### 4. Configurar Sequência Automática

1. **Settings → Technical → Sequences**
2. Criar sequência: "ID Visual Request Sequence"
3. Código: `x_id_visual_request`
4. Prefixo: `IDV-%(year)s-`
5. Padding: 5
6. Vincular ao modelo via Automated Action (on_create)

### 5. Configurar Permissões

1. **Settings → Users & Companies → Groups**
2. Criar grupos:
   - "ID Visual / User" (leitura)
   - "ID Visual / Manager" (escrita)
   - "ID Visual / Admin" (admin)
3. Configurar Record Rules por grupo

### 6. Repetir para Outros Modelos

Repetir passos 3-5 para cada modelo listado acima.

---

## 📊 Script de Migração de Dados

### Migração: `id_request` → `x_id_visual_request`

```python
# backend/scripts/migrate_to_odoo_studio.py
import asyncio
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from app.db.session import get_session
from app.models.id_request import IDRequest
from app.services.odoo_client import OdooClient
from app.core.config import settings

async def migrate_id_requests():
    """Migra IDRequests do banco local para x_id_visual_request no Odoo."""
    
    async with get_session() as session:
        # Buscar todos os IDRequests locais
        stmt = select(IDRequest)
        result = await session.execute(stmt)
        requests = result.scalars().all()
        
        print(f"Migrando {len(requests)} IDRequests para Odoo...")
        
        # Conectar ao Odoo
        odoo = OdooClient(
            url=settings.ODOO_URL,
            db=settings.ODOO_DB,
            auth_type="jsonrpc",
            login=settings.ODOO_LOGIN,
            secret=settings.ODOO_PASSWORD
        )
        
        migrated = 0
        errors = 0
        
        for req in requests:
            try:
                # Buscar MO no Odoo pelo odoo_id armazenado localmente
                # (assumindo que mo_id é FK para manufacturing_order.odoo_id)
                mo_stmt = select(ManufacturingOrder).where(ManufacturingOrder.id == req.mo_id)
                mo_result = await session.execute(mo_stmt)
                mo = mo_result.scalars().first()
                
                if not mo:
                    print(f"ERRO: MO não encontrada para IDRequest {req.id}")
                    errors += 1
                    continue
                
                # Criar registro no Odoo
                odoo_id = await odoo.call_kw(
                    "x_id_visual_request",
                    "create",
                    args=[{
                        "manufacturing_order_id": mo.odoo_id,
                        "package_type": req.package_code,
                        "status": req.status,
                        "priority": req.priority,
                        "source": req.source,
                        "requester_name": req.requester_name,
                        "notes": req.notes,
                        "solicitado_em": req.solicitado_em.isoformat() if req.solicitado_em else False,
                        "iniciado_em": req.iniciado_em.isoformat() if req.iniciado_em else False,
                        "concluido_em": req.concluido_em.isoformat() if req.concluido_em else False,
                        "entregue_em": req.entregue_em.isoformat() if req.entregue_em else False,
                        "aprovado_em": req.aprovado_em.isoformat() if req.aprovado_em else False,
                        "nao_consta_em": req.nao_consta_em.isoformat() if req.nao_consta_em else False,
                        "nao_consta_items": str(req.nao_consta_items) if req.nao_consta_items else False,
                        "nao_consta_registrado_por": req.nao_consta_registrado_por,
                        "transferred_to_queue": req.transferred_to_queue,
                        "transferred_at": req.transferred_at.isoformat() if req.transferred_at else False,
                        "odoo_activity_id": req.odoo_activity_id or False,
                        "transfer_note": req.transfer_note,
                    }]
                )
                
                # Atualizar IDRequest local com odoo_request_id
                req.odoo_request_id = odoo_id
                session.add(req)
                
                migrated += 1
                print(f"✓ Migrado IDRequest {req.id} → Odoo ID {odoo_id}")
                
            except Exception as e:
                print(f"✗ ERRO ao migrar IDRequest {req.id}: {e}")
                errors += 1
        
        await session.commit()
        await odoo.close()
        
        print(f"\nMigração concluída:")
        print(f"  Sucesso: {migrated}")
        print(f"  Erros: {errors}")

if __name__ == "__main__":
    asyncio.run(migrate_id_requests())
```

### Executar Migração

```bash
cd backend
python scripts/migrate_to_odoo_studio.py
```

---

## ✅ Checklist de Validação Pós-Migração

### Validação de Dados

- [ ] Todos os registros foram migrados sem erros
- [ ] Contagem de registros no Odoo == contagem no banco local
- [ ] Timestamps foram preservados corretamente
- [ ] Relacionamentos (Many2one) estão corretos
- [ ] Campos JSON foram serializados corretamente

### Validação de Funcionalidade

- [ ] Backend consegue criar novos registros no Odoo
- [ ] Backend consegue atualizar registros existentes no Odoo
- [ ] Backend consegue consultar registros do Odoo
- [ ] Dashboards de analytics funcionam corretamente
- [ ] Permissões de acesso estão configuradas corretamente

### Validação de Performance

- [ ] Consultas ao Odoo respondem em < 2 segundos
- [ ] Cache local está funcionando corretamente
- [ ] Fila de sincronização está processando sem atrasos

---

## 🎯 Próximos Passos

1. **Criar modelos no Odoo Studio** (Sprint 1)
2. **Testar criação/leitura via API** (Sprint 1)
3. **Executar migração em ambiente de teste** (Sprint 5)
4. **Validar integridade dos dados** (Sprint 5)
5. **Refatorar backend para usar modelos Odoo** (Sprint 2)
6. **Executar migração em produção** (Sprint 5)
7. **Remover tabelas duplicadas do banco local** (Sprint 2)

---

**Documento gerado automaticamente por Kiro AI**  
**Para dúvidas ou sugestões, consulte a equipe de engenharia.**
