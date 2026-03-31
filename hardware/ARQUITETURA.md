# Arquitetura do Sistema Andon ESP32

## Princípios Fundamentais

### 1. Backend é a Fonte de Verdade
- **Backend/App** mantém o estado real do sistema
- **ESP32** é apenas uma interface física (botões + LEDs)
- **Decisões de negócio** acontecem no backend, não no ESP32

### 2. ESP32 como Interface "Burra"
O ESP32 não toma decisões, apenas:
- **Entrada**: Detecta pressionamento de botões → Envia evento MQTT
- **Saída**: Recebe comandos LED → Acende/apaga LEDs

## Fluxo de Dados

### Botão Pressionado

```
[Operador] → [Botão Físico] → [ESP32] → [MQTT] → [Backend]
                                                      ↓
                                              [Valida Ação]
                                                      ↓
                                          [Cria/Resolve Chamado]
                                                      ↓
                                              [Atualiza App]
                                                      ↓
                                          [Envia Comando LED]
                                                      ↓
[LED Acende] ← [ESP32] ← [MQTT] ← [Backend]
```

### Mudança Manual no App

```
[Usuário] → [App Web] → [Backend API]
                              ↓
                      [Cria/Resolve Chamado]
                              ↓
                      [Envia Comando LED]
                              ↓
            [LED Acende] ← [ESP32] ← [MQTT]
```

## Responsabilidades

### ESP32 (Interface Física)
✅ Detectar pressionamento de botões com debounce
✅ Enviar eventos MQTT quando botão é pressionado
✅ Receber comandos LED via MQTT
✅ Controlar LEDs físicos
✅ Manter conexão WiFi/MQTT estável
✅ Aplicar cooldown para prevenir múltiplos disparos

❌ Validar se ação é permitida
❌ Conhecer regras de negócio
❌ Decidir se deve criar/resolver chamado
❌ Bloquear botões baseado em estado

### Backend (Lógica de Negócio)
✅ Receber eventos de botões via MQTT
✅ Validar se ação é permitida (regras de negócio)
✅ Criar/resolver chamados Andon
✅ Manter estado atual de cada mesa
✅ Enviar comandos LED para refletir estado visual
✅ Sincronizar com Odoo
✅ Notificar App Web via WebSocket

❌ Conhecer detalhes de hardware (GPIOs, debounce)
❌ Gerenciar conexão WiFi do ESP32

## Tópicos MQTT

### ESP32 → Backend (Eventos)

| Tópico | Payload | Descrição |
|--------|---------|-----------|
| `andon/discovery` | `{"mac_address":"...", "device_name":"...", "firmware_version":"..."}` | ESP32 se anuncia ao conectar |
| `andon/status/{mac}` | `"online"` ou `"offline"` | Status de conexão (LWT) |
| `andon/button/{mac}/green` | `"PRESSED"` | Botão verde pressionado |
| `andon/button/{mac}/yellow` | `"PRESSED"` | Botão amarelo pressionado |
| `andon/button/{mac}/red` | `"PRESSED"` | Botão vermelho pressionado |
| `andon/logs/{mac}` | `"mensagem de log"` | Logs de diagnóstico |

### Backend → ESP32 (Comandos)

| Tópico | Payload | Descrição |
|--------|---------|-----------|
| `andon/led/{mac}/command` | `{"red":true, "yellow":false, "green":false}` | Controla LEDs |
| `andon/state/{mac}` | `"GREEN"` ou `"YELLOW"` ou `"RED"` | Estado atual (informativo) |

## Regras de Negócio (Backend)

### Botão Verde
- **Ação**: Resolver todos os chamados ativos da mesa
- **Resultado**: Mesa volta para estado GREEN
- **LED**: Verde aceso, amarelo/vermelho apagados

