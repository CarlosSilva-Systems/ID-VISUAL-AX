# ⚠️ INSTRUÇÕES URGENTES - REINICIAR BACKEND E FRONTEND

## 🔴 PROBLEMA IDENTIFICADO

O endpoint `/api/v1/ota/devices/count` **EXISTE NO CÓDIGO** mas **NÃO ESTÁ DISPONÍVEL** porque:

1. ✅ O código está correto
2. ✅ A rota está registrada no `api.py`
3. ❌ **O BACKEND EM EXECUÇÃO NÃO FOI REINICIADO**

## ✅ SOLUÇÃO (SIGA EXATAMENTE NESTA ORDEM)

### PASSO 1: PARAR O BACKEND

No terminal onde o backend está rodando:
1. Pressione `Ctrl+C` para parar o servidor
2. Aguarde até ver a mensagem de encerramento

### PASSO 2: REINICIAR O BACKEND

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

**OU** se estiver usando Docker:
```bash
docker compose restart api
```

### PASSO 3: VERIFICAR QUE O BACKEND REINICIOU

Abra um novo terminal e execute:
```bash
curl http://localhost:8000/api/v1/ota/devices/count
```

**Resposta esperada** (pode dar erro de autenticação, mas NÃO deve dar 404):
```json
{"detail":"Not authenticated"}
```

**OU** com autenticação (substitua TOKEN pelo seu token real):
```bash
curl -H "Authorization: Bearer SEU_TOKEN_AQUI" http://localhost:8000/api/v1/ota/devices/count
```

**Resposta esperada**:
```json
{"total":3,"online":1,"offline":2,"root_count":2,"mesh_count":1}
```

### PASSO 4: PARAR O FRONTEND

No terminal onde o frontend está rodando:
1. Pressione `Ctrl+C`
2. Aguarde até o processo encerrar

### PASSO 5: REINICIAR O FRONTEND

```bash
cd frontend
npm run dev
```

### PASSO 6: TESTAR NO NAVEGADOR

1. Abra `http://localhost:5173/admin/ota-settings`
2. Clique em "Disparar OTA" em qualquer firmware
3. O modal deve mostrar:
   - ✅ **Dispositivos Cadastrados: 3**
   - ✅ **1 Online, 2 Offline**
   - ✅ **SEM ERROS 404 NO CONSOLE**

## 🔍 VERIFICAÇÃO ADICIONAL

Se ainda houver erro 404 após reiniciar:

### Teste 1: Backend Direto
```bash
curl http://localhost:8000/api/v1/health
```
Deve retornar: `{"status":"ok","backend":"running"}`

### Teste 2: Proxy do Vite
```bash
curl http://localhost:5173/api/v1/health
```
Deve retornar: `{"status":"ok","backend":"running"}`

### Teste 3: Endpoint OTA via Proxy
```bash
curl http://localhost:5173/api/v1/ota/devices/count
```
Deve retornar erro de autenticação (não 404)

## 📋 CHECKLIST

- [ ] Backend parado (Ctrl+C)
- [ ] Backend reiniciado (`uvicorn app.main:app --reload --port 8000`)
- [ ] Teste: `curl http://localhost:8000/api/v1/ota/devices/count` (não retorna 404)
- [ ] Frontend parado (Ctrl+C)
- [ ] Frontend reiniciado (`npm run dev`)
- [ ] Teste no navegador: modal OTA mostra 3 dispositivos
- [ ] Console do navegador: SEM erros 404

## ❓ SE AINDA NÃO FUNCIONAR

Execute o script de diagnóstico:
```bash
cd backend
python test_ota_endpoint.py
```

Deve mostrar:
```
✅ /api/v1/ota/devices/count ENCONTRADO!
```

Se mostrar "NÃO ENCONTRADO", há um problema no código que precisa ser investigado.

---

**IMPORTANTE**: O problema NÃO é no código. O código está correto. O problema é que os servidores (backend e frontend) precisam ser reiniciados para carregar as mudanças.
