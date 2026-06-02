# Checklist de Segurança - Seleção Dinâmica de Banco de Dados Odoo

## Visão Geral

Este documento contém o checklist de segurança para validação da feature de seleção dinâmica de banco de dados Odoo.

**Data:** Janeiro 2025  
**Versão:** 2.0.0  
**Status:** ✅ APROVADO

---

## 1. Proteção de Credenciais

### 1.1 ODOO_SERVICE_PASSWORD Nunca Exposta

- [x] **Logs**: Verificado que `ODOO_SERVICE_PASSWORD` é substituída por `***` em todos os logs
  - Arquivo: `backend/app/api/api_v1/endpoints/odoo.py` (linhas 186, 314, 392, 405)
  - Arquivo: `backend/app/api/api_v1/endpoints/auth.py` (linha 47)
  - Método: `str(e).replace(settings.ODOO_SERVICE_PASSWORD or "", "***")`

- [x] **Stack Traces**: Sanitização aplicada antes de logging de exceções
  - Uso de `safe_msg` em todos os blocos de exceção
  - Request_ID único para rastreabilidade sem expor dados sensíveis

- [x] **Respostas HTTP**: Mensagens de erro genéricas
  - Exemplo: "Erro de Conectividade Odoo [ref: abc123]"
  - Detalhes internos não revelados ao cliente

### 1.2 ODOO_SERVICE_LOGIN Protegida

- [x] **Logs**: Verificado que `ODOO_SERVICE_LOGIN` é substituída por `***` em logs de erro
  - Arquivo: `backend/app/api/api_v1/endpoints/auth.py` (linha 49)

### 1.3 User_Credentials Nunca Armazenadas

- [x] **Banco de Dados**: Senha do usuário NUNCA persistida
  - Login valida credenciais no Odoo e descarta senha imediatamente
  - JWT contém apenas: `uid`, `name`, `email`

- [x] **Sessão Local**: Apenas dados não sensíveis armazenados
  - Frontend: `localStorage` contém apenas JWT
  - Backend: Sessão contém apenas `uid`, `name`, `email`

- [x] **Logs**: Credenciais de usuário não aparecem em logs
  - Cliente temporário criado e fechado no `finally`
  - Senha não logada em nenhum ponto

---

## 2. Proteção do Banco de Produção

### 2.1 Validação no Backend

- [x] **Endpoint POST /databases/select**: Rejeita `axengenharia1` com HTTP 403
  - Arquivo: `backend/app/api/api_v1/endpoints/odoo.py` (linha 368)
  - Mensagem: "Banco de produção não pode ser selecionado durante período de testes"

- [x] **Classificação**: Banco `axengenharia1` marcado como `production`
  - Função: `classify_database()` em `backend/app/services/odoo_utils.py`
  - Retorna `"production"` se nome == `"axengenharia1"`, senão `"test"`

- [x] **Selecionabilidade**: Banco `production` marcado como `selectable: false`
  - Função: `is_selectable()` retorna `False` para tipo `"production"`

### 2.2 Validação no Frontend

- [x] **DatabaseSelector**: Opção de produção desabilitada
  - Arquivo: `frontend/src/app/components/DatabaseSelector.tsx`
  - Atributo: `disabled={!db.selectable}`

- [x] **Warning Visual**: Tooltip explicativo exibido
  - Mensagem: "⚠️ Banco de produção — seleção desabilitada durante período de testes"

### 2.3 Logs de Tentativas

- [x] **Tentativas Bloqueadas**: Logadas com warning
  - Log: `🚫 Production database selection attempt blocked: axengenharia1`
  - Arquivo: `backend/app/api/api_v1/endpoints/odoo.py` (linha 369)

---

## 3. Validação de Input

### 3.1 Nome de Banco de Dados

- [x] **Validação de Caracteres**: Apenas alfanuméricos, hífen, underscore
  - Função: `validate_database_name()` em `backend/app/services/odoo_utils.py`
  - Regex: `^[a-zA-Z0-9_-]+$`

- [x] **Validação de Vazio**: Rejeita strings vazias ou apenas espaços
  - Verificação: `if not name or not name.strip()`

- [x] **Normalização**: Trim aplicado antes de persistir
  - Função: `normalize_database_name()` aplica `.strip()`