### Botão Amarelo
- **Ação**: Criar chamado de alerta (não-crítico)
- **Validação**: Pode criar mesmo se já houver amarelo ativo
- **Bloqueio**: Se houver RED ativo, backend pode ignorar ou enfileirar
- **LED**: Amarelo aceso

### Botão Vermelho
- **Ação**: Criar chamado de emergência (crítico)
- **Prioridade**: Sempre tem prioridade máxima
- **LED**: Vermelho aceso, sobrescreve amarelo

## Sincronização de Estado

### Por que ESP32 recebe estado?
**Apenas para LEDs visuais** - O ESP32 precisa saber qual LED acender para refletir o estado atual da mesa.

### Quando ESP32 recebe estado?
1. **Ao conectar**: Solicita estado atual via `andon/state/request/{mac}`
2. **Após evento de botão**: Backend envia novo estado
3. **Após mudança manual no app**: Backend envia novo estado
4. **Periodicamente**: Backend pode enviar heartbeat com estado

### ESP32 usa estado para quê?
- ✅ Acender LED correto (verde/amarelo/vermelho)
- ❌ Bloquear botões
- ❌ Validar ações
- ❌ Tomar decisões

## Vantagens desta Arquitetura

### 1. Simplicidade
- ESP32 tem código mínimo e focado
- Fácil de debugar e manter
- Menos bugs possíveis

### 2. Flexibilidade
- Regras de negócio podem mudar sem atualizar firmware
- Backend pode adicionar validações complexas
- Fácil integrar com outros sistemas

### 3. Confiabilidade
- ESP32 sempre funciona (não trava por validação)
- Se backend cair, botões continuam enviando eventos
- Quando backend voltar, processa eventos pendentes

### 4. Escalabilidade
- Múltiplos ESP32 podem usar mesmo firmware
- Backend centraliza toda lógica
- Fácil adicionar novos dispositivos

## Exemplo de Cenário

### Cenário: Operador pressiona botão amarelo duas vezes

**ESP32**:
```
[9000ms] BUTTON: GPIO 13 PRESSIONADO!
[9000ms] BUTTON: yellow pressionado → publicado andon/button/.../yellow
[14000ms] BUTTON: GPIO 13 em cooldown, aguarde 5s
[19000ms] BUTTON: GPIO 13 PRESSIONADO!
[19000ms] BUTTON: yellow pressionado → publicado andon/button/.../yellow
```

**Backend**:
```
[9000ms] MQTT button: chamado YELLOW criado para workcenter 5
[9000ms] MQTT: Estado YELLOW enviado para ESP32
[19000ms] MQTT button: chamado YELLOW criado para workcenter 5 (segundo chamado)
[19000ms] MQTT: Estado YELLOW enviado para ESP32 (sem mudança visual)
```

**Resultado**:
- 2 chamados amarelos criados (ambos válidos)
- LED amarelo aceso (desde o primeiro)
- App mostra 2 chamados ativos
- Operador pode resolver ambos pressionando verde uma vez

## Troubleshooting

### Botão não funciona
1. Verificar logs do ESP32 - botão está sendo detectado?
2. Verificar logs do backend - evento MQTT chegou?
3. Verificar se dispositivo está vinculado a uma mesa
4. Verificar cooldown - aguardou tempo suficiente?

### LED não acende
1. Verificar logs do backend - comando LED foi enviado?
2. Verificar logs do ESP32 - comando foi recebido?
3. Verificar conexão MQTT - ESP32 está conectado?
4. Testar LED manualmente via MQTT

### Estado desincronizado
1. Backend é sempre correto - confie no app
2. ESP32 pode estar com estado antigo - reinicie
3. Verifique logs MQTT - mensagens estão chegando?

## Conclusão

Esta arquitetura mantém o ESP32 simples e confiável, delegando toda complexidade para o backend onde é mais fácil gerenciar, debugar e evoluir.

**Lembre-se**: ESP32 é apenas botões e LEDs. Backend é o cérebro.
