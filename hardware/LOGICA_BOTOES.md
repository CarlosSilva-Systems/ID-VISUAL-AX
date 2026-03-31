# Lógica de Botões do ESP32 Andon

## Visão Geral

O firmware implementa uma lógica inteligente de validação de botões que previne ações inválidas e múltiplos disparos acidentais.

## Cooldown por Botão

Cada botão possui um tempo de cooldown específico após ser pressionado:

| Botão    | Cooldown | Motivo                                    |
|----------|----------|-------------------------------------------|
| Verde    | 10s      | Resolver chamados é uma ação definitiva   |
| Amarelo  | 5s       | Prevenir múltiplos chamados acidentais    |
| Vermelho | 5s       | Prevenir múltiplos chamados de emergência |

### Comportamento do Cooldown

- Ao pressionar um botão, ele fica bloqueado pelo tempo de cooldown
- Se o usuário tentar pressionar novamente durante o cooldown, o firmware:
  - Ignora o pressionamento
  - Exibe no log quanto tempo falta para o botão ficar disponível
- Após o cooldown, o botão volta a funcionar normalmente
- **Importante**: O cooldown é independente por botão - você pode pressionar o vermelho mesmo que o verde esteja em cooldown

## Sincronização de Estado do Andon

O ESP32 mantém sincronizado o estado atual da mesa (GREEN, YELLOW ou RED) para validar ações.

### Fluxo de Sincronização

1. **Ao conectar**: ESP32 solicita o estado atual via `andon/state/request/{mac}`
2. **Backend responde**: Envia o estado atual via `andon/state/{mac}`
3. **Ao mudar estado**: Backend notifica o ESP32 automaticamente
4. **ESP32 valida**: Antes de publicar evento de botão, verifica se a ação é válida

### Tópicos MQTT

| Tópico                          | Direção       | Payload         | Descrição                           |
|---------------------------------|---------------|-----------------|-------------------------------------|
| `andon/state/request/{mac}`     | ESP32 → Backend | "REQUEST"       | Solicita estado atual               |
| `andon/state/{mac}`             | Backend → ESP32 | "GREEN/YELLOW/RED" | Envia estado atual           |
| `andon/button/{mac}/{color}`    | ESP32 → Backend | "PRESSED"       | Evento de botão pressionado         |

## Validação de Ações

O firmware valida cada ação de botão baseado no estado atual:

### Botão Verde (Resolver Chamados)

- **Permitido quando**: Mesa está YELLOW ou RED (há chamados ativos)
- **Bloqueado quando**: Mesa já está GREEN (sem chamados)
- **Motivo**: Não faz sentido "resolver" quando não há nada para resolver

### Botão Amarelo (Solicitar Suporte)

- **Permitido quando**: Mesa está GREEN ou YELLOW
- **Bloqueado quando**: Mesa está RED (emergência ativa)
- **Motivo**: Emergência tem prioridade sobre solicitações de suporte

### Botão Vermelho (Emergência)

- **Sempre permitido**: Emergências podem ser acionadas a qualquer momento
- **Motivo**: Segurança tem prioridade máxima

## Exemplo de Fluxo

### Cenário 1: Operação Normal

```
1. Mesa está GREEN (produção normal)
2. Operador pressiona AMARELO → ✅ Permitido
3. Mesa muda para YELLOW
4. Backend notifica ESP32: estado = YELLOW
5. Operador tenta pressionar AMARELO novamente → ❌ Bloqueado (cooldown 5s)
6. Após 5s, operador pressiona AMARELO → ✅ Permitido (mas não recomendado)
7. Operador pressiona VERDE → ✅ Permitido
8. Mesa volta para GREEN
```

### Cenário 2: Emergência

```
1. Mesa está GREEN
2. Operador pressiona VERMELHO → ✅ Permitido
3. Mesa muda para RED
4. Backend notifica ESP32: estado = RED
5. Operador tenta pressionar AMARELO → ❌ Bloqueado (emergência ativa)
6. Operador pressiona VERDE → ✅ Permitido
7. Mesa volta para GREEN
```

### Cenário 3: Múltiplos Disparos Acidentais

```
1. Mesa está YELLOW
2. Operador pressiona e SEGURA o botão VERDE
3. Firmware detecta primeiro pressionamento → ✅ Publicado
4. Firmware inicia cooldown de 10s
5. Enquanto segura, firmware detecta mais pressionamentos → ❌ Todos bloqueados
6. Operador solta o botão
7. Após 10s, botão volta a funcionar
```

## Logs de Debug

O firmware exibe logs detalhados para diagnóstico:

```
[12345] BUTTON DEBUG: GPIO 12 transição detectada: 1 → 0
[12395] BUTTON DEBUG: GPIO 12 estado confirmado após debounce: 0
[12395] BUTTON DEBUG: GPIO 12 PRESSIONADO!
[12395] BUTTON: green pressionado → publicado andon/button/24:DC:C3:A1:77:14/green
[12400] BUTTON DEBUG: GPIO 12 em cooldown, aguarde 10s
```

## Estado Desconhecido

Se o ESP32 não conseguir obter o estado atual (ex: backend offline):
- Permite todas as ações
- Exibe aviso no log: "Estado do Andon desconhecido, permitindo ação"
- Quando o backend voltar, sincroniza o estado automaticamente

## Benefícios

1. **Previne erros do usuário**: Não permite ações inválidas
2. **Evita múltiplos disparos**: Cooldown previne pressionamentos acidentais
3. **Feedback claro**: Logs explicam por que uma ação foi bloqueada
4. **Segurança**: Emergências sempre têm prioridade
5. **Sincronização**: ESP32 e backend sempre em acordo sobre o estado
