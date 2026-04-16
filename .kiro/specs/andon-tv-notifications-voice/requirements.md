# Requirements Document

## Introduction

Este documento especifica os requisitos para melhorias no sistema Andon TV, focando em notificações de ciclo de vida de ID Visual, síntese de voz (Text-to-Speech), e refinamento do registro de eventos. O objetivo é tornar o painel de TV do chão de fábrica mais informativo, profissional e eficiente na comunicação de eventos críticos aos operadores.

## Glossary

- **Andon_TV**: Painel de TV em tela cheia que exibe o status das mesas de produção, chamados ativos e registro de eventos em tempo real
- **ID_Visual**: Documento/etiqueta de identificação visual para ordens de fabricação (Manufacturing Orders)
- **Registro_de_Eventos**: Painel lateral direito do Andon TV que exibe uma timeline de eventos recentes do sistema
- **Produção_Page**: Página do aplicativo web onde operadores solicitam novas ID Visual manualmente
- **Fila_de_Produção**: Dashboard principal onde ID Visual são gerenciadas após transferência da página de Produção
- **Backend**: Servidor FastAPI que processa eventos e fornece dados via endpoint `/api/v1/andon/tv-data`
- **Frontend**: Aplicação React que renderiza o Andon TV e consome dados do backend
- **TTS_Engine**: Motor de síntese de voz (Text-to-Speech) que converte texto em áudio
- **Event_Log_Entry**: Entrada individual no registro de eventos com timestamp, tipo, texto e metadados
- **Highlight_State**: Estado visual de destaque (piscar) aplicado a mensagens específicas no registro
- **Expiration_Timer**: Temporizador que controla quando mensagens devem parar de piscar ou serem removidas

## Requirements

### Requirement 1: Notificação de Solicitação de ID Visual

**User Story:** Como operador do chão de fábrica, eu quero ver notificações claras no Andon TV quando uma ID Visual é solicitada pela produção, para que eu saiba imediatamente que há uma nova demanda.

#### Acceptance Criteria

1. WHEN uma ID Visual é criada com `source="manual"` na página Produção, THE Backend SHALL gerar um evento `IDVISUAL_CREATED` com `requester_name` e `mo_number`
2. WHEN o evento `IDVISUAL_CREATED` é processado pelo Frontend, THE Registro_de_Eventos SHALL exibir uma entrada do tipo `ID_VISUAL_PENDENTE` com o texto "Nova solicitação recebida da produção" e o nome do solicitante
3. THE Event_Log_Entry SHALL incluir o timestamp no formato `[HH:MM]` e o nome do solicitante como `requester`
4. THE Event_Log_Entry SHALL ser exibida com badge azul (`text-blue-400`) e texto em `text-blue-100`
5. WHEN múltiplas solicitações são criadas, THE Registro_de_Eventos SHALL exibir uma entrada separada para cada solicitação

### Requirement 2: Notificação de Transferência para Fila de Produção

**User Story:** Como operador do chão de fábrica, eu quero ser notificado quando uma ID Visual é transferida para a fila de produção, para que eu saiba que o trabalho está progredindo no fluxo.

#### Acceptance Criteria

1. WHEN uma ID Visual tem `transferred_to_queue` alterado para `True`, THE Backend SHALL gerar um evento `IDVISUAL_TRANSFERRED` com `requester_name`, `mo_number` e `transferred_at`
2. WHEN o evento `IDVISUAL_TRANSFERRED` é processado pelo Frontend, THE Registro_de_Eventos SHALL exibir uma entrada do tipo `ID_VISUAL_TRANSFERRED` com o texto "Transferida para fila de produção"
3. THE Event_Log_Entry SHALL incluir o nome do solicitante e o timestamp da transferência
4. THE Event_Log_Entry SHALL ser exibida com badge laranja (`text-orange-400`) e texto em `text-orange-100`

### Requirement 3: Notificação de ID Visual Finalizada

**User Story:** Como operador do chão de fábrica, eu quero ver notificações super claras quando uma ID Visual é finalizada, incluindo nome do solicitante e número da fabricação, para que eu saiba exatamente qual ID está pronta para retirada.

#### Acceptance Criteria

