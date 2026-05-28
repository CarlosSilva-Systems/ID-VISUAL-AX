# Planejamento de Jogos de Luzes - Sistema Andon ESP32

## Versão: 2.0 - Botões Retroiluminados
## Data: 2026-05-27

---

## 📐 DISPOSIÇÃO FÍSICA DOS BOTÕES

```
┌─────────────────────────┐
│                         │
│   🟢 VERDE   🟡 AMARELO │  ← Linha Superior
│                         │
│   🔴 VERMELHO  🔵 AZUL  │  ← Linha Inferior
│                         │
└─────────────────────────┘
```

**Lógica de Design:**
- **Linha Superior (Verde + Amarelo):** Estados normais/atenção, conectividade
- **Linha Inferior (Vermelho + Azul):** Erros/problemas, controles especiais
- **Vermelho:** Sempre presente em erros graves
- **Azul:** Controle de pause e estados especiais

---

## 🎨 JOGOS DE LUZES - ESTADOS NORMAIS

### 1. BOOT (Inicialização)
**Objetivo:** Mostrar que o sistema está iniciando de forma circular

**Sequência:**
1. Verde ACENDE (500ms)
2. Verde APAGA + Amarelo ACENDE (500ms)
3. Amarelo APAGA + Azul ACENDE (500ms)
4. Azul APAGA + Vermelho ACENDE (500ms)
5. Vermelho APAGA (200ms pausa)
6. Repetir 2x (total 3 ciclos)

**Duração Total:** ~5.4 segundos

**Código:**
```cpp
void playBootAnimation() {
    for (int ciclo = 0; ciclo < 3; ciclo++) {
        digitalWrite(LED_VERDE_PIN, HIGH);
        delay(500);
        digitalWrite(LED_VERDE_PIN, LOW);
        
        digitalWrite(LED_AMARELO_PIN, HIGH);
        delay(500);
        digitalWrite(LED_AMARELO_PIN, LOW);
        
        digitalWrite(LED_AZUL_PIN, HIGH);
        delay(500);
        digitalWrite(LED_AZUL_PIN, LOW);
        
        digitalWrite(LED_VERMELHO_PIN, HIGH);
        delay(500);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        
        delay(200); // Pausa entre ciclos
    }
}
```

---

### 2. WIFI_CONNECTING (Procurando WiFi)
**Objetivo:** Mostrar busca de rede usando linha superior (Verde ↔ Amarelo)

**Sequência:**
1. Verde ACENDE + Amarelo APAGA (600ms)
2. Verde APAGA + Amarelo ACENDE (600ms)
3. Repetir continuamente até conectar

**Duração do Ciclo:** 1.2 segundos

**Visual:** Oscilação horizontal na linha superior

**Código:**
```cpp
void updateWiFiSearchBlink() {
    static unsigned long lastToggle = 0;
    static bool showGreen = true;
    unsigned long now = millis();
    
    if (now - lastToggle >= 600) {
        lastToggle = now;
        showGreen = !showGreen;
        
        digitalWrite(LED_VERDE_PIN,    showGreen ? HIGH : LOW);
        digitalWrite(LED_AMARELO_PIN,  showGreen ? LOW : HIGH);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        digitalWrite(LED_AZUL_PIN,     LOW);
    }
}
```

---

### 3. WIFI_CONNECTED (WiFi Conectado com Sucesso)
**Objetivo:** Confirmação visual clara de conexão WiFi

**Sequência:**
1. Verde PISCA 3x rápido (200ms on/off)
2. Pausa 300ms
3. Todas as luzes ACENDEM juntas (500ms)
4. Todas APAGAM

**Duração Total:** ~2.5 segundos

**Código:**
```cpp
void playWiFiConnectedAnimation() {
    // Verde pisca 3x
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_VERDE_PIN, HIGH);
        delay(200);
        digitalWrite(LED_VERDE_PIN, LOW);
        delay(200);
    }
    
    delay(300); // Pausa
    
    // Todas acendem juntas (celebração)
    digitalWrite(LED_VERDE_PIN,    HIGH);
    digitalWrite(LED_AMARELO_PIN,  HIGH);
    digitalWrite(LED_VERMELHO_PIN, HIGH);
    digitalWrite(LED_AZUL_PIN,     HIGH);
    delay(500);
    
    // Todas apagam
    digitalWrite(LED_VERDE_PIN,    LOW);
    digitalWrite(LED_AMARELO_PIN,  LOW);
    digitalWrite(LED_VERMELHO_PIN, LOW);
    digitalWrite(LED_AZUL_PIN,     LOW);
}
```

---

### 4. MESH_CONNECTED (Conectado via Mesh - Nó Folha)
**Objetivo:** Mostrar conexão mesh (diferente de WiFi direto)

