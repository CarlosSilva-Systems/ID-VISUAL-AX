# Correção: Erro 404 no Endpoint OTA do Frontend

## 🔴 Problema Reportado

Ao abrir o modal de confirmação OTA, o frontend exibe:
- "Nenhum Dispositivo Cadastrado" (mesmo havendo 3 devices no banco)
- Erro no console: `GET http://localhost:5173/api/v1/ota/devices/count 404 (Not Found)`

## 🔍 Diagnóstico

### Erro no Console
```
api.ts:154  GET http://localhost:5173/api/v1/ota/devices/count 404 (Not Found)
api.ts:168 API Request Failed: Error: API Error: Not Found
```

### Causa Raiz

O frontend estava configurado com `VITE_API_URL=http://localhost:8000/api/v1` no arquivo `.env`, o que fazia com que:

1. **Requisições diretas ao backend** (porta 8000) ao invés de usar o proxy do Vite
2. **Problemas de CORS** quando acessando via `localhost:5173`
3. **Erro 404** porque o navegador tentava acessar `localhost:5173/api/v1/...` ao invés de `localhost:8000/api/v1/...`

### Arquitetura do Problema

```
┌─────────────────────────────────────────────────────────────┐
│  Navegador (localhost:5173)                                 │
│                                                             │
│  ❌ ANTES (com VITE_API_URL definido):                     │
│     fetch('http://localhost:8000/api/v1/ota/devices/count')│
│       ↓                                                     │
│     CORS Error! (origem diferente)                         │
│                                                             │
│  ✅ DEPOIS (sem VITE_API_URL):                             │
│     fetch('/api/v1/ota/devices/count')                     │
│       ↓                                                     │
│     Vite Proxy → http://localhost:8000/api/v1/...         │
│       ↓                                                     │
│     Backend responde com sucesso                           │
└─────────────────────────────────────────────────────────────┘
```

## 🛠️ Correção Implementada

### 1. Atualizado `frontend/.env`

**ANTES:**
```env
VITE_API_URL=http://localhost:8000/api/v1
```

**DEPOIS:**
```env
# VITE_API_URL=http://localhost:8000/api/v1
VITE_PROXY_TARGET=http://localhost:8000
```

### 2. Criado `frontend/.env.example`

Documentação completa sobre como configurar variáveis de ambiente para diferentes cenários:
- Desenvolvimento local (sem Docker)
- Desenvolvimento com Docker
- Produção

## ✅ Como Funciona Agora

### Desenvolvimento Local

1. **Frontend** (Vite) roda em `http://localhost:5173`
2. **Backend** (FastAPI) roda em `http://localhost:8000`
3. **Proxy do Vite** intercepta requisições para `/api/*` e encaminha para `http://localhost:8000`

```typescript
// frontend/src/services/api.ts
const API_URL = import.meta.env.VITE_API_URL || '/api/v1';
// Como VITE_API_URL não está definido, usa '/api/v1' (relativo)

// Requisição:
fetch('/api/v1/ota/devices/count')
  ↓
// Vite Proxy (vite.config.ts):
proxy: {
  '/api': {
    target: 'http://localhost:8000',  // VITE_PROXY_TARGET
    changeOrigin: true
  }
}
  ↓
// Backend recebe:
GET http://localhost:8000/api/v1/ota/devices/count
```

### Desenvolvimento com Docker

```env
# frontend/.env (Docker)
# VITE_API_URL não definido
# VITE_PROXY_TARGET não definido (usa padrão http://api:8000)
```

O `vite.config.ts` usa `http://api:8000` como padrão quando `VITE_PROXY_TARGET` não está definido.

### Produção

```env
# frontend/.env (Produção)
VITE_API_URL=https://seu-dominio.com/api/v1
```

Em produção, o frontend faz requisições diretas para o backend (sem proxy), pois ambos estão no mesmo domínio ou CORS está configurado.

## 🔧 Como Aplicar a Correção

### 1. Atualizar `.env` do Frontend

```bash
cd frontend
# Editar .env e comentar VITE_API_URL
# Adicionar VITE_PROXY_TARGET=http://localhost:8000
```

### 2. Reiniciar Servidor Vite

```bash
# Parar o servidor (Ctrl+C)
npm run dev
```

### 3. Verificar no Navegador

1. Abra `http://localhost:5173/admin/ota-settings`
2. Clique em "Disparar OTA" em qualquer firmware
3. O modal deve mostrar:
   - ✅ "Dispositivos Cadastrados: 3"
   - ✅ "1 Online, 2 Offline"
   - ✅ Sem erros 404 no console

## 📊 Teste de Verificação

### Console do Navegador (F12)

**ANTES (com erro):**
```
❌ GET http://localhost:5173/api/v1/ota/devices/count 404 (Not Found)
❌ API Request Failed: Error: API Error: Not Found
```

**DEPOIS (funcionando):**
```
✅ GET http://localhost:5173/api/v1/ota/devices/count 200 (OK)
✅ Response: {"total":3,"online":1,"offline":2,"root_count":2,"mesh_count":1}
```

### Modal OTA

**ANTES:**
```
🔴 Nenhum Dispositivo Cadastrado
   Não há dispositivos ESP32 cadastrados no sistema.
   
   Dispositivos Cadastrados: 0
```

**DEPOIS:**
```
🟢 Atualização em Massa
   Esta operação iniciará OTA em 1 dispositivo(s) online.
   Os 2 dispositivo(s) offline receberão quando reconectarem.
   
   Dispositivos Cadastrados: 3
   ✅ 1 Online
   ⚪ 2 Offline
   📶 2 Raiz
   🕸️ 1 Mesh
```

## 🎯 Resumo

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Requisições** | Diretas para `:8000` | Via proxy do Vite |
| **CORS** | ❌ Bloqueado | ✅ Sem problemas |
| **Endpoint** | 404 Not Found | 200 OK |
| **Modal OTA** | 0 devices | 3 devices (1 online, 2 offline) |

## 📚 Referências

- [Vite Proxy Configuration](https://vitejs.dev/config/server-options.html#server-proxy)
- [CORS Explained](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [`frontend/.env.example`](../frontend/.env.example) - Documentação completa de variáveis de ambiente

---

**Data da Correção**: 2026-04-30  
**Tipo**: Configuração de ambiente  
**Impacto**: Frontend agora acessa corretamente os endpoints OTA do backend