1. WHEN uma ID Visual tem `status` alterado para `IDRequestStatus.CONCLUIDA` e `finished_at` é definido, THE Backend SHALL gerar um evento `IDVISUAL_DONE` com `requester_name`, `mo_number`, `notes` e `finished_at`
2. WHEN o evento `IDVISUAL_DONE` é processado pelo Frontend, THE Registro_de_Eventos SHALL exibir uma entrada do tipo `ID_VISUAL_OK` com o texto "ID visual pronta, favor buscar na mesa da engenharia"
3. THE Event_Log_Entry SHALL exibir o nome do solicitante em destaque abaixo do texto principal
4. THE Event_Log_Entry SHALL exibir o número da fabricação (`mo_number`) no contexto da mensagem
5. THE Event_Log_Entry SHALL ser exibida com badge verde esmeralda (`text-emerald-400 font-black`) e texto em `text-emerald-100 font-bold`
6. THE Event_Log_Entry SHALL ter `highlight: true` para ativar o estado de destaque visual

### Requirement 4: Síntese de Voz para ID Visual Finalizada

**User Story:** Como operador do chão de fábrica, eu quero ouvir uma mensagem de voz quando minha ID Visual é finalizada, similar a painéis de hospital, para que eu seja alertado mesmo quando não estou olhando para a TV.

#### Acceptance Criteria

1. WHEN um evento `IDVISUAL_DONE` é recebido pelo Frontend, THE TTS_Engine SHALL sintetizar a mensagem "Atenção [Nome do solicitante], Sua Identificação Visual foi finalizada, por favor retire na mesa da engenharia"
2. THE TTS_Engine SHALL usar voz em português brasileiro (pt-BR)
3. THE TTS_Engine SHALL usar tom profissional e clara (velocidade normal, sem distorções)
4. THE Frontend SHALL reproduzir o áudio automaticamente sem interação do usuário
5. IF o navegador bloquear autoplay de áudio, THE Frontend SHALL exibir um ícone de notificação visual pulsante como fallback
6. THE TTS_Engine SHALL usar a Web Speech API (`window.speechSynthesis`) quando disponível
7. IF a Web Speech API não estiver disponível, THE Frontend SHALL logar um aviso no console e pular a síntese de voz

### Requirement 5: Destaque Visual de Mensagens de ID Visual

**User Story:** Como operador do chão de fábrica, eu quero que mensagens de ID Visual finalizadas pisquem em verde para se destacarem de outras mensagens, para que eu identifique rapidamente eventos importantes.

#### Acceptance Criteria

1. WHEN uma entrada do tipo `ID_VISUAL_OK` é adicionada ao Registro_de_Eventos, THE Frontend SHALL aplicar um efeito de piscar lento em verde
2. THE Highlight_State SHALL usar a classe CSS `bg-emerald-900/40` com transição suave
3. THE Highlight_State SHALL piscar com intervalo de 1 segundo (500ms ligado, 500ms desligado)
4. WHILE a mensagem está piscando, THE Event_Log_Entry SHALL permanecer fixa no topo do Registro_de_Eventos (não sobe na lista)
5. AFTER 5 minutos desde `finished_at`, THE Highlight_State SHALL ser desativado e a mensagem SHALL entrar no fluxo normal do registro
6. AFTER 1 dia (24 horas) desde `finished_at`, THE Event_Log_Entry SHALL ser removida do Registro_de_Eventos
7. THE Frontend SHALL verificar expiração de mensagens a cada 1 minuto via `setInterval`

### Requirement 6: Limpeza e Profissionalização do Registro de Eventos

**User Story:** Como supervisor de produção, eu quero que o registro de eventos exiba apenas informações claras e relevantes, para que o painel seja profissional e fácil de interpretar.

#### Acceptance Criteria

1. THE Registro_de_Eventos SHALL exibir no máximo 30 entradas simultâneas (constante `MAX_LOGS`)
2. WHEN o limite de 30 entradas é atingido, THE Frontend SHALL remover as entradas mais antigas automaticamente
3. THE Event_Log_Entry SHALL usar formatação consistente: `[HH:MM] TIPO — Texto da mensagem`
4. THE Event_Log_Entry SHALL normalizar todos os textos usando a função `normalizeLabel()` para remover caracteres especiais e padronizar capitalização
5. THE Registro_de_Eventos SHALL persistir as últimas 30 entradas em `localStorage` com chave `andon_tv_logs`
6. WHEN o Andon TV é recarregado, THE Frontend SHALL restaurar as entradas persistidas do `localStorage`
7. THE Registro_de_Eventos SHALL exibir uma timeline vertical com linha contínua e pontos coloridos por tipo de evento
8. THE Event_Log_Entry SHALL usar cores distintas por tipo: INFO (cinza), AMARELO (âmbar), VERMELHO (vermelho), ID_VISUAL_OK (verde esmeralda), RESOLVIDO (verde escuro)

