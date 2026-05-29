# Guia Rápido: Configurar Webhook Odoo 19 → ID Visual AX

## ✅ Checklist de Configuração

### 1. Verificar Secret do Webhook

Abra o arquivo `.env` do backend e copie o valor de `ODOO_WEBHOOK_SECRET`:

```bash
# Exemplo:
ODOO_WEBHOOK_SECRET=meu_secret_super_seguro_123
```

**⚠️ IMPORTANTE:** Se o valor for `SET_THIS_IN_ENV_FOR_SECURITY`, você **DEVE** alterá-lo para um valor seguro antes de usar em produção.

---

### 2. Criar Ação Automatizada no Odoo 19

1. **Acesse:** Configurações → Técnico → Automação → **Ações Automatizadas**

2. **Clique em:** `Criar`

3. **Preencha os campos:**

#### Aba "Ação"
- **Nome:** `Andon - Sincronizar Estado de Workorder`
- **Modelo:** `Ordem de Trabalho de Fabricação` (busque por `mrp.workorder`)
- **Gatilho:** `Ao atualizar`
- **Ativo:** ✅ (marcar checkbox)

#### Aba "Aplicar em"
Clique em **Adicionar filtro** e configure:
```
Status está em progress,pause,pending,ready,done,cancel
```

Ou use o domínio direto (modo desenvolvedor):
```python
[('state', 'in', ['ready', 'progress', 'pause', 'pending', 'done', 'cancel'])]
```

#### Aba "Campos Gatilho"
- Clique em **Adicionar uma linha**
- Selecione: `Status` (campo `state`)
- **Isso é CRÍTICO** — sem isso o webhook não dispara!

#### Aba "Ação a Executar"
- **Tipo de Ação:** `Enviar notificação de Webhook`
- **URL:** 
  ```
  http://192.168.1.28/api/v1/webhook/odoo/workorder
  ```
  **⚠️ Substitua `192.168.1.28` pelo IP/domínio do seu backend!**

- **Cabeçalhos HTTP:**
  ```json
  {
    "Content-Type": "application/json",
    "X-Andon-Webhook-Secret": "meu_secret_super_seguro_123"
  }
  ```
  **⚠️ Substitua pelo valor do seu `ODOO_WEBHOOK_SECRET`!**

4. **Salvar**

---

### 3. Testar a Integração

#### Teste 1: Iniciar Produção
1. Abra uma **Ordem de Fabricação** no Odoo
2. Clique em **Ordem de Trabalho** (aba)
3. Selecione uma workorder
4. Clique em **Iniciar**

**Resultado esperado:**
- ✅ LED verde acende no ESP32
- ✅ Dashboard mostra "Produção em andamento"
- ✅ Timer começa a contar no Odoo

#### Teste 2: Pausar Produção
1. Na mesma workorder, clique em **Pausar**

**Resultado esperado:**
- ✅ LEDs apagam no ESP32 (blink azul)
- ✅ Dashboard mostra "Produção pausada"
- ✅ Timer para no Odoo

#### Teste 3: Retomar Produção
1. Clique em **Retomar**

**Resultado esperado:**
- ✅ LED verde acende novamente no ESP32
- ✅ Dashboard mostra "Produção em andamento"
- ✅ Timer retoma no Odoo

#### Teste 4: Botão Físico (Toggle)
1. Pressione o **botão PAUSE** (GPIO 33) no ESP32

**Resultado esperado:**
- ✅ LEDs apagam (blink azul)
- ✅ Dashboard mostra "Produção pausada"
- ✅ Timer para no Odoo

2. Pressione novamente

**Resultado esperado:**
- ✅ LED verde acende
- ✅ Dashboard mostra "Produção em andamento"
- ✅ Timer retoma no Odoo

---

### 4. Verificar Logs

#### Backend (FastAPI)
```bash
# Ver logs do webhook
docker compose logs -f api | grep Webhook

# Exemplo de log bem-sucedido:
# [Webhook] Formato Odoo 19 detectado: wo_id=429 state=progress
# [Webhook] WO 429 → workcenter 5 (Mesa 01) | state=progress → andon=verde mqtt=GREEN
# [Webhook] Processado com sucesso: WO 429 → workcenter 5 → MQTT GREEN
```

#### Odoo
1. Acesse a **Ação Automatizada** criada
2. Clique em **Ação** → **Ver Logs de Execução**
3. Verifique se há erros

