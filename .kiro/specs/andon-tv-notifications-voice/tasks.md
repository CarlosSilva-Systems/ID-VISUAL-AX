# Tasks — Andon TV: Notificações e Síntese de Voz

## Task List

### Task 1: Corrigir ordenação de `recent_events` e adicionar `entity_id`
- **Status**: ✅ Concluído
- **Arquivo**: `backend/app/api/api_v1/endpoints/andon.py`
- **O que foi feito**:
  - Adicionado campo `entity_id` em todos os eventos de `recent_events` (AndonCall.id e IDRequest.id)
  - Corrigida ordenação para `reverse=True` (mais recente primeiro, conforme Req 8 AC 7)
  - Adicionado `import traceback` para uso no handler de erro do endpoint
- **Commit**: `feat(andon): adiciona endpoint DELETE /andon/reset e entity_id nos eventos tv-data`

### Task 2: Implementar endpoint `DELETE /api/v1/andon/reset`
- **Status**: ✅ Concluído
- **Arquivo**: `backend/app/api/api_v1/endpoints/andon.py`
- **O que foi feito**:
  - Endpoint `DELETE /reset` que deleta chamados ativos recentes, IDRequests manuais abertos e reseta AndonStatus
  - Retorna contadores `{ calls_deleted, id_requests_deleted, statuses_reset }`
  - Incrementa `andon_version` para forçar atualização do frontend
  - Tratamento de erro com rollback e `request_id`
- **Commit**: `feat(andon): adiciona endpoint DELETE /andon/reset e entity_id nos eventos tv-data`

### Task 3: Implementar TTS (Web Speech API) para `IDVISUAL_DONE`
- **Status**: ✅ Concluído
- **Arquivo**: `frontend/src/app/components/AndonTVContext.tsx`
- **O que foi feito**:
  - Função `speakPtBR(text)` usando `window.speechSynthesis`
  - Seleção automática de voz `pt-BR`
  - Cancelamento de fala anterior antes de nova síntese
  - Retorna `boolean` para detecção de bloqueio
  - TTS disparado para cada `IDVISUAL_DONE` novo no polling
  - `ttsBlocked` exposto no contexto para fallback visual
- **Commit**: `feat(andon-tv): implementa TTS pt-BR, expiração 24h, blinking 5min e log de transferência`

### Task 4: Corrigir expiração de `ID_VISUAL_OK` de 2h para 24h
- **Status**: ✅ Concluído
- **Arquivo**: `frontend/src/app/components/AndonTVContext.tsx`
- **O que foi feito**:
  - Constante `LOG_EXPIRY_MS = 24 * 60 * 60 * 1000` (24 horas)
  - Cleanup a cada 60s remove logs `ID_VISUAL_OK` com mais de 24h desde `finishedAt`
- **Commit**: `feat(andon-tv): implementa TTS pt-BR, expiração 24h, blinking 5min e log de transferência`

### Task 5: Implementar blinking de 5 minutos para `ID_VISUAL_OK`
- **Status**: ✅ Concluído
- **Arquivos**: `frontend/src/app/components/AndonTVContext.tsx`, `frontend/src/app/components/AndonTV.tsx`
- **O que foi feito**:
  - Campo `blinking: boolean` adicionado ao tipo `TVLog`
  - Constante `BLINK_DURATION_MS = 5 * 60 * 1000`
  - Cleanup desativa `blinking` após 5min desde `finishedAt`
  - `LogItem` usa `animate-pulse bg-emerald-900/40` quando `blinking: true`
  - `LogPanel` separa logs piscantes em seção fixa no topo (Req 5 AC 4)
- **Commit**: `feat(andon-tv): implementa TTS pt-BR, expiração 24h, blinking 5min e log de transferência` + `feat(andon-tv): atualiza LogItem com blinking, LogPanel com seção fixa e fallback TTS`

### Task 6: Implementar log de `IDVISUAL_TRANSFERRED` (laranja)
- **Status**: ✅ Concluído
- **Arquivo**: `frontend/src/app/components/AndonTVContext.tsx`
- **O que foi feito**:
  - `eventToLog` agora gera log do tipo `ID_VISUAL_TRANSFERRED` para evento `IDVISUAL_TRANSFERRED`
  - Texto: "Transferida para fila de produção."
  - Badge laranja (`text-orange-400`) — já existia no `LOG_STYLES` do `AndonTV.tsx`
- **Commit**: `feat(andon-tv): implementa TTS pt-BR, expiração 24h, blinking 5min e log de transferência`

### Task 7: Implementar `formatLogForDebug` (Pretty Printer)
- **Status**: ✅ Concluído
- **Arquivo**: `frontend/src/app/components/AndonTVContext.tsx`
- **O que foi feito**:
  - Função `formatLogForDebug(log: TVLog): string` exportada
  - JSON indentado com 2 espaços
  - Timestamps em ISO 8601
  - Campos opcionais omitidos quando `undefined`/`null`
- **Commit**: `feat(andon-tv): implementa TTS pt-BR, expiração 24h, blinking 5min e log de transferência`

### Task 8: Validação de campos obrigatórios no parser
- **Status**: ✅ Concluído
- **Arquivo**: `frontend/src/app/components/AndonTVContext.tsx`
- **O que foi feito**:
  - `eventToLog` valida `id`, `timestamp`, `type`, `source`, `text` antes de retornar
  - Loga `console.error` e retorna `null` se qualquer campo obrigatório estiver ausente
  - Tipagem forte: parâmetro `ev: Record<string, unknown>` em vez de `any`
- **Commit**: `feat(andon-tv): implementa TTS pt-BR, expiração 24h, blinking 5min e log de transferência`

### Task 9: Fallback visual para TTS bloqueado
- **Status**: ✅ Concluído
- **Arquivo**: `frontend/src/app/components/AndonTV.tsx`
- **O que foi feito**:
  - `LogPanel` recebe prop `ttsBlocked: boolean`
  - Ícone `Volume2` pulsante exibido no header do painel quando `ttsBlocked: true`
  - Tooltip "Síntese de voz bloqueada pelo navegador"
- **Commit**: `feat(andon-tv): atualiza LogItem com blinking, LogPanel com seção fixa e fallback TTS`

### Task 10: Criar `design.md` e `tasks.md` da spec
- **Status**: ✅ Concluído
- **Arquivos**: `.kiro/specs/andon-tv-notifications-voice/design.md`, `.kiro/specs/andon-tv-notifications-voice/tasks.md`
- **Commit**: `docs(spec): adiciona design.md e tasks.md da spec andon-tv-notifications-voice`

---

## Pendências / Fora de Escopo

- **Testes automatizados**: Não implementados nesta iteração. A spec descreve propriedades de round-trip (Req 12) que podem ser validadas com Vitest + property-based testing (fast-check). Recomendado como próxima tarefa.
- **Persistência de `seenEventKeys`**: Intencionalmente não persistido (ver decisão no design.md).
- **Integração Odoo para reset**: O endpoint de reset não pausa WOs no Odoo — apenas limpa dados locais.