### Requirement 7: Reset de Dados e Remoção de Placeholders

**User Story:** Como administrador do sistema, eu quero resetar todas as pendências, chamados Andon e ID Visual, e remover placeholders do Andon TV, para que o sistema reflita apenas dados reais do APP e Odoo.

#### Acceptance Criteria

1. THE Backend SHALL fornecer um endpoint `DELETE /api/v1/andon/reset` para resetar dados de teste
2. WHEN o endpoint de reset é chamado, THE Backend SHALL deletar todos os registros de `AndonCall` com `status != "RESOLVED"` criados nos últimos 7 dias
3. WHEN o endpoint de reset é chamado, THE Backend SHALL deletar todos os registros de `IDRequest` com `source="manual"` e `status` em `["nova", "triagem", "em_lote"]`
4. WHEN o endpoint de reset é chamado, THE Backend SHALL atualizar todos os registros de `AndonStatus` para `status="cinza"`
5. WHEN o endpoint de reset é chamado, THE Backend SHALL incrementar `andon_version` para forçar atualização do frontend
6. THE Backend SHALL retornar uma resposta JSON com contadores de registros deletados: `{"calls_deleted": N, "id_requests_deleted": M, "statuses_reset": K}`
7. THE Frontend SHALL exibir apenas dados retornados pelo endpoint `/api/v1/andon/tv-data` (sem dados mockados ou hardcoded)
8. THE Frontend SHALL validar que arrays `workcenters`, `calls`, `id_requests` e `recent_events` são arrays válidos antes de renderizar

### Requirement 8: Integração de Eventos de ID Visual no Backend

**User Story:** Como desenvolvedor, eu quero que o backend gere eventos estruturados para cada transição de estado de ID Visual, para que o frontend possa exibir notificações precisas e em tempo real.

#### Acceptance Criteria

1. WHEN uma ID Visual é criada com `source="manual"`, THE Backend SHALL adicionar um evento `IDVISUAL_CREATED` ao array `recent_events` com campos `event_type`, `mo_number`, `requester_name`, `source`, `created_at`
2. WHEN `transferred_to_queue` é alterado para `True`, THE Backend SHALL adicionar um evento `IDVISUAL_TRANSFERRED` com campos `event_type`, `mo_number`, `requester_name`, `created_at` (usando `transferred_at`)
3. WHEN `started_at` é definido, THE Backend SHALL adicionar um evento `IDVISUAL_STARTED` com campos `event_type`, `mo_number`, `requester_name`, `created_at` (usando `started_at`)
4. WHEN `status` é alterado para `IDRequestStatus.CONCLUIDA` e `finished_at` é definido, THE Backend SHALL adicionar um evento `IDVISUAL_DONE` com campos `event_type`, `mo_number`, `requester_name`, `notes`, `duration_minutes`, `finished_at`
5. THE Backend SHALL calcular `duration_minutes` como `(finished_at - (started_at or created_at)).total_seconds() / 60`
6. THE Backend SHALL incluir apenas ID Visual dos últimos 24 horas no array `recent_events` (filtro por `created_at >= now - 24h`)
7. THE Backend SHALL ordenar `recent_events` por timestamp (mais recente primeiro) antes de retornar

### Requirement 9: Deduplicação de Eventos no Frontend

**User Story:** Como desenvolvedor, eu quero evitar que eventos duplicados sejam exibidos no registro, para que o painel não mostre informações redundantes.

#### Acceptance Criteria

1. THE Frontend SHALL manter um `Set` de chaves de eventos já processados (`seenEventKeys`)
2. THE Frontend SHALL gerar chaves únicas no formato `{event_type}:{entity_id}:{state_suffix}` para cada evento
3. WHEN um evento é processado, THE Frontend SHALL verificar se a chave já existe em `seenEventKeys` antes de criar uma entrada de log
4. IF a chave já existe, THE Frontend SHALL pular o evento sem criar entrada duplicada
5. THE Frontend SHALL usar sufixos distintos para estados diferentes do mesmo evento: `O` (opened), `P` (in progress), `R` (resolved), `D` (done)
6. THE Frontend SHALL persistir `seenEventKeys` apenas em memória (não em `localStorage`) para permitir reprocessamento após reload

### Requirement 10: Parser de Eventos para Logs

**User Story:** Como desenvolvedor, eu quero um parser robusto que converta eventos do backend em entradas de log formatadas, para que o registro de eventos seja consistente e fácil de manter.

#### Acceptance Criteria

