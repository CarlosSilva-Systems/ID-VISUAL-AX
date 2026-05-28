# Mapeamento de Pinos - Sistema Andon ESP32

## Versão do Firmware: 2.4.1
## Placa: ESP32 DevKit v1
## Arquitetura: Botões Retroiluminados

---

## 📍 BOTÕES (INPUT_PULLUP)

| Componente       | GPIO | Descrição                          | Conexão Física        |
|------------------|------|------------------------------------|-----------------------|
| Botão Verde      | 12   | Sinaliza status OK/Normal          | GPIO 12 → Botão → GND |
| Botão Amarelo    | 13   | Sinaliza atenção/alerta            | GPIO 13 → Botão → GND |
| Botão Vermelho   | 32   | Sinaliza problema/parada           | GPIO 32 → Botão → GND |
| Botão Azul       | 33   | Toggle pause/resume da fabricação  | GPIO 33 → Botão → GND |

**Lógica:** 
- Botão **solto** = HIGH (3.3V) - Pull-up interno ativo
- Botão **pressionado** = LOW (0V) - Conecta GPIO ao GND

**Debounce:** 50ms (configurável em `config.h`)

---

## 💡 LEDs RETROILUMINADOS DOS BOTÕES (OUTPUT)

| Componente            | GPIO | Cor      | Descrição                           | Conexão Física                      |
|-----------------------|------|----------|-------------------------------------|-------------------------------------|
| LED Verde (Botão)     | 19   | Verde    | Retroiluminação do botão verde      | GPIO 19 → R220Ω → LED Verde → GND   |
| LED Amarelo (Botão)   | 18   | Amarelo  | Retroiluminação do botão amarelo    | GPIO 18 → R220Ω → LED Amarelo → GND |
| LED Vermelho (Botão)  | 17   | Vermelho | Retroiluminação do botão vermelho   | GPIO 17 → R220Ω → LED Vermelho → GND|
| LED Azul (Botão)      | 16   | Azul     | Retroiluminação do botão azul       | GPIO 16 → R220Ω → LED Azul → GND    |
| LED Onboard           | 2    | Azul     | Indicador de conectividade (placa)  | Interno (LED azul da placa)         |

**Lógica:**
- HIGH = LED **aceso**
- LOW = LED **apagado**

**Resistor:** 220Ω em série com cada LED  
**Corrente:** ~15mA por LED

---

## 🔌 RESUMO DE PINOUT