**Sequência:**
1. Linha inferior ACENDE (Vermelho + Azul) (400ms)
2. Linha inferior APAGA (200ms)
3. Linha superior ACENDE (Verde + Amarelo) (400ms)
4. Linha superior APAGA (200ms)
5. Repetir 3x

**Duração Total:** ~3.6 segundos

**Visual:** Alternância vertical (baixo → cima)

**Código:**
```cpp
void playMeshConnectedAnimation() {
    for (int i = 0; i < 3; i++) {
        // Linha inferior
        digitalWrite(LED_VERMELHO_PIN, HIGH);
        digitalWrite(LED_AZUL_PIN,     HIGH);
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        delay(400);
        
        digitalWrite(LED_VERMELHO_PIN, LOW);
        digitalWrite(LED_AZUL_PIN,     LOW);
        delay(200);
        
        // Linha superior
        digitalWrite(LED_VERDE_PIN,    HIGH);
        digitalWrite(LED_AMARELO_PIN,  HIGH);
        delay(400);
        
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        delay(200);
    }
}
```

---

### 5. MQTT_CONNECTING (Conectando ao Broker MQTT)
**Objetivo:** Mostrar tentativa de conexão ao servidor

**Sequência:**
1. Amarelo ACENDE + Vermelho APAGA (500ms)
2. Amarelo APAGA + Vermelho ACENDE (500ms)
3. Repetir continuamente

**Duração do Ciclo:** 1 segundo

**Visual:** Diagonal (superior direita ↔ inferior esquerda)

**Código:**
```cpp
void updateMQTTConnectingBlink() {
    static unsigned long lastToggle = 0;
    static bool phase = false;
    unsigned long now = millis();
    
    if (now - lastToggle >= 500) {
        lastToggle = now;
        phase = !phase;
        
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  phase ? HIGH : LOW);
        digitalWrite(LED_VERMELHO_PIN, phase ? LOW : HIGH);
        digitalWrite(LED_AZUL_PIN,     LOW);
    }
}
```

---

### 6. MESH_NODE (Operando como Nó Folha)
**Objetivo:** Indicar operação via mesh (sem WiFi direto)

**Sequência:**
1. Azul PISCA lento (1000ms on/off)
2. Outros LEDs apagados

**Duração do Ciclo:** 2 segundos

**Código:**
```cpp
void updateMeshNodeBlink() {
    static unsigned long lastToggle = 0;
    static bool blinkOn = false;
    unsigned long now = millis();
    
    if (now - lastToggle >= 1000) {
        lastToggle = now;
        blinkOn = !blinkOn;
        
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        digitalWrite(LED_AZUL_PIN,     blinkOn ? HIGH : LOW);
    }
}
```

---

### 7. PAUSE (Sistema Pausado - Botão Azul Pressionado)
**Objetivo:** Indicar que o sistema está pausado

**Sequência:**
1. Azul PISCA lento ~70 BPM (428ms on/off)
2. Outros LEDs apagados

**Duração do Ciclo:** 856ms (~70 BPM)

**Código:**
```cpp
void updatePauseBlink() {
    static unsigned long lastToggle = 0;
    static bool blinkOn = false;
    unsigned long now = millis();
    
    if (now - lastToggle >= 428) { // ~70 BPM
        lastToggle = now;
        blinkOn = !blinkOn;
        
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        digitalWrite(LED_AZUL_PIN,     blinkOn ? HIGH : LOW);
    }
}
```

---

## ⚠️ JOGOS DE LUZES - ESTADOS DE ERRO

### 8. ERRO: WiFi Timeout (Não conseguiu conectar)
**Gravidade:** Média
**Objetivo:** Indicar falha na conexão WiFi

**Sequência:**
1. Verde + Amarelo PISCAM juntos 2x rápido (200ms on/off)
2. Vermelho ACENDE sozinho (800ms)
3. Tudo APAGA (300ms)
4. Repetir 2x

**Duração Total:** ~4.4 segundos

**Visual:** Linha superior tenta → Vermelho indica falha

**Código:**
```cpp
void playWiFiTimeoutError() {
    for (int ciclo = 0; ciclo < 2; ciclo++) {
        // Linha superior pisca (tentativa)
        for (int i = 0; i < 2; i++) {
            digitalWrite(LED_VERDE_PIN,   HIGH);
            digitalWrite(LED_AMARELO_PIN, HIGH);
            delay(200);
            digitalWrite(LED_VERDE_PIN,   LOW);
            digitalWrite(LED_AMARELO_PIN, LOW);
            delay(200);
        }
        
        // Vermelho indica erro
        digitalWrite(LED_VERMELHO_PIN, HIGH);
        delay(800);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        delay(300);
    }
}
```

---

