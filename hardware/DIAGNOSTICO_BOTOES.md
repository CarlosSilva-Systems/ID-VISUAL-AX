# Diagnóstico de Problemas com Botões

## Problema: Múltiplos Disparos ao Pressionar

### Sintomas
- Ao pressionar o botão uma vez, dispara várias vezes
- Logs mostram múltiplas transições rápidas (1→0→1→0)
- Botão nunca confirma estado após debounce

### Causa Raiz
**Bouncing extremo** - O contato mecânico do botão oscila ao fechar/abrir, criando múltiplos pulsos elétricos.

### Soluções Implementadas no Firmware

1. **Debounce de 200ms** - Tempo suficiente para o contato estabilizar
2. **Múltiplas leituras** - Requer 3 leituras consecutivas iguais
3. **Cooldown por botão** - Previne disparos acidentais ao segurar

### Soluções de Hardware (Recomendadas)

#### Opção 1: Capacitor de Debounce (Mais Simples)
```
Botão ----+---- GPIO
          |
         [C] 100nF (0.1µF)
          |
         GND
```

**Componentes necessários**:
- Capacitor cerâmico 100nF (código 104)
- Custo: ~R$ 0,10 por botão

**Como instalar**:
1. Soldar capacitor entre o pino do botão e GND
2. Manter fios curtos (< 10cm)
3. Capacitor deve ficar próximo ao ESP32

#### Opção 2: Filtro RC Completo (Mais Robusto)
```
Botão ----[R]---- GPIO
          10kΩ    |
                 [C] 100nF
                  |
                 GND
```

**Componentes necessários**:
- Resistor 10kΩ
- Capacitor 100nF
- Custo: ~R$ 0,20 por botão

#### Opção 3: Botões de Qualidade Industrial

Substituir por botões com contatos de ouro ou prata:
- Omron B3F series
- Alps SKQG series
- C&K PTS series

**Custo**: R$ 5-15 por botão
**Vantagem**: Bouncing mínimo, vida útil > 1 milhão de ciclos

### Verificação de Problemas

#### 1. Teste de Bouncing
Abra o Serial Monitor e pressione o botão. Você deve ver:

**✅ Comportamento Correto**:
```
[1000] BUTTON: GPIO 12 estado confirmado: LOW
[1000] BUTTON: GPIO 12 PRESSIONADO!
[1200] BUTTON: GPIO 12 estado confirmado: HIGH
```

**❌ Bouncing Extremo**:
```
[1000] BUTTON DEBUG: GPIO 12 transição: 1 → 0
[1001] BUTTON DEBUG: GPIO 12 transição: 0 → 1
[1002] BUTTON DEBUG: GPIO 12 transição: 1 → 0
[1003] BUTTON DEBUG: GPIO 12 transição: 0 → 1
```

#### 2. Teste de Interferência Elétrica

**Sintomas**:
- Botões disparam sozinhos
- Disparos aleatórios sem tocar no botão
- Pior quando motores/relés ligam

**Soluções**:
1. Usar fios blindados ou twisted pair
2. Manter fios de botões longe de cabos de potência
3. Adicionar ferrite beads nos fios
4. Usar cabos < 30cm quando possível

#### 3. Teste de Conexão

Verifique:
- [ ] Botão conectado entre GPIO e GND
- [ ] Sem resistor externo (pull-up interno ativo)
- [ ] Solda firme (sem falso contato)
- [ ] Fios não estão rompidos

### Configurações Ajustáveis

Se o problema persistir, você pode ajustar no `config.h`:

```cpp
// Aumentar tempo de debounce (padrão: 200ms)
#define DEBOUNCE_MS 300  // Tente 300ms ou 400ms

// Aumentar leituras necessárias (padrão: 3)
#define STABLE_READS_REQUIRED 5  // Tente 5 ou 7
```

**Trade-off**: Valores maiores = mais robusto, mas resposta mais lenta.

### Problema: Botão Não Responde

#### Sintomas
- Pressiona o botão mas nada acontece
- Sem logs no Serial Monitor
- LED onboard aceso (sistema operacional)

#### Checklist de Diagnóstico

1. **Verificar GPIO**:
   ```cpp
   // No config.h, confirme os pinos corretos:
   #define BTN_VERDE 12
   #define BTN_AMARELO 13
   #define BTN_VERMELHO 32
   ```

2. **Testar botão fisicamente**:
   - Use multímetro em modo continuidade
   - Deve fechar circuito ao pressionar
   - Deve abrir circuito ao soltar

3. **Verificar estado do Andon**:
   - Botão verde só funciona se mesa estiver YELLOW ou RED
   - Botão amarelo bloqueado se mesa estiver RED
   - Veja logs: `ANDON STATE: Atualizado para YELLOW`

4. **Verificar cooldown**:
   - Aguarde o tempo de cooldown após pressionar
   - Verde: 10 segundos
   - Amarelo/Vermelho: 5 segundos

### Logs Úteis para Diagnóstico

Ative logs detalhados e observe:

```
[5866] ANDON STATE: Atualizado para YELLOW  ← Estado sincronizado
[9500] BUTTON: GPIO 12 estado confirmado: LOW  ← Botão detectado
[9500] BUTTON: GPIO 12 PRESSIONADO!  ← Evento gerado
[9500] BUTTON: green pressionado → publicado andon/button/...  ← MQTT enviado
```

Se faltar algum log, identifique onde o fluxo parou.

### Recomendações Finais

Para produção, recomendamos:

1. **Hardware**:
   - Botões industriais de qualidade
   - Capacitores de debounce em todos os botões
   - Fios blindados < 30cm
   - Caixa metálica aterrada (reduz interferência)

2. **Firmware**:
   - Manter debounce em 200ms
   - Manter 3 leituras consecutivas
   - Cooldowns atuais são adequados

3. **Instalação**:
   - ESP32 próximo aos botões (< 50cm)
   - Evitar passar fios perto de motores/relés
   - Usar fonte estabilizada de qualidade