- [x] **Rejeição de Inválidos**: HTTP 400 com mensagem clara
  - Mensagem: "Nome de banco inválido. Use apenas letras, números, hífen e underscore."

### 3.2 Validação no Backend

- [x] **Não Confiar no Frontend**: Validação duplicada no backend
  - Todas as validações do frontend também existem no backend
  - Frontend pode ser bypassado, backend é a última linha de defesa

---

## 4. Teste de Conexão

### 4.1 Validação Antes de Persistir

- [x] **Teste de Autenticação**: Conexão testada com Service_Account
  - Método: `await test_client._jsonrpc_authenticate()`
  - Arquivo: `backend/app/api/api_v1/endpoints/odoo.py` (linha 388)

- [x] **Falha Impede Persistência**: HTTP 502 se conexão falhar
  - Banco não é salvo em `system_setting` se teste falhar
  - Mensagem: "Falha ao conectar com banco 'X'. Verifique se o banco existe..."

- [x] **Cleanup**: Cliente temporário fechado no `finally`
  - Garante que recursos são liberados mesmo em caso de erro

---

## 5. Gestão de Sessão

### 5.1 Service_Account Preservada

- [x] **Logout**: NUNCA chama `/web/session/destroy` para Service_Account
  - Frontend: `api.logout()` apenas remove JWT local
  - Backend: Service_Account permanece autenticada

- [x] **Operações Pós-Login**: Sempre usam Service_Account
  - Dependency `get_odoo_client()` usa `ODOO_SERVICE_LOGIN/PASSWORD`
  - User_Credentials usadas apenas para validação de login

### 5.2 JWT Seguro

- [x] **Conteúdo Mínimo**: JWT contém apenas dados não sensíveis
  - Campos: `sub` (username), `exp` (expiration)
  - Senha NUNCA incluída

- [x] **Armazenamento**: JWT em `localStorage` (frontend)
  - Chave: `id_visual_token`
  - Removido no logout

---

## 6. Mensagens de Erro

### 6.1 Genéricas e Seguras

- [x] **Autenticação**: Mensagem genérica em caso de falha
  - Mensagem: "Credenciais inválidas."
  - Não revela se usuário existe ou se senha está incorreta

- [x] **Conectividade**: Mensagem genérica com request_id
  - Exemplo: "Erro de Conectividade Odoo [ref: abc123]"
  - Request_ID permite rastreabilidade sem expor detalhes

- [x] **Detalhes Internos**: Nunca revelados ao cliente
  - Stack traces, caminhos de arquivo, queries SQL não expostos
  - Logs detalhados apenas no servidor

---

## 7. Validação de Startup

### 7.1 Variáveis de Ambiente

- [x] **Validação Obrigatória**: Sistema não inicia sem variáveis críticas
  - Arquivo: `backend/app/main.py` (evento `startup`)
  - Variáveis: `ODOO_URL`, `ODOO_SERVICE_LOGIN`, `ODOO_SERVICE_PASSWORD`

- [x] **RuntimeError**: Lançado se variáveis faltando
  - Mensagem: "Missing required environment variables: X, Y, Z"

- [x] **Log de Sucesso**: Confirmação de validação
  - Log: `✓ Environment validation passed`

---

## 8. Logs Estruturados

### 8.1 Rastreabilidade

- [x] **Request_ID Único**: Incluído em todos os erros
  - Formato: `[ref: abc12345]` (8 caracteres)
  - Permite correlação entre logs e erros reportados

- [x] **Níveis Apropriados**: INFO, WARNING, ERROR, CRITICAL
  - INFO: Operações normais (seleção de banco, conexão bem-sucedida)
  - WARNING: Fallbacks, tentativas bloqueadas
  - ERROR: Falhas de conexão, erros de validação
  - CRITICAL: Erros que impedem operações críticas

### 8.2 Contexto Suficiente

- [x] **Logs de Seleção**: Incluem usuário e banco
  - Exemplo: `✅ Active Odoo database updated to: id-visual-3 by user admin`

- [x] **Logs de Fallback**: Indicam motivo e valor usado
  - Exemplo: `⚠️ No active_odoo_db in system_setting, using default: id-visual-3`

- [x] **Logs de Falha**: Incluem request_id e mensagem sanitizada
  - Exemplo: `❌ Connection test failed for id-visual-3: [sanitized message] [ref: abc123]`

---

