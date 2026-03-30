# Guia de Migração: Seleção Dinâmica de Banco de Dados Odoo

## Visão Geral

Este guia documenta o processo de migração para a nova funcionalidade de seleção dinâmica de banco de dados Odoo no ID Visual AX.

**Versão:** 2.0.0  
**Data:** Janeiro 2025  
**Impacto:** Médio (requer atualização de variáveis de ambiente)

## Breaking Changes

### 1. Renomeação de Variáveis de Ambiente

As variáveis de ambiente relacionadas à autenticação Odoo foram renomeadas para clarificar seu propósito:

| Antes | Depois | Descrição |
|-------|--------|-----------|
| `ODOO_LOGIN` | `ODOO_SERVICE_LOGIN` | Login da conta de serviço |
| `ODOO_PASSWORD` | `ODOO_SERVICE_PASSWORD` | Senha/API key da conta de serviço |

**Motivo:** Separar claramente Service_Account (operações do sistema) de User_Credentials (validação de login).

### 2. Comportamento do `ODOO_DB`

- **Antes:** Usado diretamente em todas as operações
- **Depois:** Usado apenas como fallback de emergência

O banco ativo agora é determinado pela seguinte cadeia:
1. `system_setting.active_odoo_db` (prioridade máxima)
2. `"id-visual-3"` (padrão hardcoded)
3. `settings.ODOO_DB` (fallback de emergência)

## Checklist de Migração

### Para Administradores

- [ ] **1. Atualizar arquivo `.env` do backend**
  ```bash
  # Renomear variáveis
  ODOO_SERVICE_LOGIN=seu_email@exemplo.com
  ODOO_SERVICE_PASSWORD=sua_senha_ou_apikey
  
  # ODOO_DB agora é apenas fallback
  ODOO_DB=axengenharia1
  ```

- [ ] **2. Verificar permissões da conta de serviço**
  - A conta deve ter acesso a todos os bancos de dados que serão usados
  - Verificar permissões de leitura em `mrp.production`, `mail.activity`, etc.

- [ ] **3. Popular `system_setting` (opcional)**
  ```sql
  INSERT INTO system_setting (key, value, description, updated_at)
  VALUES (
    'active_odoo_db',
    'id-visual-3',
    'Banco de dados Odoo ativo selecionado dinamicamente',
    NOW()
  )
  ON CONFLICT (key) DO NOTHING;
  ```

- [ ] **4. Reiniciar backend**
  ```bash
  # Docker
  docker compose restart api
  
  # Local
  uvicorn app.main:app --reload
  ```

- [ ] **5. Verificar logs de startup**
  - Procurar por: `✓ Environment validation passed`
  - Se houver erro, verificar variáveis de ambiente

- [ ] **6. Testar seleção de banco via UI**
  - Fazer login no sistema
  - Ir em Configurações → Integração Odoo
  - Verificar lista de bancos disponíveis
  - Selecionar banco de teste
  - Verificar que ConnectionBadge atualiza

### Para Desenvolvedores

- [ ] **1. Atualizar código que instancia `OdooClient` manualmente**
  
  **Antes:**
  ```python
  client = OdooClient(
      url=settings.ODOO_URL,
      db=settings.ODOO_DB,
      login=settings.ODOO_LOGIN,
      secret=settings.ODOO_PASSWORD
  )
  ```
  
  **Depois:**
  ```python
  @router.get("/my-endpoint")
  async def my_endpoint(
      client: OdooClient = Depends(get_odoo_client)
  ):
      # Client já configurado com Service_Account e Active_Database
      data = await client.search_read(...)
      return data
  ```

- [ ] **2. Remover chamadas a `client.close()` em endpoints**
  - O dependency `get_odoo_client()` gerencia o lifecycle automaticamente

- [ ] **3. Atualizar testes**
  - Mockar `get_active_odoo_db()` se necessário
  - Verificar que testes não dependem de `settings.ODOO_DB` diretamente

- [ ] **4. Revisar logs**
  - Verificar que credenciais não aparecem em logs
  - Usar `request_id` para rastreabilidade

## Processo de Rollback

Se necessário reverter para a versão anterior:

### 1. Reverter Código

```bash
git revert <commit-hash-da-feature>
git push
```

### 2. Restaurar Variáveis de Ambiente

```bash
# Voltar para nomes antigos
ODOO_LOGIN=seu_email@exemplo.com
ODOO_PASSWORD=sua_senha_ou_apikey
```

### 3. Limpar `system_setting`

```sql
DELETE FROM system_setting WHERE key = 'active_odoo_db';
```

### 4. Reiniciar Serviços

```bash
docker compose restart
```

