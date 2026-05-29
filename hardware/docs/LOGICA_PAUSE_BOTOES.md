# Lógica de Pause e Intertravamento de Botões

## Princípio Fundamental

**ODOO É A FONTE DA VERDADE**

O ESP32 **não decide** estados Andon — apenas reflete o que o Odoo envia via MQTT.

---

## Fluxo de Pause (Botão Azul)

### 1. Operador pressiona botão azul

```
ESP32 → publica "blue" no MQTT
     → aguarda resposta do Odoo
```

### 2. Odoo processa

```
Odoo → recebe evento "blue"
     → pausa/despausa a fabricação
     → publica novo estado via MQTT: "GRAY" ou "GREEN"/"YELLOW"/"RED"
```

### 3. ESP32 recebe estado via MQTT

```
ESP32 → recebe "GRAY" via andon/state/{mac}
     → atualiza g_andonStatus = "GRAY"
     → loop() detecta GRAY e ativa blink azul automaticamente
```

---

## Estados Andon

| Estado | Significado | LED |
|--------|-------------|-----|
| `GREEN` | Produção normal | Verde fixo |
| `YELLOW` | Atenção necessária | Amarelo fixo |
| `RED` | Problema crítico | Vermelho fixo |
| `GRAY` | **Fabricação pausada** | Azul piscando (~70 BPM) |
| `UNASSIGNED` | Dispositivo não vinculado | Amarelo piscando rápido |
| `UNKNOWN` | Sem conexão com Odoo | LEDs apagados |

---

## Intertravamento de Botões

### Regra: 2 segundos entre acionamentos

```cpp
#define BUTTON_INTERLOCK_MS 2000UL  // 2 segundos
```

**Por quê?**
- Evita acionamentos acidentais duplos
- Protege contra operador apertando múltiplos botões simultaneamente
- Dá tempo para o Odoo processar e responder

### Comportamento

```
t=0s   → Operador aperta VERDE
       → ESP32 publica "green"
       → Intertravamento ativo por 2s

t=0.5s → Operador aperta AMARELO (acidental)
       → ESP32 ignora: "amarelo ignorado (intertravamento ativo)"

t=2.1s → Intertravamento liberado
       → Próximo botão será aceito
```

---

## Bloqueio Durante Pause (GRAY)

### Regra: Botões coloridos bloqueados durante GRAY

**Quando `g_andonStatus == "GRAY"`:**
- ❌ Verde bloqueado
- ❌ Amarelo bloqueado  
- ❌ Vermelho bloqueado
- ✅ Azul (pause) funciona normalmente

**Por quê?**
- Fabricação pausada = timer parado no Odoo
- Acionamentos durante pause não devem contar tempo
- Operador deve despausar antes de acionar problemas

### Comportamento

```
Estado atual: GRAY (pausado, azul piscando)

Operador aperta VERMELHO
→ ESP32 ignora: "vermelho ignorado (fabricacao pausada)"
→ Nada é publicado no MQTT
→ Timer no Odoo permanece parado

Operador aperta AZUL (despausar)
→ ESP32 publica "blue"
→ Odoo despausa e envia "GREEN"
→ ESP32 recebe "GREEN" e LEDs voltam ao normal
→ Botões coloridos desbloqueados
```

---

## Casos de Uso

### Caso 1: Pause via botão físico

```
1. Operador aperta azul
2. ESP32 publica "blue"
3. Odoo pausa fabricação
4. Odoo publica "GRAY"
5. ESP32 recebe "GRAY" → azul pisca
6. Botões coloridos bloqueados
```

### Caso 2: Pause via Odoo (manual)

```
1. Supervisor pausa no Odoo (interface web)
2. Odoo publica "GRAY" via MQTT
3. ESP32 recebe "GRAY" → azul pisca automaticamente
4. Botões coloridos bloqueados
5. Operador vê azul piscando e sabe que está pausado
```