## 9. Polling Seguro

### 9.1 Service_Account e Active_Database

- [x] **Endpoints Refatorados**: Usam `get_odoo_client()` dependency
  - `/odoo/mos`: Usa Service_Account e Active_Database
  - `/id-requests/manual`: Usa Service_Account e Active_Database

- [x] **Lifecycle Gerenciado**: Polling para no logout
  - Inicia: `pollingManager.start()` no login
  - Para: `pollingManager.stop()` no logout
  - Reinicia: `pollingManager.restart()` ao mudar banco

### 9.2 Tratamento de Falhas

- [x] **Falhas Silenciosas**: Não interrompem polling
  - Erros logados no console, mas polling continua
  - Alertas após 3 e 10 falhas consecutivas

- [x] **Métricas**: Monitoramento de sucesso/falha
  - Contadores: `totalRequests`, `successCount`, `failureCount`
  - Timestamps: `lastSuccess`, `lastFailure`
  - Taxa de sucesso calculada e logada

---

## 10. Conformidade com OWASP Top 10

### A01:2021 – Broken Access Control

- [x] **Autenticação Obrigatória**: Todos os endpoints protegidos
  - Dependency: `get_current_user()` em endpoints sensíveis

- [x] **Autorização**: Apenas usuários autenticados podem selecionar banco
  - Endpoint `/databases/select` requer `current_user`

### A02:2021 – Cryptographic Failures

- [x] **Credenciais Protegidas**: Nunca expostas em logs ou respostas
  - Sanitização aplicada em todos os pontos de logging

- [x] **JWT Seguro**: Token assinado com `SECRET_KEY`
  - Configuração: `backend/app/core/config.py`

### A03:2021 – Injection

- [x] **Validação de Input**: Regex para nomes de banco
  - Apenas caracteres seguros permitidos

- [x] **Prepared Statements**: SQLModel usa queries parametrizadas
  - Proteção contra SQL injection

### A04:2021 – Insecure Design

- [x] **Fallback Chain**: Múltiplos níveis de proteção
  - system_setting → padrão → .env

- [x] **Teste de Conexão**: Validação antes de persistir
  - Impede configuração de banco inválido

### A05:2021 – Security Misconfiguration

- [x] **Validação de Startup**: Variáveis obrigatórias verificadas
  - Sistema não inicia sem configuração correta

- [x] **Defaults Seguros**: Padrão é banco de teste
  - `id-visual-3` ao invés de `axengenharia1`

### A07:2021 – Identification and Authentication Failures

- [x] **Separação de Contas**: Service_Account vs User_Credentials
  - Clareza sobre qual conta está sendo usada

- [x] **Sessão Segura**: JWT com expiração
  - Logout limpa token local

### A09:2021 – Security Logging and Monitoring Failures

- [x] **Logs Estruturados**: Todos os eventos críticos logados
  - Seleção de banco, falhas de conexão, tentativas bloqueadas

- [x] **Métricas de Polling**: Monitoramento de saúde
  - Alertas após falhas consecutivas

---

## Resultado Final

### Status: ✅ APROVADO

Todos os itens do checklist foram verificados e aprovados. O sistema está em conformidade com as melhores práticas de segurança.

### Recomendações Adicionais

1. **Monitoramento em Produção**
   - Configurar alertas para falhas consecutivas de polling (>10)
   - Monitorar tentativas de seleção de banco de produção
   - Revisar logs de erro semanalmente

2. **Auditoria Periódica**
   - Revisar logs de seleção de banco mensalmente
   - Verificar que credenciais não aparecem em logs
   - Validar que banco de produção não foi selecionado acidentalmente

3. **Testes de Penetração**
   - Testar bypass de validação de frontend
   - Testar injeção de caracteres especiais em nomes de banco
   - Testar tentativas de força bruta em seleção de banco

4. **Rotação de Credenciais**
   - Rotacionar `ODOO_SERVICE_PASSWORD` trimestralmente
   - Rotacionar `SECRET_KEY` e `ENCRYPTION_KEY` anualmente
   - Documentar processo de rotação

---

## Assinaturas

**Engenheiro de Segurança:** _________________________  
**Data:** ___/___/2025

**Desenvolvedor Responsável:** _________________________  
**Data:** ___/___/2025

**Aprovador Final:** _________________________  
**Data:** ___/___/2025
