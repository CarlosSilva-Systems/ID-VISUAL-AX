# Guia de Testes - Seleção Dinâmica de Banco de Dados Odoo

## Visão Geral

Este guia fornece instruções passo a passo para testar todas as funcionalidades implementadas nas 3 features principais:

1. **Seleção Dinâmica de Banco de Dados Odoo**
2. **Refatoração da Lógica de Autenticação**
3. **Polling Automático de Identificações Visuais**

## Pré-requisitos

Antes de iniciar os testes, certifique-se de que:

- [ ] O arquivo `.env` foi atualizado com `ODOO_SERVICE_LOGIN` e `ODOO_SERVICE_PASSWORD`
- [ ] O script de migração foi executado: `python backend/scripts/migrate_active_database.py`
- [ ] Os serviços estão rodando: `docker compose up` ou `npm run dev` (frontend) + `uvicorn app.main:app --reload` (backend)
- [ ] Você tem acesso a pelo menos 2 bancos de dados Odoo (um de teste e o de produção `axengenharia1`)

## Teste 1: Validação de Variáveis de Ambiente

### Objetivo
Verificar que as variáveis de ambiente foram renomeadas corretamente e que o sistema valida sua presença no startup.

### Passos
1. Abra o arquivo `.env` e verifique que contém:
   ```bash
   ODOO_SERVICE_LOGIN=seu_email@exemplo.com
   ODOO_SERVICE_PASSWORD=sua_senha_ou_apikey
   ```

2. Remova temporariamente `ODOO_SERVICE_LOGIN` do `.env`

3. Tente iniciar o backend:
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

### Resultado Esperado
- ❌ O servidor deve **falhar ao iniciar** com erro:
  ```
  RuntimeError: Missing required environment variables: ODOO_SERVICE_LOGIN
  ```

4. Restaure `ODOO_SERVICE_LOGIN` no `.env` e reinicie o servidor

### Resultado Esperado
- ✅ O servidor deve iniciar com sucesso e exibir:
  ```
  ✓ Environment validation passed
  ```

---

## Teste 2: Helper get_active_odoo_db() e Fallback Chain

### Objetivo
Verificar que o helper retorna o banco ativo correto seguindo a cadeia de fallback.

### Passos
1. Acesse o banco de dados local (SQLite ou PostgreSQL)

2. Verifique se existe registro em `system_setting`:
   ```sql
   SELECT * FROM system_setting WHERE key = 'active_odoo_db';
   ```

### Cenário A: system_setting existe
**Resultado Esperado:**
- ✅ O sistema deve usar o valor de `system_setting.value`
- ✅ Logs devem mostrar: `Using active database from system_setting: {nome_do_banco}`

### Cenário B: system_setting não existe
1. Delete o registro:
   ```sql
   DELETE FROM system_setting WHERE key = 'active_odoo_db';
   ```

2. Reinicie o backend

**Resultado Esperado:**
- ✅ O sistema deve usar fallback `id-visual-3`
- ✅ Logs devem mostrar: `No active_odoo_db in system_setting, using default: id-visual-3`

### Cenário C: Banco de dados não disponível
1. Pare o banco de dados local

2. Tente acessar qualquer endpoint que use Odoo

**Resultado Esperado:**
- ✅ O sistema deve usar fallback `settings.ODOO_DB` do `.env`
- ✅ Logs devem mostrar: `Database unavailable, using .env fallback: {ODOO_DB}`

---

## Teste 3: Endpoint GET /api/v1/odoo/databases

### Objetivo
Verificar que o endpoint lista todos os bancos disponíveis com classificação correta.

### Passos
1. Abra o Swagger UI: `http://localhost:8000/docs`

2. Faça login para obter token JWT

3. Execute GET `/api/v1/odoo/databases`

### Resultado Esperado
```json
[
  {
    "name": "axengenharia1",
    "type": "production",
    "selectable": false,
    "is_active": false
  },
  {
    "name": "id-visual-3",
    "type": "test",
    "selectable": true,
    "is_active": true
  }
]
```

### Validações
- ✅ Banco `axengenharia1` deve ter `type: "production"` e `selectable: false`
- ✅ Qualquer outro banco deve ter `type: "test"` e `selectable: true`
- ✅ Exatamente um banco deve ter `is_active: true`
- ✅ O banco ativo deve corresponder ao valor em `system_setting` (ou fallback)

---

## Teste 4: Endpoint POST /api/v1/odoo/databases/select