### 9. ERRO: MQTT Falha de Conexão
**Gravidade:** Alta
**Objetivo:** Indicar que não consegue conectar ao broker

**Sequência:**
1. Amarelo + Vermelho PISCAM alternados 3x rápido (150ms)
2. Vermelho FICA ACESO (1000ms)
3. Tudo APAGA (500ms)

**Duração Total:** ~2.4 segundos

**Visual:** Diagonal pisca → Vermelho fixo (erro grave)

**Código:**
```cpp
void playMQTTConnectionError() {
    // Alternância rápida diagonal
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_AMARELO_PIN,  HIGH);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        delay(150);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        digitalWrite(LED_VERMELHO_PIN, HIGH);
        delay(150);
    }
    
    // Vermelho fixo (erro)
    digitalWrite(LED_VERMELHO_PIN, HIGH);
    delay(1000);
    
    // Apaga tudo
    digitalWrite(LED_VERMELHO_PIN, LOW);
    delay(500);
}
```

---

### 10. ERRO: Integração Odoo Falhou
**Gravidade:** Crítica
**Objetivo:** Alertar que o acionamento não chegou ao Odoo

**Sequência:**
1. Vermelho + Azul PISCAM juntos muito rápido (100ms on/off)
2. Duração: 5 segundos contínuos
3. Restaura estado Andon anterior

**Duração Total:** 5 segundos

**Visual:** Linha inferior pisca urgente (erro crítico de integração)

**Código:**
```cpp
void updateOdooErrorBlink() {
    if (!g_odooErrorActive) return;
    
    unsigned long now = millis();
    unsigned long elapsed = now - g_odooErrorStartMs;
    
    if (elapsed >= 5000) { // 5 segundos
        g_odooErrorActive = false;
        updateAndonLEDs(); // Restaura estado
        return;
    }
    
    // Linha inferior pisca rápido
    bool blinkOn = ((now / 100) % 2 == 0);
    digitalWrite(LED_VERDE_PIN,    LOW);
    digitalWrite(LED_AMARELO_PIN,  LOW);
    digitalWrite(LED_VERMELHO_PIN, blinkOn ? HIGH : LOW);
    digitalWrite(LED_AZUL_PIN,     blinkOn ? HIGH : LOW);
}
```

---

### 11. ERRO: Heap Baixo (Memória Crítica)
**Gravidade:** Alta
**Objetivo:** Indicar problema de memória

**Sequência:**
1. Vermelho PISCA 5x rápido (150ms on/off)
2. Amarelo ACENDE (500ms) - aviso
3. Tudo APAGA

**Duração Total:** ~2 segundos

**Visual:** Vermelho urgente → Amarelo confirma aviso

**Código:**
```cpp
void playHeapWarningBlink() {
    // Vermelho pisca urgente
    for (int i = 0; i < 5; i++) {
        digitalWrite(LED_VERMELHO_PIN, HIGH);
        delay(150);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        delay(150);
    }
    
    // Amarelo confirma aviso
    digitalWrite(LED_AMARELO_PIN, HIGH);
    delay(500);
    digitalWrite(LED_AMARELO_PIN, LOW);
}
```

---

### 12. ERRO: Watchdog Reset Detectado
**Gravidade:** Crítica
**Objetivo:** Indicar que houve reset por travamento

**Sequência:**
1. Todas as luzes PISCAM juntas 4x (200ms on/off)
2. Vermelho FICA ACESO (1500ms)
3. Tudo APAGA

**Duração Total:** ~3.1 segundos

**Visual:** Alerta total → Vermelho indica gravidade

**Código:**
```cpp
void playWatchdogResetWarning() {
    // Todas piscam (alerta máximo)
    for (int i = 0; i < 4; i++) {
        digitalWrite(LED_VERDE_PIN,    HIGH);
        digitalWrite(LED_AMARELO_PIN,  HIGH);
        digitalWrite(LED_VERMELHO_PIN, HIGH);
        digitalWrite(LED_AZUL_PIN,     HIGH);
        delay(200);
        
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        digitalWrite(LED_AZUL_PIN,     LOW);
        delay(200);
    }
    
    // Vermelho fixo (erro grave)
    digitalWrite(LED_VERMELHO_PIN, HIGH);
    delay(1500);
    digitalWrite(LED_VERMELHO_PIN, LOW);
}
```

---

### 13. ERRO: Desconectado (Perdeu Conexão)
**Gravidade:** Média
**Objetivo:** Indicar perda de conexão durante operação

**Sequência:**
1. Vermelho PISCA 3x (300ms on/off)
2. Executado a cada 60 segundos enquanto desconectado

**Duração Total:** 1.8 segundos

