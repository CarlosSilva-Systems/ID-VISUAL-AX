# Design Document — Andon TV: Notificações e Síntese de Voz

## Overview

Este documento descreve a arquitetura e as decisões de design para as melhorias do módulo Andon TV, cobrindo o ciclo completo de notificações de ID Visual, síntese de voz (TTS), destaque visual piscante, reset de dados e profissionalização do registro de eventos.

---

## Architecture

### Fluxo de Dados

```
Odoo (workcenters)
        │
        ▼
FastAPI /api/v1/andon/tv-data  ◄── PostgreSQL (AndonCall, IDRequest, AndonStatus)
        │
        │  JSON: { version, workcenters, calls, id_requests, recent_events }
        ▼
AndonTVProvider (React Context)
  - Polling a cada 8s
  - Deduplicação via seenEventKeys (Set em memória)
  - Geração de TVLog via eventToLog()
  - TTS via speakPtBR() (Web Speech API)
  - Persistência em localStorage (chave: andon_tv_logs)
        │
        ▼
AndonTV.tsx (componente de renderização)
  - Carrossel de painéis (12s por painel)
  - LogPanel com seção fixa (blinking) + timeline normal
```

---

## Components and Interfaces

### Backend

#### `GET /api/v1/andon/tv-data`
Endpoint principal de polling. Retorna:
- `version`: string de versão para deduplicação no frontend
- `workcenters`: lista de workcenters com status calculado
- `calls`: chamados ativos (OPEN | IN_PROGRESS)
- `id_requests`: solicitações de ID Visual ativas/recentes
- `recent_events`: últimos 60 eventos das últimas 24h, ordenados do **mais recente para o mais antigo**

Cada evento em `recent_events` inclui obrigatoriamente o campo `entity_id` para deduplicação correta no frontend.

#### `DELETE /api/v1/andon/reset`
Endpoint de reset para limpeza de dados de teste:
- Deleta `AndonCall` ativos criados nos últimos 7 dias
- Deleta `IDRequest` com `source="manual"` em estados abertos (`nova`, `triagem`, `em_lote`)
- Reseta todos os `AndonStatus` para `cinza`
- Incrementa `andon_version` para forçar re-render no frontend
- Retorna `{ calls_deleted, id_requests_deleted, statuses_reset }`

### Frontend

#### `AndonTVContext.tsx`

**`eventToLog(ev)`** — Parser de eventos:
- Entrada: objeto JSON do backend com `event_type` e metadados
- Saída: `TVLog | null`
- Mapeamento de tipos:
  - `CALL_OPENED` → `AMARELO` ou `VERMELHO` (baseado em `color`)
  - `CALL_IN_PROGRESS` → `INFO`
  - `CALL_RESOLVED` → `RESOLVIDO`
  - `IDVISUAL_CREATED` (source=manual) → `ID_VISUAL_PENDENTE`
  - `IDVISUAL_STARTED` → `ID_VISUAL_EM_ANDAMENTO`
  - `IDVISUAL_DONE` → `ID_VISUAL_OK` (com `blinking: true`, `finishedAt`)
  - `IDVISUAL_TRANSFERRED` → `ID_VISUAL_TRANSFERRED` (laranja)
- Valida campos obrigatórios antes de retornar; loga erro e retorna `null` se ausentes

**`formatLogForDebug(log)`** — Pretty printer:
- Serializa `TVLog` em JSON indentado (2 espaços)
- Omite campos opcionais quando `undefined`/`null`
- Timestamps em ISO 8601

**`speakPtBR(text)`** — TTS Engine:
- Usa `window.speechSynthesis` (Web Speech API)
- Seleciona voz `pt-BR` se disponível
- Cancela fala anterior antes de iniciar nova
- Retorna `boolean` indicando sucesso
- Falha silenciosa com `console.warn` se API indisponível

**`AndonTVProvider`** — Provider de estado:
- Polling a cada 8s com comparação de versão
- Deduplicação via `seenEventKeys` (Set em memória, não persiste no localStorage)
- Chave de deduplicação: `{event_type}:{entity_id}:{suffix}` onde suffix ∈ {O, P, R, D}
- TTS disparado para cada `IDVISUAL_DONE` novo
- `ttsBlocked: boolean` exposto no contexto para fallback visual
- Cleanup a cada 60s:
  - Remove `ID_VISUAL_OK` com mais de 24h desde `finishedAt`
  - Desativa `blinking` em logs com mais de 5min desde `finishedAt`

#### `AndonTV.tsx`

**`LogItem`** — Item da timeline:
- Flash de chegada (2s) para logs com `highlight: true`
- Piscar lento (`animate-pulse bg-emerald-900/40`) para logs com `blinking: true`
- Sincroniza estado `blink` com mudanças externas do context (desativação após 5min)

**`LogPanel`** — Painel lateral direito:
- Seção fixa no topo para logs com `blinking: true` (ID_VISUAL_OK piscantes)
- Timeline normal abaixo para demais logs
- Ícone de fallback `Volume2` pulsante quando `ttsBlocked: true`

---

## Data Models

### `TVLog` (TypeScript)
```typescript
interface TVLog {
    id: string;           // makeLogId() — timestamp + random
    timestamp: string;    // ISO 8601
    type: LogType;        // enum de tipos de log
    source: string;       // 'Produção' | 'Engenharia' | 'Mesa' | 'Sistema'
    text: string;         // texto principal da mensagem
    requester?: string;   // nome do solicitante (opcional)
    highlight?: boolean;  // flash de chegada (2s)
    blinking?: boolean;   // piscar lento (5min, apenas ID_VISUAL_OK)
    finishedAt?: string;  // ISO 8601 — base para expiração e timer de blinking
}
```

### Eventos do Backend (`recent_events`)
Cada evento contém obrigatoriamente:
- `event_type`: string identificando o tipo
- `entity_id`: ID da entidade (AndonCall.id ou IDRequest.id como string)
- Campos específicos por tipo (ver Req 8)

---

## Error Handling

- **TTS bloqueado**: `speakPtBR` retorna `false`; context seta `ttsBlocked: true`; LogPanel exibe ícone pulsante
- **Web Speech API indisponível**: `console.warn` + retorna `false`; sem crash
- **Campos obrigatórios ausentes no log**: `console.error` + retorna `null`; evento descartado silenciosamente
- **Polling falha**: `isConnected: false`; banner de reconexão exibido no topo da TV
- **Reset endpoint falha**: rollback de sessão + HTTPException 500 com `request_id`

---

## Decisions

### Por que `blinking` separado de `highlight`?
`highlight` é um flash de chegada de 2s (qualquer tipo de log). `blinking` é um estado persistente de 5min exclusivo para `ID_VISUAL_OK`. Separar os dois permite que o flash de chegada funcione independentemente do piscar contínuo.

### Por que logs piscantes ficam fixos no topo?
Req 5 AC 4 exige que a mensagem permaneça fixa enquanto pisca. Separar em duas seções no `LogPanel` (blinking fixo + normal scrollável) é mais simples e robusto do que tentar fixar itens dentro de uma lista scrollável.

### Por que `seenEventKeys` não persiste no localStorage?
Após reload, o frontend deve reprocessar os eventos das últimas 24h para reconstruir o log. Se as chaves persistissem, eventos recentes não seriam exibidos após um reload. O localStorage persiste apenas os `TVLog` já formatados.

### Por que o backend ordena `recent_events` do mais recente para o mais antigo?
O frontend inverte o array antes de processar (para processar do mais antigo ao mais recente e manter ordem cronológica no log). A ordenação reversa no backend é a convenção natural para APIs de feed.