### Objetivo
Verificar que o endpoint seleciona banco de teste e rejeita banco de produção.

### Cenário A: Selecionar banco de teste válido
1. No Swagger UI, execute POST `/api/v1/odoo/databases/select`:
   ```json
   {
     "database": "id-visual-3"
   }
   ```

### Resultado Esperado
- ✅ Status: `200 OK`
- ✅ Response:
  ```json
  {
    "status": "success",
    "database": "id-visual-3",
    "connection_ok": true
  }
  ```
- ✅ Verificar no banco: `SELECT value FROM system_setting WHERE key = 'active_odoo_db'` deve retornar `id-visual-3`

### Cenário B: Tentar selecionar banco de produção
1. Execute POST `/api/v1/odoo/databases/select`:
   ```json
   {
     "database": "axengenharia1"
   }
   ```

### Resultado Esperado
- ❌ Status: `403 Forbidden`
- ❌ Response:
  ```json
  {
    "detail": "Banco de produção não pode ser selecionado durante período de testes"
  }
  ```

### Cenário C: Selecionar banco com nome inválido
1. Execute POST `/api/v1/odoo/databases/select`:
   ```json
   {
     "database": "banco com espaços"
   }
   ```

### Resultado Esperado
- ❌ Status: `400 Bad Request`
- ❌ Response:
  ```json
  {
    "detail": "Nome de banco inválido. Use apenas letras, números, hífen e underscore."
  }
  ```

---

## Teste 5: Fluxo de Autenticação Refatorado

### Objetivo
Verificar que o login usa credenciais do usuário para validação e Service_Account para operações.

### Passos
1. Abra o frontend: `http://localhost:5173`

2. Faça login com suas credenciais do Odoo:
   - Email: `seu_email@exemplo.com`
   - Senha: `sua_senha_odoo`

### Resultado Esperado
- ✅ Login deve ser bem-sucedido
- ✅ Token JWT deve ser armazenado em `localStorage`
- ✅ Logs do backend devem mostrar:
  ```
  Login attempt for user: seu_email@exemplo.com
  Using active database: id-visual-3
  Login successful for: seu_email@exemplo.com
  ```

3. Após login, acesse qualquer funcionalidade que consulta o Odoo (ex: lista de MOs)

### Resultado Esperado
- ✅ Operações devem usar `ODOO_SERVICE_LOGIN` e `ODOO_SERVICE_PASSWORD`
- ✅ Logs devem mostrar:
  ```
  OdooClient initialized with Service Account: service_account@exemplo.com
  Using active database: id-visual-3
  ```

4. Verifique que a senha do usuário **NÃO** está armazenada:
   - Abra DevTools → Application → Local Storage
   - Verifique que apenas `id_visual_token` (JWT) está presente
   - Decodifique o JWT em `jwt.io` e verifique que contém apenas `sub` (username) e `exp` (expiration)

### Resultado Esperado
- ✅ JWT deve conter apenas: `{"sub": "seu_email@exemplo.com", "exp": 1234567890}`
- ✅ Senha do usuário **NÃO** deve aparecer em nenhum lugar

---

## Teste 6: Componente DatabaseSelector (Frontend)

### Objetivo
Verificar que o dropdown de seleção de banco funciona corretamente na UI.

### Passos
1. Faça login no sistema

2. Navegue para: **Configurações → Seleção de Banco de Dados**

3. Observe o dropdown de bancos

### Resultado Esperado
- ✅ Banco `axengenharia1` deve aparecer com ícone verde (🟢) e estar **desabilitado**
- ✅ Bancos de teste devem aparecer com ícone amarelo (🟡) e estar **habilitados**
- ✅ Banco ativo deve estar pré-selecionado
- ✅ Ao passar o mouse sobre `axengenharia1`, deve exibir tooltip:
  ```
  Banco de produção — seleção desabilitada durante período de testes
  ```

4. Selecione um banco de teste diferente (ex: `teste-dres`)

5. Clique em **"Salvar Configuração"**

### Resultado Esperado
- ✅ Toast de sucesso deve aparecer: `"Banco de dados atualizado com sucesso!"`
- ✅ Connection_Badge no header deve atualizar automaticamente
- ✅ Polling deve reiniciar (verificar logs no console)

---

## Teste 7: Componente ConnectionBadge (Frontend)

### Objetivo
Verificar que o badge de status exibe corretamente o estado da conexão.

### Passos
1. Faça login no sistema

