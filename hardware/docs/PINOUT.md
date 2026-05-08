# Pinout ESP32 Andon

## Mapeamento de Pinos

### Botões (INPUT_PULLUP)

| Botão | GPIO | Conexão |
|-------|------|---------|
| Verde | 12 | Botão entre GPIO 12 e GND |
| Amarelo | 13 | Botão entre GPIO 13 e GND |
| Vermelho | 32 | Botão entre GPIO 32 e GND |

**Importante**: Não use resistores externos! O ESP32 usa pull-up interno.

### LEDs de Status (OUTPUT)

| LED | GPIO | Conexão |
|-----|------|---------|
| LED Vermelho | 25 | LED + Resistor 220Ω → GPIO 25 |
| LED Amarelo | 26 | LED + Resistor 220Ω → GPIO 26 |
| LED Verde | 33 | LED + Resistor 220Ω → GPIO 33 |
| LED Onboard | 2 | LED interno do ESP32 |

**Esquema de Conexão LED**:
```
GPIO 25 ----[R 220Ω]----[LED Vermelho]---- GND
GPIO 26 ----[R 220Ω]----[LED Amarelo]---- GND
GPIO 33 ----[R 220Ω]----[LED Verde]---- GND
```

## Diagrama Completo

```
ESP32-WROOM-32
┌─────────────────────┐
│                     │
│  GPIO 12 ●─────────┼──── Botão Verde ──── GND
│  GPIO 13 ●─────────┼──── Botão Amarelo ── GND
│  GPIO 32 ●─────────┼──── Botão Vermelho ─ GND
│                     │
│  GPIO 25 ●─────────┼──── [220Ω] ─ LED Vermelho ─ GND
│  GPIO 26 ●─────────┼──── [220Ω] ─ LED Amarelo ── GND
│  GPIO 33 ●─────────┼──── [220Ω] ─ LED Verde ──── GND
│                     │
│  GPIO 2  ●         │ (LED Onboard)
│                     │
│  3V3     ●         │ (Alimentação)
│  GND     ●─────────┼──── GND Comum
│                     │
└─────────────────────┘
```

## Notas Importantes

### Botões
- **Não precisa de resistor externo** - Pull-up interno ativo
- **Conexão**: Simplesmente conecte o botão entre GPIO e GND
- **Lógica**: Pressionado = LOW (0V), Solto = HIGH (3.3V)

### LEDs
- **Resistor obrigatório**: 220Ω para proteger o LED
- **Polaridade**: Ânodo (+) no GPIO, Cátodo (-) no GND
- **Corrente**: ~15mA por LED (seguro para ESP32)
- **Tensão**: 3.3V (suficiente para acender LEDs comuns)

### Cálculo do Resistor

Para LED vermelho (Vf = 2.0V):
```
R = (Vcc - Vf) / I
R = (3.3V - 2.0V) / 0.015A
R = 86Ω → Use 220Ω (mais seguro)
```

Para LED verde/amarelo (Vf = 2.2V):
```
R = (3.3V - 2.2V) / 0.015A
R = 73Ω → Use 220Ω (mais seguro)
```

## Lista de Materiais

### Componentes Necessários

| Item | Quantidade | Especificação | Custo Aprox. |
|------|------------|---------------|--------------|
| ESP32-WROOM-32 | 1 | 38 pinos | R$ 30-40 |
| Botão Push Button | 3 | Normalmente aberto | R$ 1-2 cada |
| LED Vermelho | 1 | 5mm, 20mA | R$ 0,20 |
| LED Amarelo | 1 | 5mm, 20mA | R$ 0,20 |
| LED Verde | 1 | 5mm, 20mA | R$ 0,20 |
| Resistor 220Ω | 3 | 1/4W | R$ 0,10 cada |
| Capacitor 100nF (opcional) | 3 | Cerâmico | R$ 0,10 cada |
| Jumpers/Fios | - | 22 AWG | R$ 10 (kit) |
| Protoboard | 1 | 830 pontos | R$ 15 |

**Total**: ~R$ 60-70 (protótipo)

### Para Produção (Recomendado)

| Item | Especificação | Custo Aprox. |
|------|---------------|--------------|
| ESP32-WROOM-32U | Com antena externa | R$ 60 |
| Botões Industriais | Omron B3F series | R$ 5-15 cada |
| LEDs de Alto Brilho | 10mm, 50mA | R$ 2-5 cada |
| Caixa Plástica | IP65 | R$ 30-50 |
| Fonte 5V 2A | Estabilizada | R$ 20-30 |

**Total Produção**: ~R$ 200-300 por unidade

## Teste de Conexão

### 1. Teste de Botões
```cpp
void setup() {
    Serial.begin(115200);
    pinMode(12, INPUT_PULLUP);
    pinMode(13, INPUT_PULLUP);
    pinMode(32, INPUT_PULLUP);
}

void loop() {
    Serial.print("Verde: ");
    Serial.print(digitalRead(12));
    Serial.print(" | Amarelo: ");
    Serial.print(digitalRead(13));
    Serial.print(" | Vermelho: ");
    Serial.println(digitalRead(32));
    delay(100);
}
```

**Resultado esperado**:
- Botão solto: 1 (HIGH)
- Botão pressionado: 0 (LOW)

### 2. Teste de LEDs
```cpp
void setup() {
    pinMode(25, OUTPUT);
    pinMode(26, OUTPUT);
    pinMode(33, OUTPUT);
}

void loop() {
    digitalWrite(25, HIGH); delay(500); digitalWrite(25, LOW);
    digitalWrite(26, HIGH); delay(500); digitalWrite(26, LOW);
    digitalWrite(33, HIGH); delay(500); digitalWrite(33, LOW);
}
```

**Resultado esperado**:
- LEDs piscam em sequência: Vermelho → Amarelo → Verde

## Troubleshooting

### Botão não responde
- ✅ Verificar se está conectado entre GPIO e GND
- ✅ Verificar se botão não está invertido (NO vs NC)
- ✅ Testar continuidade com multímetro

### LED não acende
- ✅ Verificar polaridade (ânodo no GPIO, cátodo no GND)
- ✅ Verificar resistor (220Ω)
- ✅ Testar LED com bateria 3V

### LED muito fraco
- ✅ Reduzir resistor para 100Ω (mais corrente)
- ✅ Usar LED de alto brilho
- ✅ Verificar se GPIO está em HIGH

### Múltiplos disparos
- ✅ Adicionar capacitor 100nF entre GPIO e GND
- ✅ Usar botões de melhor qualidade
- ✅ Aumentar debounce no firmware
