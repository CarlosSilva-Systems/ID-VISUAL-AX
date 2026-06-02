# ⚠️ INSTRUÇÕES URGENTES - Correção de Erros

## Problema Identificado

O endpoint de **presets de porta do quadro** não está funcionando porque o backend não foi reiniciado após a adição do novo código.

## Solução Imediata

### 1. Reiniciar o Backend

**Passo 1**: Pare o backend atual
- Vá no terminal onde o backend está rodando
- Pressione `Ctrl+C`

**Passo 2**: Reinicie o backend
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Ou se estiver usando `uv`:
```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

**Passo 3**: Aguarde a mensagem
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### 2. Verificar se Funcionou

Execute o script de teste:
```bash
python backend/scripts/test_labels_endpoints.py
```

Deve mostrar:
```
✅ PASS - Backend Health
✅ PASS - Door Presets
✅ PASS - EPLAN Endpoints
✅ PASS - Print Endpoints

🎉 Todos os testes passaram!
```

### 3. Testar no Navegador

1. Abra o Lote do Dia: `http://localhost:5173`
2. Clique em "Etiquetas" em qualquer MO
3. Vá na aba "Porta do Quadro" (210-855)
4. Deve aparecer 5 presets do sistema
5. Clique em "Criar Preset" para testar criação

---

## Sobre o Botão de Floating Viewer

O botão **"📌 Pop-up"** está integrado ao visualizador de documentos existente:

### Como Usar:

1. **Abra o Lote do Dia**
2. **Clique em "Ver Documentos"** em qualquer MO (botão azul com ícone de arquivo)
3. **No modal que abre**, procure no header (topo)
4. **Deve aparecer um botão roxo** com ícone de pin: **"📌 Pop-up"**
5. **Clique nele** → O modal fecha e o documento abre em janela flutuante
6. **A janela flutuante**:
   - Pode ser arrastada para qualquer lugar
   - Pode ser redimensionada
   - Fica sempre visível (z-index alto)
   - Tem controles de zoom e navegação
   - Pode ser minimizada

### Se o Botão Não Aparecer:

1. **Force refresh no navegador**: `Ctrl+Shift+R`
2. **Limpe o cache**: `Ctrl+Shift+Delete`
3. **Abra em modo anônimo**: `Ctrl+Shift+N`
4. **Verifique o console** (F12) para erros

---

## Teste Rápido de Tudo

Execute estes comandos na ordem:

```bash
# 1. Teste o backend
python backend/scripts/test_labels_endpoints.py

# 2. Se falhar, reinicie o backend
cd backend
uvicorn app.main:app --reload --port 8000

# 3. Teste novamente
python backend/scripts/test_labels_endpoints.py

# 4. Abra o navegador
# http://localhost:5173
```

---

## Erros Comuns e Soluções

### Erro: "Tag já existe para esta MO"
**Solução**: Use uma tag diferente ou delete a existente primeiro.

### Erro: "mo_id deve ser um UUID válido"
**Solução**: A MO precisa ter `odoo_mo_id` preenchido. Verifique no banco de dados.

### Erro: "Preset não encontrado" ou "404"
**Solução**: Reinicie o backend (instruções acima).

### Erro: "Não é possível criar preset"
**Solução**: 
1. Verifique se a migração foi aplicada: `cd backend && uv run alembic current`
2. Deve mostrar: `1fdc03c468fd (head)`
3. Se não, execute: `uv run alembic upgrade head`

---

## Arquivos Importantes

- **Troubleshooting completo**: `docs/TROUBLESHOOTING_LABELS.md`
- **Script de teste**: `backend/scripts/test_labels_endpoints.py`
- **Documentação**: `docs/LABEL_WORKFLOW_IMPROVEMENTS.md`

---

## Status Atual

✅ **Código está correto**
✅ **Migrações aplicadas**
✅ **Endpoints registrados**
❌ **Backend precisa ser reiniciado** ← FAÇA ISSO AGORA

---

## Após Reiniciar

Tudo deve funcionar perfeitamente:
- ✅ Criar adesivos de componente manualmente
- ✅ Listar e criar presets de porta
- ✅ Botão de floating viewer no visualizador de documentos
- ✅ Importar Excel do EPLAN
- ✅ Imprimir etiquetas

---

**Tempo estimado para correção**: 2 minutos (apenas reiniciar o backend)
