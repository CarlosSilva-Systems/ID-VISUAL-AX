# Pinout dos LEDs - ESP32 Andon

## LEDs de Status

```
LED VERMELHO  →  GPIO 25
LED AMARELO   →  GPIO 26
LED VERDE     →  GPIO 33
LED ONBOARD   →  GPIO 2 (interno)
```

## Esquema de Conexão

```
GPIO 25 ────[Resistor 220Ω]────[LED Vermelho]──── GND
GPIO 26 ────[Resistor 220Ω]────[LED Amarelo]───── GND
GPIO 33 ────[Resistor 220Ω]────[LED Verde]─────── GND
```

## Importante

- ✓ Use resistores de 220Ω a 330Ω
- ✓ Ânodo (+) do LED conecta no GPIO
- ✓ Cátodo (-) do LED conecta no GND
- ✓ Corrente máxima: 12mA por GPIO
- ✓ Tensão: 3.3V

## Resumo Completo do Pinout

### Botões (INPUT_PULLUP)
```
Botão Verde    → GPIO 12 (conecta ao GND)
Botão Amarelo  → GPIO 13 (conecta ao GND)
Botão Vermelho → GPIO 32 (conecta ao GND)
```

### LEDs (OUTPUT)
```
LED Vermelho   → GPIO 25 (via resistor 220Ω)
LED Amarelo    → GPIO 26 (via resistor 220Ω)
LED Verde      → GPIO 33 (via resistor 220Ω)
LED Onboard    → GPIO 2  (interno)
```
