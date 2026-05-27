# Mapeamento de Pinos - Sistema Andon ESP32

## Versão do Firmware: 2.4.1
## Placa: ESP32 DevKit v1

---

## 📍 BOTÕES (INPUT_PULLUP)

| Componente       | GPIO | Descrição                          | Conexão Física        |
|------------------|------|------------------------------------|-----------------------|
| Botão Verde      | 12   | Sinaliza status OK/Normal          | GPIO 12 → Botão → GND |
| Botão Amarelo    | 13   | Sinaliza atenção/alerta            | GPIO 13 → Botão → GND |
| Botão Vermelho   | 32   | Sinaliza problema/parada           | GPIO 32 → Botão → GND |
| Botão Pause      | 33   | Toggle pause/resume da fabricação  | GPIO 33 → Botão → GND |

**Lógica:** 
- Botão **solto** = HIGH (3.3V) - Pull-up interno ativo
- Botão **pressionado** = LOW (0V) - Conecta GPIO ao GND

**Debounce:** 50ms (configurável em `config.h`)

---

## 💡 LEDs DE STATUS ANDON (OUTPUT)

| Componente       | GPIO | Cor      | Descrição                    | Conexão Física                      |
|------------------|------|----------|------------------------------|-------------------------------------|
| LED Verde        | 19   | Verde    | Status OK/Normal             | GPIO 19 → R220Ω → LED Verde → GND   |
| LED Amarelo      | 18   | Amarelo  | Status Atenção/Alerta        | GPIO 18 → R220Ω → LED Amarelo → GND |
| LED Vermelho     | 17   | Vermelho | Status Problema/Parada       | GPIO 17 → R220Ω → LED Vermelho → GND|
| LED Onboard      | 2    | Azul     | Indicador de conectividade   | Interno (LED azul da placa)         |

**Lógica:**
- HIGH = LED **aceso**
- LOW = LED **apagado**

**Resistor:** 220Ω em série com cada LED  
**Corrente:** ~15mA por LED

---

## 🔌 RESUMO DE PINOUT

```
ESP32 DevKit v1
┌─────────────────────────────────┐
│                                 │
│  GPIO 2  ──→ LED Onboard (Azul) │
│  GPIO 12 ──→ Botão Verde        │
│  GPIO 13 ──→ Botão Amarelo      │
│  GPIO 17 ──→ LED Vermelho       │
│  GPIO 18 ──→ LED Amarelo        │
│  GPIO 19 ──→ LED Verde          │
│  GPIO 32 ──→ Botão Vermelho     │
│  GPIO 33 ──→ Botão Pause        │
│                                 │
│  GND     ──→ Comum (Botões/LEDs)│
│  3V3     ──→ Alimentação        │
│                                 │
└─────────────────────────────────┘
```

---

## 📊 ESTADOS VISUAIS DOS LEDS

### Estados Andon (Recebidos do Backend)

| Estado      | LED Verde | LED Amarelo | LED Vermelho | Descrição                    |
|-------------|-----------|-------------|--------------|------------------------------|
| GREEN       | ✅ ACESO  | ⚫ APAGADO  | ⚫ APAGADO   | Operação normal              |
| YELLOW      | ⚫ APAGADO | ⚠️ ACESO   | ⚫ APAGADO   | Atenção necessária           |
| RED         | ⚫ APAGADO | ⚫ APAGADO  | 🔴 ACESO    | Problema/Parada              |
| GRAY        | 🔄 PISCA  | 🔄 PISCA   | 🔄 PISCA    | Pausado (~70 BPM, 428ms)     |
| UNASSIGNED  | ⚫ APAGADO | ⚡ PISCA   | ⚫ APAGADO   | Não vinculado (200ms rápido) |

### Estados de Conectividade

| Estado           | LED Verde | LED Amarelo | LED Vermelho | LED Onboard      |
|------------------|-----------|-------------|--------------|------------------|
| WIFI_CONNECTING  | 🌊 ONDA   | 🌊 ONDA     | 🌊 ONDA      | Pisca 500ms      |
| MQTT_CONNECTING  | ⚫ APAGADO | 🔄 ALTERNA  | 🔄 ALTERNA   | Pisca 1000ms     |
| OPERATIONAL      | (Andon)   | (Andon)     | (Andon)      | ✅ ACESO FIXO    |
| MESH_NODE        | ⚫ APAGADO | 🔄 PISCA    | ⚫ APAGADO    | Duplo pulso 2s   |

### Erros e Alertas

| Situação     | LED Verde | LED Amarelo | LED Vermelho | Duração |
|--------------|-----------|-------------|--------------|---------|
| Erro Odoo    | ⚫ APAGADO | ⚫ APAGADO  | ⚡ PISCA     | 5s      |
| Desconectado | ⚫ APAGADO | ⚫ APAGADO  | 🔄 PISCA 3x  | 600ms   |

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
Serial.printf("Verde:%d Amarelo:%d Vermelho:%d Pause:%d\n",
              digitalRead(BTN_VERDE),
              digitalRead(BTN_AMARELO),
              digitalRead(BTN_VERMELHO),
              digitalRead(BTN_PAUSE));
delay(500);
```

---

## 📝 NOTAS IMPORTANTES

1. **Pull-up interno:** Todos os botões usam resistor pull-up interno do ESP32
2. **Corrente máxima:** Cada GPIO do ESP32 suporta até 40mA (LEDs usam ~15mA)
3. **Tensão:** GPIOs operam em 3.3V (não são 5V tolerant!)
4. **Pinos reservados:** Evite usar GPIO 0, 6-11 (flash), 34-39 (input only)
5. **Reset por botão:** Segurar Pause por 5s reinicia o ESP32

---

**Última atualização:** 2026-05-27  
**Autor:** Sistema ID Visual AX  
**Versão do documento:** 1.0
