# Solução para Bouncing de Botões - ESP32 Andon

## Problema Identificado

Os botões físicos estavam disparando múltiplas vezes ao serem pressionados devido ao **bouncing mecânico** - fenômeno onde os contatos metálicos do botão "quicam" ao fechar/abrir, gerando múltiplas transições elétricas em poucos milissegundos.

### Sintomas Observados
- Botão pressionado uma vez → múltiplos eventos MQTT publicados
- Logs mostrando várias transições GPIO em sequência rápida
- Sistema funcionando mas com comportamento errático

## Causa Raiz

O bouncing físico pode gerar de 5 a 50 transições em um período de 10-50ms. O debounce simples de 100ms não era suficiente porque:

1. **Debounce por tempo apenas** não garante estabilidade
2. **Transições muito rápidas** podem passar pelo filtro temporal
3. **Ruído elétrico** pode ser interpretado como pressionamento válido

## Solução Implementada

### Algoritmo de Debounce Robusto (Múltiplas Leituras)

```
1. Ler estado atual do GPIO
2. Se mudou em relação à última leitura:
   → Resetar contador de estabilidade
   → Resetar timer
   → Retornar (aguardar estabilização)
   
3. Se não mudou E passou DEBOUNCE_MS (50ms):
   → Incrementar contador de leituras estáveis
   
4. Se atingiu STABLE_READS (3 leituras) consecutivas iguais:
   → Aceitar como mudança de estado válida
   → Processar evento (se for pressionamento)
   → Aplicar cooldown
```

### Parâmetros de Configuração

```cpp
#define DEBOUNCE_MS 50        // Tempo entre leituras (50ms)
#define STABLE_READS 3        // Leituras consecutivas necessárias
#define BTN_GREEN_COOLDOWN_MS 10000   // 10 segundos
#define BTN_YELLOW_COOLDOWN_MS 5000   // 5 segundos  
#define BTN_RED_COOLDOWN_MS 5000      // 5 segundos
```

**Tempo total de debounce efetivo**: 50ms × 3 = **150ms**

### Estrutura de Dados

```cpp
struct ButtonState {
    uint8_t pin;                  // GPIO do botão
    bool lastStableState;         // Último estado confirmado
    bool currentReading;          // Leitura atual
    uint8_t stableCount;          // Contador de leituras estáveis
    unsigned long lastChangeTime; // Timestamp da última mudança
    bool pressed;                 // Flag de evento
    unsigned long lastPressTime;  // Para cooldown
    unsigned long cooldownMs;     // Tempo de cooldown
};
```

## Vantagens da Solução

1. **Elimina bouncing**: Requer 3 leituras consecutivas iguais
2. **Robusto contra ruído**: Qualquer transição espúria reseta o contador
3. **Cooldown independente**: Cada botão tem seu próprio tempo de bloqueio
4. **Não bloqueia o loop**: Algoritmo não-bloqueante
5. **Eficiente**: Processamento mínimo por iteração

## Cooldown por Botão

| Botão    | Cooldown | Justificativa |
|----------|----------|---------------|
| Verde    | 10s      | Resolve chamados - ação crítica, evita múltiplas resoluções acidentais |
| Amarelo  | 5s       | Cria chamado amarelo - permite reação rápida mas evita spam |
| Vermelho | 5s       | Cria chamado vermelho - permite reação rápida mas evita spam |

### Comportamento do Cooldown

- **Primeiro pressionamento**: Sempre funciona (sem bloqueio)
- **Pressionamentos subsequentes**: Bloqueados até o cooldown expirar
- **Cooldown independente**: Apertar Verde não bloqueia Amarelo/Vermelho
- **Feedback visual**: Log mostra tempo restante quando bloqueado

## Melhorias de Hardware (Opcional)

Para ambientes com muito ruído elétrico, considere adicionar:

### Capacitor de Desacoplamento
```
Botão ──┬── GPIO
        │
       ═╪═ 100nF
        │
       GND
```

**Benefícios**:
- Filtra ruído de alta frequência
- Suaviza transições
- Reduz bouncing mecânico

**Instalação**: Soldar capacitor cerâmico 100nF entre o pino GPIO e GND, o mais próximo possível do ESP32.

## Testes Recomendados

1. **Teste de pressionamento único**: Apertar e soltar rapidamente → deve gerar 1 evento
2. **Teste de segurar**: Manter pressionado por 2s → deve gerar 1 evento
3. **Teste de cooldown**: Apertar Verde 2x em 5s → primeiro funciona, segundo bloqueado
4. **Teste de independência**: Apertar Verde, depois Amarelo imediatamente → ambos funcionam
5. **Teste de ruído**: Tocar levemente sem pressionar completamente → não deve disparar

## Monitoramento

O firmware loga cada evento de botão:
```
[9500] BUTTON: GPIO 12 PRESSIONADO!
[12000] BUTTON: GPIO 12 em cooldown, aguarde 7s
```

Se ainda houver múltiplos disparos, considere:
- Aumentar `STABLE_READS` para 4 ou 5
- Aumentar `DEBOUNCE_MS` para 75ms ou 100ms
- Adicionar capacitores de hardware
- Verificar qualidade dos botões (podem estar defeituosos)

## Referências

- [Arduino Debounce Tutorial](https://www.arduino.cc/en/Tutorial/BuiltInExamples/Debounce)
- [Switch Bounce and How to Deal with It](https://www.allaboutcircuits.com/technical-articles/switch-bounce-how-to-deal-with-it/)
- [ESP32 GPIO Best Practices](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/gpio.html)