```
ESP32 DevKit v1
┌─────────────────────────────────────────┐
│                                         │
│  GPIO 2  ──→ LED Onboard (Azul)        │
│  GPIO 12 ──→ Botão Verde               │
│  GPIO 13 ──→ Botão Amarelo             │
│  GPIO 16 ──→ LED Azul (Retroiluminado) │
│  GPIO 17 ──→ LED Vermelho (Retroilum.) │
│  GPIO 18 ──→ LED Amarelo (Retroilum.)  │
│  GPIO 19 ──→ LED Verde (Retroilum.)    │
│  GPIO 32 ──→ Botão Vermelho            │
│  GPIO 33 ──→ Botão Azul                │
│                                         │
│  GND     ──→ Comum (Botões/LEDs)       │
│  3V3     ──→ Alimentação               │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🎨 CONCEITO: BOTÕES RETROILUMINADOS

Cada botão possui seu próprio LED retroiluminado integrado:

| Botão      | GPIO Botão | GPIO LED | Cor LED  | Função                           |
|------------|------------|----------|----------|----------------------------------|
| Verde      | 12         | 19       | Verde    | Indica status OK/Normal          |
| Amarelo    | 13         | 18       | Amarelo  | Indica atenção/alerta            |
| Vermelho   | 32         | 17       | Vermelho | Indica problema/parada           |
| Azul       | 33         | 16       | Azul     | Pause/Resume (controle especial) |

**Vantagens:**
- Feedback visual direto no botão
- Operador sabe qual botão está ativo
- Interface mais intuitiva e profissional
- Reduz erros de operação

---

## 📊 ESTADOS VISUAIS DOS LEDS RETROILUMINADOS

### Estados Andon (Recebidos do Backend)

Os LEDs retroiluminados dos botões indicam o estado atual do sistema Andon:

| Estado      | LED Verde | LED Amarelo | LED Vermelho | LED Azul    | Descrição                    |
|-------------|-----------|-------------|--------------|-------------|------------------------------|
| GREEN       | ✅ ACESO  | ⚫ APAGADO  | ⚫ APAGADO   | ⚫ APAGADO  | Operação normal              |
| YELLOW      | ⚫ APAGADO | ⚠️ ACESO   | ⚫ APAGADO   | ⚫ APAGADO  | Atenção necessária           |
| RED         | ⚫ APAGADO | ⚫ APAGADO  | 🔴 ACESO    | ⚫ APAGADO  | Problema/Parada              |
| GRAY        | 🔄 PISCA  | 🔄 PISCA   | 🔄 PISCA    | 🔄 PISCA   | Pausado (~70 BPM, 428ms)     |
| UNASSIGNED  | ⚫ APAGADO | ⚡ PISCA   | ⚫ APAGADO   | ⚫ APAGADO  | Não vinculado (200ms rápido) |

### Estados de Conectividade

| Estado           | LED Verde | LED Amarelo | LED Vermelho | LED Azul    | LED Onboard      |
|------------------|-----------|-------------|--------------|-------------|------------------|
| WIFI_CONNECTING  | 🌊 ONDA   | 🌊 ONDA     | 🌊 ONDA      | 🌊 ONDA     | Pisca 500ms      |
| MQTT_CONNECTING  | ⚫ APAGADO | 🔄 ALTERNA  | 🔄 ALTERNA   | ⚫ APAGADO  | Pisca 1000ms     |
| OPERATIONAL      | (Andon)   | (Andon)     | (Andon)      | (Andon)     | ✅ ACESO FIXO    |
| MESH_NODE        | ⚫ APAGADO | 🔄 PISCA    | ⚫ APAGADO   | ⚫ APAGADO  | Duplo pulso 2s   |

### Erros e Alertas

| Situação     | LED Verde | LED Amarelo | LED Vermelho | LED Azul    | Duração |
|--------------|-----------|-------------|--------------|-------------|---------|
| Erro Odoo    | ⚫ APAGADO | ⚫ APAGADO  | ⚡ PISCA     | ⚫ APAGADO  | 5s      |
| Desconectado | ⚫ APAGADO | ⚫ APAGADO  | 🔄 PISCA 3x  | ⚫ APAGADO  | 600ms   |
| Reset (5s)   | 🔄 PISCA  | 🔄 PISCA   | 🔄 PISCA    | 🔄 PISCA   | 450ms   |

**Legenda:**
- ✅ = Aceso fixo
- ⚫ = Apagado
- 🔄 = Piscando
- ⚡ = Piscando rápido
- 🌊 = Animação de onda

---

## ⚙️ CONFIGURAÇÕES ADICIONAIS

### Arquivo de Configuração
Todas as definições de pinos estão em: `include/config.h`

### Modificar Pinos
Para alterar um pino, edite `config.h` e recompile:

```cpp
// Exemplo: Mudar botão verde do GPIO 12 para GPIO 14
#define BTN_VERDE 14
```

### Watchdog Timer
- Timeout: 60 segundos
- Reinicia automaticamente se o loop travar

### Debounce
- Tempo: 50ms
- Método: Não-bloqueante baseado em timestamp

---

## 🔧 TROUBLESHOOTING DE HARDWARE

### Botão não responde
1. Verificar conexão: Botão entre GPIO e GND
2. Testar com multímetro: Solto=3.3V, Pressionado=0V
3. Verificar pino correto em `config.h`

### LED não acende
1. Verificar polaridade: Anodo (+) no GPIO, Catodo (-) no GND
2. Verificar resistor: 220Ω em série
3. Testar LED com bateria 3V
4. Verificar pino correto em `config.h`

### Teste rápido de GPIO
Adicione no `loop()` temporariamente:
```cpp
Serial.printf("Verde:%d Amarelo:%d Vermelho:%d Azul:%d\n",
              digitalRead(BTN_VERDE),
              digitalRead(BTN_AMARELO),
              digitalRead(BTN_VERMELHO),
              digitalRead(BTN_AZUL));
delay(500);
```

---

## 📝 NOTAS IMPORTANTES

1. **Botões retroiluminados:** Cada botão possui LED integrado para feedback visual direto
2. **Pull-up interno:** Todos os botões usam resistor pull-up interno do ESP32
3. **Corrente máxima:** Cada GPIO do ESP32 suporta até 40mA (LEDs usam ~15mA)
4. **Tensão:** GPIOs operam em 3.3V (não são 5V tolerant!)
5. **Pinos reservados:** Evite usar GPIO 0, 6-11 (flash), 34-39 (input only)
6. **Reset por botão:** Segurar botão azul por 5s reinicia o ESP32
7. **LED Azul:** GPIO 16 dedicado ao LED retroiluminado do botão azul (pause)
8. **Evento MQTT:** Botão azul publica em `andon/button/{mac}/blue` quando pressionado

---

**Última atualização:** 2026-05-27  
**Autor:** Sistema ID Visual AX  
**Versão do documento:** 2.0 (Botões Retroiluminados)