1. THE Frontend SHALL implementar uma função `eventToLog(ev: any): TVLog | null` que converte eventos em logs
2. THE Parser SHALL retornar `null` para eventos que não devem gerar logs (ex: `IDVISUAL_CREATED` quando `requester_name` está ausente e `source` não é `"manual"`)
3. THE Parser SHALL extrair o timestamp correto baseado no tipo de evento: `resolved_at` para `CALL_RESOLVED`, `finished_at` para `IDVISUAL_DONE`, `created_at` como fallback
4. THE Parser SHALL formatar o timestamp no formato `[HH:MM]` usando `toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })`
5. THE Parser SHALL mapear `event_type` para `LogType` correto: `CALL_OPENED` → `AMARELO` ou `VERMELHO`, `IDVISUAL_DONE` → `ID_VISUAL_OK`, etc.
6. THE Parser SHALL incluir `highlight: true` apenas para eventos críticos: `CALL_OPENED` (RED/YELLOW), `IDVISUAL_DONE`
7. THE Parser SHALL incluir `finishedAt` no log para eventos `IDVISUAL_DONE` para permitir cálculo de expiração

### Requirement 11: Pretty Printer para Logs

**User Story:** Como desenvolvedor, eu quero uma função que formate logs de forma legível para debugging, para que eu possa inspecionar o estado do registro de eventos facilmente.

#### Acceptance Criteria

1. THE Frontend SHALL implementar uma função `formatLogForDebug(log: TVLog): string` que retorna uma string formatada
2. THE Pretty_Printer SHALL incluir todos os campos do log: `id`, `timestamp`, `type`, `source`, `text`, `requester`, `highlight`, `finishedAt`
3. THE Pretty_Printer SHALL formatar o timestamp em formato ISO 8601 completo
4. THE Pretty_Printer SHALL usar indentação de 2 espaços para legibilidade
5. THE Pretty_Printer SHALL omitir campos opcionais quando `undefined` ou `null`

### Requirement 12: Round-Trip de Eventos (Teste de Integridade)

**User Story:** Como desenvolvedor, eu quero garantir que eventos gerados pelo backend possam ser parseados pelo frontend e depois serializados de volta sem perda de dados, para que a integridade dos dados seja mantida.

#### Acceptance Criteria

1. FOR ALL eventos válidos gerados pelo backend, THE Parser SHALL converter o evento em um `TVLog` válido
2. FOR ALL `TVLog` gerados, THE Pretty_Printer SHALL formatar o log em uma string legível
3. FOR ALL strings formatadas, THE Frontend SHALL ser capaz de exibir o log no Registro_de_Eventos sem erros de renderização
4. THE Frontend SHALL validar que campos obrigatórios (`id`, `timestamp`, `type`, `source`, `text`) estão presentes antes de renderizar
5. IF qualquer campo obrigatório estiver ausente, THE Frontend SHALL logar um erro no console e pular a entrada

## Special Requirements Guidance

### Parser e Serializer Requirements

Este sistema inclui um parser de eventos (`eventToLog`) e um pretty printer (`formatLogForDebug`). Ambos devem ser testados com propriedades de round-trip:

**Parser Requirements:**
- Entrada: Evento do backend (objeto JSON com `event_type`, timestamps, metadados)
- Saída: `TVLog` ou `null` (se evento não deve gerar log)
- Deve preservar todos os dados relevantes do evento original
- Deve mapear corretamente tipos de eventos para tipos de log

**Pretty Printer Requirements:**
- Entrada: `TVLog` (objeto TypeScript)
- Saída: String formatada legível
- Deve incluir todos os campos do log original
- Deve usar formatação consistente (indentação, ordem de campos)

**Round-Trip Property:**
- Para todo evento válido `E`, se `L = eventToLog(E)` e `L != null`, então `formatLogForDebug(L)` deve produzir uma string que contenha todas as informações de `E` de forma legível
- Parsing seguido de pretty printing seguido de parsing novamente deve produzir um log equivalente (idempotência)

### Testability Notes

- **Invariantes:** O número de logs no `localStorage` nunca deve exceder `MAX_LOGS` (30)
- **Metamorphic Properties:** Se um evento `IDVISUAL_DONE` é adicionado, o número de logs do tipo `ID_VISUAL_OK` deve aumentar em 1
- **Error Conditions:** Eventos com campos obrigatórios ausentes devem ser rejeitados pelo parser (retornar `null`)
- **Idempotência:** Processar o mesmo evento múltiplas vezes não deve criar logs duplicados (graças a `seenEventKeys`)