**Exemplo de erro comum:**
```
Connection refused: http://192.168.1.28/api/v1/webhook/odoo/workorder
```
**Solução:** Verificar se o backend está acessível pelo servidor Odoo

---

### 5. Troubleshooting

#### ❌ Webhook não dispara

**Causa:** Campo `Status` não está em **Campos Gatilho**

**Solução:**
1. Edite a ação automatizada
2. Vá em **Campos Gatilho**
3. Adicione o campo `Status`
4. Salve

---

#### ❌ Erro 401 Unauthorized

**Causa:** Secret incorreto

**Solução:**
1. Verifique o valor de `ODOO_WEBHOOK_SECRET` no `.env` do backend
2. Copie o valor **exato** (sem espaços)
3. Cole no campo **Cabeçalhos HTTP** da ação automatizada:
   ```json
   {
     "Content-Type": "application/json",
     "X-Andon-Webhook-Secret": "VALOR_EXATO_AQUI"
   }
   ```

---

#### ❌ Erro 404 Not Found

**Causa:** URL incorreta

**Solução:**
Verifique se a URL está **exatamente** assim:
```
http://SEU_IP:8000/api/v1/webhook/odoo/workorder
```

**Checklist:**
- ✅ Protocolo: `http://` (não `https://` se não tiver SSL)
- ✅ Porta: `:8000` (ou a porta do seu backend)
- ✅ Path: `/api/v1/webhook/odoo/workorder` (não esquecer `/api/v1`)

---

#### ❌ ESP32 não recebe estado

**Causa 1:** Dispositivo não vinculado ao workcenter

**Solução:**
1. Acesse o dashboard do ID Visual AX
2. Vá em **Dispositivos IoT**
3. Edite o dispositivo ESP32
4. Selecione o **Workcenter** correto
5. Salve

**Causa 2:** Broker MQTT inacessível

**Solução:**
```bash
# Verificar se o broker MQTT está rodando
docker compose ps | grep mqtt

# Verificar logs do backend
docker compose logs -f api | grep MQTT
```

---

### 6. Formato do Payload (Referência)

O Odoo 19 envia automaticamente este JSON:

```json
{
  "_action": "Enviar notificação de Webhook(#NewId_0x70eca8654680)",
  "_id": 429,
  "_model": "mrp.workorder",
  "id": 429,
  "state": "progress"
}
```

**Campos usados pelo backend:**
- `id`: ID da workorder
- `state`: Estado atual (`progress`, `pause`, `pending`, `done`, `cancel`)

**Estados mapeados:**
| Estado Odoo | LED ESP32 | Dashboard |
|-------------|-----------|-----------|
| `progress` | 🟢 Verde | "Produção em andamento" |
| `pause` | 🔵 Azul piscando | "Produção pausada" |
| `pending` | 🔵 Azul piscando | "Aguardando componentes" |
| `ready` | 🔵 Azul piscando | "Pronto para iniciar" |
| `done` | 🔵 Azul piscando | "Concluído" |
| `cancel` | 🔵 Azul piscando | "Cancelado" |

---

## ✅ Checklist Final

Antes de considerar a configuração completa, verifique:

- [ ] `ODOO_WEBHOOK_SECRET` configurado no `.env` do backend
- [ ] Ação automatizada criada no Odoo 19
- [ ] Campo `Status` adicionado em **Campos Gatilho**
- [ ] URL do webhook correta (acessível pelo servidor Odoo)
- [ ] Secret correto nos **Cabeçalhos HTTP**
- [ ] Teste de iniciar/pausar/retomar funcionando
- [ ] ESP32 vinculado ao workcenter correto
- [ ] Logs do backend sem erros

---

## 📞 Suporte

Se após seguir todos os passos ainda houver problemas:

1. **Capture os logs:**
   ```bash
   docker compose logs -f api > logs_backend.txt
   ```

2. **Capture o payload do Odoo:**
   - Vá em **Ação Automatizada** → **Ver Logs de Execução**
   - Copie o payload enviado

3. **Verifique a conectividade:**
   ```bash
   # Do servidor Odoo, teste se o backend está acessível:
   curl -X POST http://SEU_IP:8000/api/v1/webhook/odoo/workorder \
     -H "Content-Type: application/json" \
     -H "X-Andon-Webhook-Secret: SEU_SECRET" \
     -d '{"id": 1, "state": "progress"}'
   ```

---

**Última atualização:** 2026-05-29  
**Versão do Odoo:** 19  
**Versão do Backend:** FastAPI + Python 3.11