### Caso 3: Operador tenta acionar durante pause

```
Estado: GRAY (pausado)

Operador aperta VERMELHO
→ ESP32: "vermelho ignorado (fabricacao pausada)"
→ Nada acontece
→ Timer no Odoo não é afetado
```

### Caso 4: Operador aperta múltiplos botões

```
t=0s   → Aperta VERDE
       → ESP32 publica "green"
       → Intertravamento ativo

t=0.3s → Aperta AMARELO (acidental)
       → ESP32: "amarelo ignorado (intertravamento ativo)"

t=0.8s → Aperta VERMELHO (nervoso)
       → ESP32: "vermelho ignorado (intertravamento ativo)"

t=2.1s → Intertravamento libera
       → Próximo botão será aceito
```

---

## Código Relevante

### Variáveis Globais

```cpp
String g_andonStatus = "UNKNOWN";           // Estado atual (fonte: Odoo)
unsigned long g_lastButtonPress = 0;        // Timestamp do último botão
#define BUTTON_INTERLOCK_MS 2000UL          // 2s entre botões
```

### Lógica de Botões (handleOperational)

```cpp
unsigned long now = millis();
bool interlockActive = (now - g_lastButtonPress) < BUTTON_INTERLOCK_MS;

if (greenButton.pressed) {
    if (interlockActive) {
        logSerial("BUTTON: verde ignorado (intertravamento ativo)");
    } else if (g_andonStatus == "GRAY") {
        logSerial("BUTTON: verde ignorado (fabricacao pausada)");
    } else {
        publishButtonEvent("green");
        g_lastButtonPress = now;
    }
    greenButton.pressed = false;
}
```

### Recepção de Estado via MQTT

```cpp
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    // ...
    if (String(topic) == stateTopic) {
        if (payloadStr == "GRAY") {
            g_andonStatus = "GRAY";
            updateAndonLEDs();  // Apaga LEDs fixos
            // loop() detecta GRAY e ativa blink azul automaticamente
        }
    }
}
```

### Blink Automático no Loop

```cpp
void loop() {
    // ...
    if (currentState == OPERATIONAL && g_andonStatus == "GRAY") {
        updatePauseBlink();  // Azul pisca ~70 BPM
    }
}
```

---

## Prevenção de Erros (Q.I. -100)

### Erro 1: Apertar múltiplos botões simultaneamente
**Proteção:** Intertravamento de 2s

### Erro 2: Acionar problema durante pause
**Proteção:** Botões coloridos bloqueados em GRAY

### Erro 3: Pause via Odoo não refletido no ESP32
**Proteção:** ESP32 escuta MQTT e ativa blink automaticamente

### Erro 4: Operador não sabe que está pausado
**Proteção:** Azul pisca visualmente (~70 BPM, impossível ignorar)

### Erro 5: Timer continua contando durante pause
**Proteção:** Botões bloqueados = nenhum evento enviado ao Odoo

---

## Logs de Debug

### Botão aceito
```
BUTTON: verde -> MQTT andon/button/{mac}/green
```

### Botão bloqueado por intertravamento
```
BUTTON: amarelo ignorado (intertravamento ativo)
```

### Botão bloqueado por pause
```
BUTTON: vermelho ignorado (fabricacao pausada)
```

### Estado recebido do Odoo
```
ANDON STATE: GRAY (fonte: Odoo via MQTT)
```

### Pause solicitado
```
PAUSE: solicitacao enviada ao Odoo (estado atual: GREEN)
```

---

## Resumo

✅ **Odoo decide** — ESP32 obedece  
✅ **Pause via Odoo** — ESP32 reflete automaticamente  
✅ **Intertravamento** — 2s entre botões  
✅ **Bloqueio em GRAY** — botões coloridos não funcionam  
✅ **Feedback visual** — azul pisca quando pausado  
✅ **Proteção contra Q.I. -100** — múltiplas camadas de validação
