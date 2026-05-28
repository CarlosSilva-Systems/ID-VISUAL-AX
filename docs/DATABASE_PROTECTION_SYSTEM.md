# Sistema de Proteção de Banco de Dados de Produção

## 📋 Visão Geral

O Sistema de Proteção de Banco de Dados garante que o banco de produção (`axengenharia1`) **NUNCA** seja afetado quando o sistema está operando em um banco de teste. Esta é uma camada crítica de segurança que previne modificações acidentais em dados de produção.

## 🎯 Objetivo

**REGRA DE OURO**: Quando qualquer banco de teste estiver selecionado, o banco de produção deve ser completamente isolado e protegido contra qualquer operação de escrita.

## 🛡️ Arquitetura de Proteção

### Camadas de Segurança

```
┌─────────────────────────────────────────────────────────────┐
│                    CAMADA 1: UI                              │
│  • Ícone de cadeado no banco de produção                     │
│  • Confirmação dupla ao sair de produção                     │
│  • Badge visual de ambiente (Produção/Teste)                 │
│  • Banco de produção marcado como não-selecionável           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                 CAMADA 2: API Backend                        │
│  • Validação em endpoint de seleção de banco                │
│  • Bloqueio de seleção de produção (HTTP 403)               │
│  • Teste de conexão antes de persistir                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              CAMADA 3: Dependência de Proteção               │
│  • validate_production_write_protection()                    │
│  • Aplicada em TODOS os endpoints de escrita                │
│  • Bloqueia operações quando banco ativo ≠ produção         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│               CAMADA 4: Funções de Validação                 │
│  • is_production_environment()                               │
│  • is_production_write_blocked()                             │
│  • Logs de auditoria para todas as tentativas               │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Implementação Técnica

### Backend

#### Constantes

```python
# backend/app/services/odoo_utils.py
PRODUCTION_DB_NAME = "axengenharia1"
```

#### Funções de Proteção

```python
def is_production_environment(db_name: str) -> bool:
    """Verifica se um banco é o ambiente de produção."""
    return db_name == PRODUCTION_DB_NAME

async def is_production_write_blocked(session: AsyncSession) -> bool:
    """
    Verifica se escritas em produção estão bloqueadas.
    
    Returns:
        True: Banco ativo NÃO é produção → BLOQUEAR escritas em produção
        False: Banco ativo É produção → PERMITIR escritas
    """
    active_db = await get_active_odoo_db(session)
    return not is_production_environment(active_db)
