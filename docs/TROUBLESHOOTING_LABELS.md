# Troubleshooting - Sistema de Etiquetas

## Problemas Identificados e Soluções

### 1. Endpoint de Presets Não Encontrado (404)

**Sintoma**: Erro ao tentar criar ou listar presets de porta do quadro.

**Causa**: O backend não foi reiniciado após a adição do novo endpoint `door_presets`.

**Solução**:
```bash
# Parar o backend (Ctrl+C no terminal onde está rodando)
# Depois reiniciar:
cd backend
uvicorn app.main:app --reload --port 8000
```

Ou se estiver usando Docker:
```bash
docker compose restart api
```

**Verificação**:
```bash
curl http://localhost:8000/api/v1/id-visual/door-presets?filter_type=system
```

Deve retornar os 5 presets do sistema.

---

### 2. Botão de Floating Viewer Não Aparece

**Sintoma**: Não há botão "Pop-up" no visualizador de documentos.

**Causa**: O componente `LoteDoDia` precisa passar o callback `onOpenFloating` para o hook `useDocViewer`.

**Verificação**:
1. Abra o Lote do Dia
2. Clique em "Ver Documentos" em qualquer MO
3. No header do modal, deve aparecer um botão roxo com ícone de pin: **"📌 Pop-up"**
4. Clique nele para transformar o documento em janela flutuante

**Se não aparecer**:
- Verifique se o frontend foi recompilado (Vite deve fazer hot-reload automático)
- Force refresh no navegador (Ctrl+Shift+R)
- Verifique o console do navegador para erros

---

### 3. Erro ao Adicionar Adesivo de Componente

**Sintomas Possíveis**:
- Erro 422: "mo_id deve ser um UUID válido"
- Erro 409: "Tag já existe para esta MO"
- Erro 500: Erro interno do servidor

**Soluções**:

#### Erro 422 (UUID inválido):
- Verifique se a MO tem `odoo_mo_id` preenchido
- O `odoo_mo_id` deve ser um UUID válido (formato: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

#### Erro 409 (Tag duplicada):
- A tag já existe para esta MO
- Use uma tag diferente ou delete a existente primeiro

#### Erro 500:
- Verifique os logs do backend:
```bash
# No terminal onde o backend está rodando
# Procure por linhas com [ERROR] ou traceback
```

**Teste Manual do Endpoint**:
```bash
# Substitua {mo_id} pelo UUID real da MO
curl -X POST "http://localhost:8000/api/v1/id-visual/eplan/{mo_id}/devices/manual" \
  -H "Content-Type: application/json" \
  -d '{"device_tag": "K1"}'
```

---

### 4. Erro ao Criar Preset Personalizado

**Sintomas**:
- Botão "Criar Preset" não funciona
- Erro ao salvar preset
- Preset não aparece na lista

**Verificações**:

1. **Backend rodando?**
```bash
curl http://localhost:8000/api/v1/health
```

2. **Migração aplicada?**
```bash
cd backend
uv run alembic current
# Deve mostrar: 1fdc03c468fd (head)
```

3. **Tabelas criadas?**
```bash
# Conecte ao PostgreSQL e verifique:
\dt door_label_preset*
```

4. **Teste direto do endpoint**:
```bash
curl -X POST "http://localhost:8000/api/v1/id-visual/door-presets" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Teste",
    "category": "custom",
    "equipment_name": "TESTE",
    "columns": ["A", "B"],
    "rows": 1,
    "is_shared": false
  }'
```

---

## Checklist de Diagnóstico Completo

Execute estes comandos na ordem para diagnosticar problemas:

### Backend:

```bash
# 1. Verificar se está rodando
curl http://localhost:8000/api/v1/health

# 2. Verificar migração
cd backend
uv run alembic current

# 3. Testar endpoint de presets
curl http://localhost:8000/api/v1/id-visual/door-presets?filter_type=system

# 4. Testar endpoint de dispositivos (substitua {mo_id})
curl http://localhost:8000/api/v1/id-visual/eplan/{mo_id}/devices

# 5. Ver logs em tempo real
# (no terminal onde o backend está rodando)
```

### Frontend:

```bash
# 1. Verificar se está rodando
curl http://localhost:5173

# 2. Verificar console do navegador
# Abra DevTools (F12) → Console
# Procure por erros em vermelho

# 3. Verificar Network
# DevTools → Network → XHR
# Veja as requisições falhando e seus status codes
```

### Banco de Dados:

```bash
# Conectar ao PostgreSQL
psql -U postgres -d id_visual_ax

# Verificar tabelas
\dt door_label_preset*
\dt device_label*

# Verificar presets do sistema
SELECT id, name, category, is_system FROM door_label_preset WHERE is_system = true;

# Verificar dispositivos de uma MO (substitua o UUID)
SELECT * FROM device_label WHERE mo_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
```

---

## Reinício Completo (Solução Definitiva)

Se nada funcionar, faça um reinício completo:

```bash
# 1. Parar tudo
# Ctrl+C no terminal do backend
# Ctrl+C no terminal do frontend

# 2. Limpar cache do navegador
# Ctrl+Shift+Delete → Limpar tudo

# 3. Reiniciar backend
cd backend
uv run uvicorn app.main:app --reload --port 8000

# 4. Reiniciar frontend (em outro terminal)
cd frontend
npm run dev

# 5. Abrir navegador em modo anônimo
# Ctrl+Shift+N (Chrome) ou Ctrl+Shift+P (Firefox)
# Acessar: http://localhost:5173
```

---

## Logs Úteis

### Backend (FastAPI):
```
INFO:     127.0.0.1:xxxxx - "POST /api/v1/id-visual/eplan/{mo_id}/devices/manual HTTP/1.1" 200 OK
INFO:     [eplan] create_device_manual mo_id={uuid} tag=K1
```

### Frontend (Console):
```javascript
// Sucesso
POST http://localhost:8000/api/v1/id-visual/eplan/{mo_id}/devices/manual 200 OK

// Erro
POST http://localhost:8000/api/v1/id-visual/eplan/{mo_id}/devices/manual 422 Unprocessable Entity
```

---

## Contato para Suporte

Se os problemas persistirem após seguir este guia:

1. Capture screenshots dos erros
2. Copie os logs do backend
3. Copie os erros do console do navegador (F12)
4. Descreva o passo a passo para reproduzir o erro