**Código:**
```cpp
void playDisconnectedBlink() {
    static uint8_t blinkPhase = 0;
    static unsigned long lastPhaseMs = 0;
    unsigned long now = millis();
    
    if (blinkPhase == 0) {
        blinkPhase = 1;
        lastPhaseMs = now;
        digitalWrite(LED_VERMELHO_PIN, HIGH);
        return;
    }
    
    if (now - lastPhaseMs < 300) return;
    lastPhaseMs = now;
    blinkPhase++;
    
    if (blinkPhase <= 6) { // 3 pulsos = 6 transições
        bool on = (blinkPhase % 2 == 1);
        digitalWrite(LED_VERMELHO_PIN, on ? HIGH : LOW);
    } else {
        blinkPhase = 0;
        digitalWrite(LED_VERMELHO_PIN, LOW);
    }
}
```

---

### 14. ERRO: Reset Manual (Botão Azul 5s)
**Gravidade:** Informativo
**Objetivo:** Confirmar reset manual solicitado

**Sequência:**
1. Todas as luzes PISCAM juntas 3x (150ms on/off)
2. Azul FICA ACESO (1000ms)
3. ESP32 reinicia

**Duração Total:** ~1.9 segundos

**Código:**
```cpp
void playManualResetConfirmation() {
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_VERDE_PIN,    HIGH);
        digitalWrite(LED_AMARELO_PIN,  HIGH);
        digitalWrite(LED_VERMELHO_PIN, HIGH);
        digitalWrite(LED_AZUL_PIN,     HIGH);
        delay(150);
        
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        digitalWrite(LED_AZUL_PIN,     LOW);
        delay(150);
    }
    
    // Azul confirma ação do usuário
    digitalWrite(LED_AZUL_PIN, HIGH);
    delay(1000);
    digitalWrite(LED_AZUL_PIN, LOW);
}
```

---

### 15. ERRO: Comando Restart Remoto (MQTT)
**Gravidade:** Informativo
**Objetivo:** Confirmar restart remoto recebido

**Sequência:**
1. Verde + Azul PISCAM juntos 2x (200ms on/off)
2. Todas ACENDEM (500ms)
3. ESP32 reinicia

**Duração Total:** ~1.3 segundos

**Visual:** Linha diagonal (verde + azul) → Todas (confirmação)

**Código:**
```cpp
void playRemoteRestartConfirmation() {
    for (int i = 0; i < 2; i++) {
        digitalWrite(LED_VERDE_PIN, HIGH);
        digitalWrite(LED_AZUL_PIN,  HIGH);
        delay(200);
        digitalWrite(LED_VERDE_PIN, LOW);
        digitalWrite(LED_AZUL_PIN,  LOW);
        delay(200);
    }
    
    // Todas acendem (confirmação)
    digitalWrite(LED_VERDE_PIN,    HIGH);
    digitalWrite(LED_AMARELO_PIN,  HIGH);
    digitalWrite(LED_VERMELHO_PIN, HIGH);
    digitalWrite(LED_AZUL_PIN,     HIGH);
    delay(500);
}
```

---

## 📋 RESUMO DE PADRÕES

### Padrões de Design Estabelecidos:

1. **Linha Superior (Verde + Amarelo):**
   - Estados de conectividade
   - Tentativas de conexão
   - Confirmações positivas

2. **Linha Inferior (Vermelho + Azul):**
   - Erros e problemas
   - Controles especiais (pause)
   - Alertas críticos

3. **Vermelho:**
   - Sempre presente em erros graves
   - Pisca rápido = urgente
   - Fixo = erro confirmado

4. **Azul:**
   - Pause/controle especial
   - Confirmações de ações do usuário
   - Estados mesh

5. **Todas Juntas:**
   - Celebração (conexão bem-sucedida)
   - Alerta máximo (watchdog)
   - Confirmação de comandos

### Velocidades de Piscada:

- **Muito Rápido (100-150ms):** Erro crítico/urgente
- **Rápido (200ms):** Confirmação/atenção
- **Normal (300-500ms):** Estados transitórios
- **Lento (600-1000ms):** Estados estáveis/busca
- **Muito Lento (428ms - 70 BPM):** Pause (ritmo cardíaco)

---

## ✅ CHECKLIST DE VALIDAÇÃO

- [ ] Boot mostra sequência circular clara
- [ ] WiFi search oscila apenas linha superior
- [ ] WiFi connected tem celebração visível
- [ ] Mesh connected diferente de WiFi (vertical vs horizontal)
- [ ] MQTT connecting usa diagonal
- [ ] Pause pisca azul em ritmo cardíaco
- [ ] Todos os erros têm vermelho
- [ ] Erros críticos são mais rápidos/intensos
- [ ] Timers adequados entre transições
- [ ] Fácil distinguir cada estado visualmente

---

**Aguardando validação para implementação no código!**