2. Observe o badge no header (canto superior direito)

### Cenário A: Conectado a banco de teste
**Resultado Esperado:**
- ✅ Badge deve exibir: `🟡 ODOO CONECTADO (id-visual-3)`
- ✅ Cor de fundo: amarelo claro
- ✅ Ícone animado pulsando

### Cenário B: Conectado a banco de produção (simulação)
1. Altere manualmente `system_setting` para `axengenharia1`:
   ```sql
   UPDATE system_setting SET value = 'axengenharia1' WHERE key = 'active_odoo_db';
   ```

2. Recarregue a página

**Resultado Esperado:**
- ✅ Badge deve exibir: `🟢 ODOO CONECTADO (axengenharia1)`
- ✅ Cor de fundo: verde claro

### Cenário C: Sem conexão (simulação)
1. Pare o servidor Odoo ou configure URL inválida

2. Recarregue a página

**Resultado Esperado:**
- ✅ Badge deve exibir: `🔴 ODOO DESCONECTADO`
- ✅ Cor de fundo: vermelho claro

---

## Teste 8: Polling Automático de Identificações

### Objetivo
Verificar que o polling inicia no login, para no logout e reinicia ao mudar banco.

### Passos
1. Abra o DevTools → Console

2. Faça login no sistema

### Resultado Esperado
- ✅ Console deve exibir:
  ```
  [Polling] Started
  [Polling] ID_Odoo refreshed (após 10 minutos)
  [Polling] ID_Producao refreshed (após 30 segundos)
  ```

3. Aguarde 30 segundos e observe o console

### Resultado Esperado
- ✅ Console deve exibir: `[Polling] ID_Producao refreshed`

4. Aguarde 10 minutos (ou force chamada manual) e observe o console

### Resultado Esperado
- ✅ Console deve exibir: `[Polling] ID_Odoo refreshed`

5. Vá para Configurações → Seleção de Banco de Dados

6. Selecione outro banco e clique em "Salvar"

### Resultado Esperado
- ✅ Console deve exibir:
  ```
  [App] Database changed, restarting polling
  [Polling] Stopped
  [Polling] Started
  ```

7. Faça logout

### Resultado Esperado
- ✅ Console deve exibir: `[Polling] Stopped`

---

## Teste 9: Tratamento de Falhas de Polling

### Objetivo
Verificar que falhas de polling não interrompem a UX.

### Passos
1. Faça login no sistema

2. Pare o servidor backend temporariamente

3. Aguarde 30 segundos (intervalo do ID_Producao)

### Resultado Esperado
- ✅ Console deve exibir erro: `[Polling] ID_Producao failed: ...`
- ✅ **Nenhum toast de erro** deve aparecer na UI
- ✅ Polling deve continuar tentando

4. Reinicie o servidor backend

5. Aguarde 30 segundos

### Resultado Esperado
- ✅ Console deve exibir: `[Polling] ID_Producao refreshed`
- ✅ Polling deve ter se recuperado automaticamente

---

## Teste 10: Segurança - Zero Vazamento de Credenciais

### Objetivo
Verificar que credenciais sensíveis nunca aparecem em logs ou respostas HTTP.

### Passos
1. Abra o terminal onde o backend está rodando

2. Force um erro de autenticação (ex: senha incorreta no login)

3. Observe os logs do backend

### Resultado Esperado
- ✅ Logs devem conter `request_id` único para rastreabilidade
- ✅ `ODOO_SERVICE_PASSWORD` **NÃO** deve aparecer em nenhum log
- ✅ `ODOO_SERVICE_LOGIN` **NÃO** deve aparecer em nenhum log
- ✅ Senha do usuário **NÃO** deve aparecer em nenhum log

4. Abra DevTools → Network

5. Faça login com credenciais inválidas

6. Observe a resposta HTTP

### Resultado Esperado
- ✅ Response deve conter mensagem genérica: `"Credenciais inválidas"`
- ✅ Response **NÃO** deve revelar detalhes internos (ex: "User not found in database X")
- ✅ Response deve conter `request_id` para rastreabilidade

---

## Teste 11: Normalização de Nomes de Banco

### Objetivo
Verificar que nomes de banco são normalizados corretamente (trim, sem lowercase).

### Passos
1. No Swagger UI, execute POST `/api/v1/odoo/databases/select`:
   ```json
   {
     "database": "  id-visual-3  "
   }
   ```