```

#### Dependência de Proteção

```python
# backend/app/api/deps.py
async def validate_production_write_protection(
    session: AsyncSession = Depends(get_session),
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Dependência que DEVE ser aplicada em TODOS os endpoints de escrita.
    
    Raises:
        HTTPException 403: Quando tentativa de escrita em produção é bloqueada
    """
    if await is_production_write_blocked(session):
        active_db = await get_active_odoo_db(session)
        logger.warning(
            f"🚫 PRODUCTION WRITE BLOCKED: User '{current_user.username}' "
            f"attempted write while active database is '{active_db}'"
        )
        raise HTTPException(
            status_code=403,
            detail=(
                f"Operação bloqueada: O banco ativo é '{active_db}' (teste). "
                f"Não é permitido modificar produção quando outro banco está ativo."
            )
        )
```

#### Uso em Endpoints

```python
@router.post("/batches")
async def create_batch(
    batch_data: BatchCreate,
    session: AsyncSession = Depends(get_session),
    _: None = Depends(validate_production_write_protection)  # ← PROTEÇÃO
):
    # Código do endpoint
    pass
```

### Frontend

#### Constantes e Tipos

```typescript
// frontend/src/app/components/DatabaseSelector.tsx
const PRODUCTION_DB_NAME = "axengenharia1";

interface Database {
  name: string;
  type: 'production' | 'test';
  selectable: boolean;
  is_active: boolean;
}
```

#### Funções de Detecção

```typescript
function isProductionEnvironment(dbName: string): boolean {
  return dbName === PRODUCTION_DB_NAME;
}

function isCurrentlyInProduction(databases: Database[]): boolean {
  const activeDb = databases.find(db => db.is_active);
  return activeDb ? isProductionEnvironment(activeDb.name) : false;
}
```

#### Componente de Badge

```typescript
function EnvironmentBadge({ databases }: EnvironmentBadgeProps) {
  const inProduction = isCurrentlyInProduction(databases);
  
  if (inProduction) {
    return (
      <div className="bg-green-50 border border-green-200">
        🟢 PRODUÇÃO ATIVA
      </div>
    );
  }
  
  return (
    <div className="bg-blue-50 border border-blue-200">
      🔵 AMBIENTE DE TESTE
      ✅ Banco de produção está protegido
    </div>
  );
}
```

## 🧪 Testes

### Casos de Teste Críticos

```python
# backend/tests/test_odoo_protection.py

@pytest.mark.asyncio
async def test_is_production_write_blocked_when_in_test():
    """
    CENÁRIO: Sistema operando em "teste-22-03"
    ESPERADO: Escritas em produção devem ser bloqueadas (retorna True)
    """
    # Mock para retornar banco de teste
    mocker.patch('get_active_odoo_db', return_value="teste-22-03")
    
    result = await is_production_write_blocked(mock_session)
    
    assert result is True

@pytest.mark.asyncio
async def test_is_production_write_blocked_when_in_production():
    """
    CENÁRIO: Sistema operando em "axengenharia1"
    ESPERADO: Escritas em produção devem ser permitidas (retorna False)
    """
    mocker.patch('get_active_odoo_db', return_value="axengenharia1")
    
    result = await is_production_write_blocked(mock_session)
    
    assert result is False
```

### Invariantes de Segurança

1. **Banco de produção NUNCA é selecionável**
   ```python
   assert is_selectable(classify_database(PRODUCTION_DB_NAME)) is False
   ```

2. **Proteção é inversa da detecção de produção**
   ```python
   # Se banco ativo É produção → escritas NÃO bloqueadas
   # Se banco ativo NÃO é produção → escritas bloqueadas
   ```

3. **Classificação é consistente**
   ```python
   if is_production_environment(db):
       assert classify_database(db) == "production"
   ```

## 📊 Fluxos de Uso

### Fluxo 1: Usuário em Produção

```
1. Usuário está em "axengenharia1" (produção)
2. Badge mostra: 🟢 PRODUÇÃO ATIVA
3. Usuário pode realizar operações normalmente
4. Todas as escritas são permitidas
```

### Fluxo 2: Troca para Teste

```
1. Usuário está em "axengenharia1" (produção)
2. Seleciona "teste-22-03"
3. Sistema exibe confirmação:
   ⚠️ "Você está saindo do ambiente de PRODUÇÃO"
4. Usuário confirma
5. Sistema troca para teste
6. Badge muda para: 🔵 AMBIENTE DE TESTE
7. Mensagem: ✅ Banco de produção está protegido
```

### Fluxo 3: Tentativa de Escrita Bloqueada

```
1. Usuário está em "teste-22-03" (teste)
2. Sistema tenta criar um batch
3. Dependência validate_production_write_protection() é executada
4. Detecta: banco ativo ≠ produção
5. Bloqueia operação com HTTP 403
6. Log de auditoria é gerado:
   🚫 PRODUCTION WRITE BLOCKED: User 'joao' attempted write 
      while active database is 'teste-22-03'
7. Usuário recebe mensagem:
   "Operação bloqueada: O banco ativo é 'teste-22-03' (teste).
    Não é permitido modificar produção quando outro banco está ativo."
```

### Fluxo 4: Tentativa de Selecionar Produção (Bloqueada)

```
1. Usuário está em "teste-22-03" (teste)
2. Tenta selecionar "axengenharia1" no dropdown
3. Opção aparece como: 🔒 🟢 axengenharia1 (Protegido)
4. Opção está desabilitada (disabled)
5. Aviso exibido:
   🔒 "Banco de produção protegido — seleção desabilitada"
6. Botão "Salvar" permanece desabilitado
```

## 🔍 Logs de Auditoria

### Eventos Registrados

```python
# Tentativa de seleção de produção bloqueada
logger.warning(
    f"🚫 Production database selection attempt blocked: {db_name}"
)

# Tentativa de escrita em produção bloqueada
logger.warning(
    f"🚫 PRODUCTION WRITE BLOCKED: User '{username}' "
    f"attempted write while active database is '{active_db}'"
)

# Troca de banco bem-sucedida
logger.info(
    f"✅ Active Odoo database updated to: {db_name} by user {username}"
)

# Escritas em produção permitidas (quando em produção)
logger.debug(
    f"✓ Production write allowed for user '{username}'"
)
```

## ✅ Checklist de Segurança

Antes de considerar o sistema completo, verificar:

- [x] Banco de produção tem flag `isProduction: true` hardcoded
- [x] Impossível remover banco de produção da lista
- [x] Toda operação de escrita valida o ambiente atual
- [x] Dependência de proteção aplicada em endpoints críticos
- [x] Confirmação ao sair de produção
- [x] Indicador visual claro do ambiente atual
- [x] Validação de URL ao adicionar novo banco
- [x] Logs de auditoria para trocas de ambiente
- [x] Testes unitários para funções de proteção
- [x] Documentação completa do sistema

## 🚨 Endpoints que DEVEM Usar Proteção

Todos os endpoints que realizam operações de escrita (POST, PUT, PATCH, DELETE) que possam afetar dados do Odoo devem incluir a dependência:

```python
_: None = Depends(validate_production_write_protection)
```

### Exemplos de Endpoints Protegidos

- `POST /api/v1/batches` - Criar lote
- `POST /api/v1/id-requests` - Criar requisição de ID
- `PUT /api/v1/id-requests/{id}` - Atualizar requisição
- `POST /api/v1/andon/calls` - Criar chamado Andon
- `PUT /api/v1/andon/calls/{id}/resolve` - Resolver chamado
- `DELETE /api/v1/batches/{id}` - Deletar lote

### Endpoints que NÃO Precisam de Proteção

- Endpoints de leitura (GET)
- Endpoints de autenticação
- Endpoints de configuração local (não afetam Odoo)
- Webhooks do Odoo (já validados por secret)

## 🔄 Manutenção

### Adicionar Novo Banco de Teste

1. Usuário acessa Configurações → Banco de Dados
2. Seleciona novo banco no dropdown (se já listado pelo Odoo)
3. Sistema valida que não é produção
4. Testa conexão
5. Persiste em `system_setting.active_odoo_db`

### Alterar Nome do Banco de Produção

Se o banco de produção mudar de nome (improvável), atualizar:

1. Backend: `PRODUCTION_DB_NAME` em `odoo_utils.py`
2. Frontend: `PRODUCTION_DB_NAME` em `DatabaseSelector.tsx`
3. Testes: Atualizar casos de teste
4. Documentação: Atualizar este documento

## 📚 Referências

- [Conventional Commits](https://www.conventionalcommits.org/)
- [FastAPI Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/)
- [React Hooks](https://react.dev/reference/react)
- [SQLModel Async](https://sqlmodel.tiangolo.com/tutorial/async/)

## 🆘 Troubleshooting

### Problema: "Operação bloqueada" mesmo estando em produção

**Causa**: Cache de banco ativo desatualizado

**Solução**:
```python
from app.services.cache_service import invalidate_cache_pattern
await invalidate_cache_pattern("odoo_mos:")
```

### Problema: Não consigo selecionar nenhum banco

**Causa**: Todos os bancos estão marcados como `selectable: false`

**Solução**: Verificar função `is_selectable()` e classificação de bancos

### Problema: Badge não atualiza após trocar banco

**Causa**: Estado do React não foi atualizado

**Solução**: Verificar se `loadDatabases()` é chamado após `handleSave()`

---

**Última atualização**: 28 de maio de 2026  
**Versão**: 1.0.0  
**Autor**: Sistema ID Visual AX