## Validação Pós-Migração

### Testes Manuais

1. **Login**
   - [ ] Login com credenciais válidas funciona
   - [ ] Login com credenciais inválidas retorna erro 401
   - [ ] JWT é armazenado corretamente

2. **Seleção de Banco**
   - [ ] Lista de bancos é exibida corretamente
   - [ ] Banco de produção está marcado como não selecionável
   - [ ] Seleção de banco de teste funciona
   - [ ] ConnectionBadge atualiza após seleção

3. **Polling**
   - [ ] Polling inicia automaticamente no login
   - [ ] Polling para no logout
   - [ ] Polling reinicia ao mudar banco de dados
   - [ ] Logs de polling aparecem no console

4. **Operações Odoo**
   - [ ] Busca de MOs funciona (`GET /odoo/mos`)
   - [ ] Busca de solicitações manuais funciona (`GET /id-requests/manual`)
   - [ ] Criação de lotes funciona
   - [ ] Todas as operações usam banco ativo correto

### Verificação de Logs

```bash
# Backend
docker compose logs api | grep -i "active.*odoo"

# Procurar por:
# - "Active Odoo database updated to: <banco>"
# - "Listed X Odoo databases. Active: <banco>"
# - "Connection test successful for database: <banco>"
```

### Verificação de Banco de Dados

```sql
-- Verificar banco ativo
SELECT * FROM system_setting WHERE key = 'active_odoo_db';

-- Verificar logs de auditoria (se existir)
SELECT * FROM history_log 
WHERE action LIKE '%database%' 
ORDER BY timestamp DESC 
LIMIT 10;
```

## Troubleshooting

### Erro: "Missing required environment variables"

**Causa:** Variáveis `ODOO_SERVICE_LOGIN` ou `ODOO_SERVICE_PASSWORD` não definidas.

**Solução:**
1. Verificar arquivo `.env`
2. Renomear `ODOO_LOGIN` → `ODOO_SERVICE_LOGIN`
3. Renomear `ODOO_PASSWORD` → `ODOO_SERVICE_PASSWORD`
4. Reiniciar backend

### Erro: "Banco de produção não pode ser selecionado"

**Causa:** Tentativa de selecionar `axengenharia1` via UI.

**Solução:**
- Isso é comportamento esperado durante período de testes
- Use banco de teste (ex: `id-visual-3`)
- Se realmente precisa usar produção, edite `system_setting` diretamente no banco

### Polling Não Funciona

**Causa:** Endpoints não foram refatorados para usar `get_odoo_client()`.

**Solução:**
1. Verificar que `/odoo/mos` usa `client: OdooClient = Depends(get_odoo_client)`
2. Verificar que `/id-requests/manual` usa `client: OdooClient = Depends(get_odoo_client)`
3. Verificar logs do backend para erros

### ConnectionBadge Sempre Vermelho

**Causa:** Backend não está respondendo ou banco ativo não existe.

**Solução:**
1. Verificar que backend está rodando
2. Verificar `system_setting.active_odoo_db` no banco
3. Verificar que banco existe no servidor Odoo
4. Testar conexão manualmente via `POST /odoo/databases/select`

## Suporte

Para dúvidas ou problemas durante a migração:

1. Verificar logs do backend (`docker compose logs api`)
2. Verificar console do navegador (F12)
3. Consultar documentação:
   - `backend/README.md`
   - `frontend/README.md`
   - `docs/MIGRATION_GUIDE.md` (este arquivo)
4. Contatar equipe de desenvolvimento

## Notas de Versão

### v2.0.0 (Janeiro 2025)

**Adicionado:**
- Seleção dinâmica de banco de dados Odoo via UI
- Componente `DatabaseSelector` para escolha de banco
- Componente `ConnectionBadge` para indicar status de conexão
- `PollingManager` para busca automática de IDs visuais
- Helper `get_active_odoo_db()` com fallback chain robusto
- Endpoints `GET /odoo/databases` e `POST /odoo/databases/select`

**Modificado:**
- Variáveis de ambiente renomeadas (`ODOO_LOGIN` → `ODOO_SERVICE_LOGIN`)
- Dependency `get_odoo_client()` agora usa banco ativo dinamicamente
- Fluxo de autenticação separa Service_Account de User_Credentials
- Polling automático gerenciado por lifecycle de autenticação

**Segurança:**
- Proteção do banco de produção (`axengenharia1`)
- Sanitização de credenciais em logs
- Validação de input no backend
- Mensagens de erro genéricas

**Documentação:**
- README.md do backend atualizado
- README.md do frontend atualizado
- Guia de migração criado
- CHANGELOG.md atualizado