### Resultado Esperado
- ✅ Status: `200 OK`
- ✅ Banco deve ser salvo como `id-visual-3` (sem espaços)
- ✅ Verificar no banco: `SELECT value FROM system_setting WHERE key = 'active_odoo_db'` deve retornar `id-visual-3`

2. Execute POST `/api/v1/odoo/databases/select`:
   ```json
   {
     "database": "ID-Visual-3"
   }
   ```

### Resultado Esperado
- ✅ Status: `200 OK`
- ✅ Banco deve ser salvo como `ID-Visual-3` (maiúsculas preservadas)
- ✅ **NÃO** deve converter para lowercase

---

## Teste 12: Compatibilidade com Código Existente

### Objetivo
Verificar que endpoints existentes continuam funcionando após refatoração.

### Passos
1. Teste os seguintes endpoints no Swagger UI:
   - GET `/api/v1/odoo/mos` (lista de manufacturing orders)
   - GET `/api/v1/auth/me` (perfil do usuário)
   - GET `/api/v1/odoo/users` (lista de usuários Odoo)

### Resultado Esperado
- ✅ Todos os endpoints devem retornar `200 OK`
- ✅ Dados devem ser retornados corretamente
- ✅ Logs devem mostrar uso de `Service_Account` e `Active_Database`

---

## Checklist de Validação Final

Antes de considerar a implementação completa, verifique:

### Backend
- [ ] Variáveis `ODOO_SERVICE_LOGIN` e `ODOO_SERVICE_PASSWORD` estão no `.env`
- [ ] Startup validation passa sem erros
- [ ] GET `/api/v1/odoo/databases` retorna lista correta
- [ ] POST `/api/v1/odoo/databases/select` rejeita `axengenharia1` com 403
- [ ] POST `/api/v1/odoo/databases/select` rejeita nomes inválidos com 400
- [ ] Login usa `get_active_odoo_db()` para validar credenciais
- [ ] Operações pós-login usam `Service_Account`
- [ ] Logs não contêm `ODOO_SERVICE_PASSWORD` ou senhas de usuário
- [ ] Mensagens de erro são genéricas (não revelam detalhes internos)

### Frontend
- [ ] DatabaseSelector exibe bancos com ícones corretos (🟢/🟡)
- [ ] Banco `axengenharia1` está desabilitado no dropdown
- [ ] ConnectionBadge exibe status correto (verde/amarelo/vermelho)
- [ ] ConnectionBadge atualiza após salvar nova configuração
- [ ] Polling inicia no login
- [ ] Polling para no logout
- [ ] Polling reinicia ao mudar banco
- [ ] Falhas de polling não exibem toasts (silenciosas)
- [ ] Console exibe logs estruturados de polling

### Segurança
- [ ] `ODOO_SERVICE_PASSWORD` nunca aparece em logs
- [ ] Senha do usuário nunca é armazenada
- [ ] JWT contém apenas `sub` e `exp`
- [ ] Mensagens de erro não revelam detalhes internos
- [ ] Banco de produção não pode ser selecionado via UI

### Documentação
- [ ] README.md do backend atualizado
- [ ] README.md do frontend atualizado
- [ ] Guia de migração criado
- [ ] CHANGELOG.md atualizado
- [ ] Checklist de segurança criado

---

## Troubleshooting

### Problema: "Missing required environment variables"
**Solução:** Verifique que `.env` contém `ODOO_SERVICE_LOGIN` e `ODOO_SERVICE_PASSWORD`

### Problema: "Failed to connect to database"
**Solução:** Verifique que `ODOO_URL` está correto e que o servidor Odoo está acessível

### Problema: Polling não inicia
**Solução:** Verifique que você está logado e que o console não exibe erros de autenticação

### Problema: Badge não atualiza após salvar
**Solução:** Verifique que evento 'database-changed' está sendo disparado (console)

### Problema: Banco de produção aparece habilitado
**Solução:** Verifique que classificação está correta (GET `/api/v1/odoo/databases`)

---

## Relatório de Bugs

Se encontrar algum problema durante os testes, documente:

1. **Descrição do problema**
2. **Passos para reproduzir**
3. **Resultado esperado**
4. **Resultado obtido**
5. **Logs relevantes** (backend e console do navegador)
6. **Screenshots** (se aplicável)

Envie o relatório para a equipe de desenvolvimento.

---

**Versão do Guia:** 1.0  
**Data:** 2024-01-XX  
**Autor:** Equipe ID Visual AX
