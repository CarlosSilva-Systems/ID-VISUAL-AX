/**
 * Firmware ESP32 Andon - Sistema ID Visual AX
 * Versão: 2.4.0
 * Data: 2026-04-07
 *
 * Arquitetura: WiFi Direto com fallback para ESP-MESH
 *
 * Lógica de conexão:
 *   1. Tenta WiFi.begin() diretamente — sem scan prévio (scan conflita com mesh)
 *   2. Se conectar em WIFI_TIMEOUT_MS → vira RAIZ (inicia mesh + MQTT)
 *   3. Se timeout → MESH_NODE (folha); mesh inicia sem WiFi
 *   4. Em OPERATIONAL: WiFi cai → aguarda WIFI_LOSS_FALLBACK_MS (60s) antes
 *      de rebaixar para folha — absorve quedas rápidas (no-break)
 *   5. Em MESH_NODE: tenta WiFi.begin() periodicamente; se conectar → vira raiz
 *   6. Máximo MESH_MAX_CHILDREN (4) filhos diretos por nó
 *
 * Máquina de estados:
 *   BOOT → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL (raiz)
 *                          ↘ MESH_NODE (folha) → WIFI_CONNECTING (retry periódico)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <painlessMesh.h>
#include <esp_task_wdt.h>
#include <esp_system.h>
#include <esp_wifi.h>
#include <esp_mac.h>
#include "config.h"
#include "ota.h"

// ═══════════════════════════════════════════════════════════
// ESTRUTURAS DE DADOS
// ═══════════════════════════════════════════════════════════

enum SystemState {
    BOOT,
    WIFI_CONNECTING,    // Tentando conectar ao AP (direto, sem scan)
    MQTT_CONNECTING,    // Conectando ao broker (nó raiz)
    OPERATIONAL,        // Funcionando — raiz com MQTT ativo
    MESH_NODE           // Nó folha — sem WiFi, roteia via mesh
};

struct ButtonState {
    uint8_t pin;
    bool lastReading;
    unsigned long lastChangeTime;
    bool pressed;
};

struct LEDState {
    uint8_t pin;
    bool state;
};

struct Timer {
    unsigned long interval;
    unsigned long lastTrigger;
};

struct ReconnectionState {
    uint8_t attemptCount;
    unsigned long backoffDelay;
    unsigned long lastAttempt;
};

// ═══════════════════════════════════════════════════════════
// VARIÁVEIS GLOBAIS
// ═══════════════════════════════════════════════════════════

SystemState currentState = BOOT;
String macAddress;
String deviceName;

// Estado Andon recebido do backend
String g_andonStatus = "UNKNOWN";  // GREEN, YELLOW, RED, GRAY, UNKNOWN
unsigned long g_lastAndonUpdate = 0;

// Erro de integração Odoo: pisca todos os LEDs em vermelho rápido por 5s
bool g_odooErrorActive = false;
unsigned long g_odooErrorStartMs = 0;
#define ODOO_ERROR_DURATION_MS  5000UL   // 5s de blink
#define ODOO_ERROR_BLINK_MS     150UL    // 150ms on/off — blink rápido e urgente

// Papel na mesh
bool g_isRoot            = false;
bool g_meshStarted       = false;
uint8_t g_directChildren = 0;
bool g_announcedFull     = false;

// Fallback WiFi→Mesh: marca quando o WiFi caiu em OPERATIONAL
unsigned long g_wifiLostAt = 0;   // 0 = WiFi está ok

// Reset por botão: pause segurado por 5s
unsigned long g_pauseHeldSince = 0;
#define RESET_HOLD_MS 5000UL

// Intertravamento de botões: tempo mínimo entre acionamentos
unsigned long g_lastButtonPress = 0;
#define BUTTON_INTERLOCK_MS 2000UL  // 2 segundos entre botões

// Flag para resetar o blink GRAY ao entrar no estado — evita azul contínuo
bool g_pauseBlinkReset = false;

// Retry WiFi em MESH_NODE: tenta reconectar periodicamente
Timer wifiRetryTimer = {WIFI_RETRY_INTERVAL_MS, 0};

ButtonState greenButton  = {BTN_VERDE,    HIGH, 0, false};
ButtonState yellowButton = {BTN_AMARELO,  HIGH, 0, false};
ButtonState redButton    = {BTN_VERMELHO, HIGH, 0, false};
ButtonState blueButton   = {BTN_AZUL,     HIGH, 0, false};

LEDState redLED     = {LED_VERMELHO_PIN, false};
LEDState yellowLED  = {LED_AMARELO_PIN,  false};
LEDState greenLED   = {LED_VERDE_PIN,    false};
LEDState blueLED    = {LED_AZUL_PIN,     false};
LEDState onboardLED = {LED_ONBOARD_PIN,  false};

Timer heartbeatTimer   = {HEARTBEAT_INTERVAL_MS,    0};
Timer heapMonitorTimer = {HEAP_MONITOR_INTERVAL_MS, 0};
Timer ledBlinkTimer    = {WIFI_BLINK_MS,            0};
Timer disconnectBlinkTimer = {60000UL, 30000UL};  // 1 min, offset de 30s para não coincidir com wifiRetryTimer

ReconnectionState wifiReconnect = {0, INITIAL_BACKOFF_MS, 0};
ReconnectionState mqttReconnect = {0, INITIAL_BACKOFF_MS, 0};

WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);
painlessMesh g_mesh;

// ═══════════════════════════════════════════════════════════
// DECLARAÇÕES ANTECIPADAS
// ═══════════════════════════════════════════════════════════

void logSerial(const String& message);
void updateBackoff(ReconnectionState* state);
void resetBackoff(ReconnectionState* state);
bool checkTimer(Timer* timer);
void updateLEDState(LEDState* led, bool state);
void updateAndonLEDs();
void updateOdooErrorBlink();
void playBootAnimation();
void playWiFiConnectedAnimation();
void playMeshConnectedAnimation();
void playDisconnectedBlink();
void handleWiFiConnecting();
void handleMQTTConnecting();
void handleOperational();
void handleMeshNode();
void updateOnboardLED();
void mqttCallback(char* topic, byte* payload, unsigned int length);
String createDiscoveryMessage();
void logMQTT(const String& message);
void processButton(ButtonState* btn);
void checkResetCombo();
void publishButtonEvent(const String& color);
void initializeGPIOs();
void initializeWatchdog();
void obtainMACAddress();
void startMesh(bool asRoot);
void stopMeshAndRejoinWiFi();
void updateMeshCapacity();
void beginWiFiConnect();

// ═══════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════

void logSerial(const String& message) {
    Serial.print("[");
    Serial.print(millis());
    Serial.print("] ");
    Serial.println(message);
}

void updateBackoff(ReconnectionState* state) {
    state->attemptCount++;
    unsigned long next = state->backoffDelay * 2UL;
    state->backoffDelay = (next > MAX_BACKOFF_MS) ? MAX_BACKOFF_MS : next;
}

void resetBackoff(ReconnectionState* state) {
    state->attemptCount = 0;
    state->backoffDelay = INITIAL_BACKOFF_MS;
}

bool checkTimer(Timer* timer) {
    unsigned long now = millis();
    if (now - timer->lastTrigger >= timer->interval) {
        timer->lastTrigger = now;
        return true;
    }
    return false;
}

void updateLEDState(LEDState* led, bool state) {
    led->state = state;
    digitalWrite(led->pin, state ? HIGH : LOW);
}

// ═══════════════════════════════════════════════════════════
// CONTROLE DOS LEDS ANDON
// ═══════════════════════════════════════════════════════════

void updateAndonLEDs() {
    // Atualiza LEDs baseado no status Andon recebido do backend.
    // GRAY é tratado no loop() com blink não-bloqueante — não apaga aqui.
    if (g_andonStatus == "GREEN") {
        updateLEDState(&greenLED,  true);
        updateLEDState(&yellowLED, false);
        updateLEDState(&redLED,    false);
        updateLEDState(&blueLED,   false);  // Garante que azul apaga ao sair do GRAY
    } else if (g_andonStatus == "YELLOW") {
        updateLEDState(&greenLED,  false);
        updateLEDState(&yellowLED, true);
        updateLEDState(&redLED,    false);
        updateLEDState(&blueLED,   false);
    } else if (g_andonStatus == "RED") {
        updateLEDState(&greenLED,  false);
        updateLEDState(&yellowLED, false);
        updateLEDState(&redLED,    true);
        updateLEDState(&blueLED,   false);
    } else if (g_andonStatus == "GRAY") {
        // Garante que os LEDs coloridos começam apagados; o blink azul é feito no loop()
        updateLEDState(&greenLED,  false);
        updateLEDState(&yellowLED, false);
        updateLEDState(&redLED,    false);
        // Azul NÃO é apagado aqui — o updatePauseBlink() assume o controle
    } else if (g_andonStatus == "UNASSIGNED") {
        // Não vinculado — apaga tudo; o blink amarelo é feito no loop()
        updateLEDState(&greenLED,  false);
        updateLEDState(&yellowLED, false);
        updateLEDState(&redLED,    false);
        updateLEDState(&blueLED,   false);
    }
    // UNKNOWN mantém o estado atual
}

// Blink não-bloqueante para erro de integração Odoo.
// Todos os LEDs piscam em vermelho rápido (150ms) por 5s.
// Após o período, restaura o estado Andon anterior.
void updateOdooErrorBlink() {
    if (!g_odooErrorActive) return;

    unsigned long now = millis();
    unsigned long elapsed = now - g_odooErrorStartMs;

    if (elapsed >= ODOO_ERROR_DURATION_MS) {
        // Fim do blink — restaura estado Andon
        g_odooErrorActive = false;
        updateAndonLEDs();
        logSerial("ODOO ERROR: blink encerrado, estado Andon restaurado -> " + g_andonStatus);
        return;
    }

    // Blink rápido: todos os LEDs piscam juntos em vermelho
    bool blinkOn = ((now / ODOO_ERROR_BLINK_MS) % 2 == 0);
    digitalWrite(LED_VERMELHO_PIN, blinkOn ? HIGH : LOW);
    digitalWrite(LED_AMARELO_PIN,  LOW);
    digitalWrite(LED_VERDE_PIN,    LOW);
}

// Blink não-bloqueante para estado GRAY (pausado).
// Azul pisca lento ~70 BPM: 428ms ligado, 428ms desligado.
#define PAUSE_BLINK_HALF_MS 428UL

void updatePauseBlink() {
    static unsigned long lastToggle = 0;
    static bool blinkOn = false;

    unsigned long now = millis();

    // Reseta o blink sempre que entrar em GRAY (botão ou backend)
    if (g_pauseBlinkReset) {
        g_pauseBlinkReset = false;
        lastToggle = now;
        blinkOn    = false;
        digitalWrite(LED_AZUL_PIN, LOW);
        return;  // Começa apagado; próxima iteração inicia o ciclo
    }

    if (now - lastToggle >= PAUSE_BLINK_HALF_MS) {
        lastToggle = now;
        blinkOn = !blinkOn;
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        digitalWrite(LED_AZUL_PIN,     blinkOn ? HIGH : LOW);
    }
}

// Blink não-bloqueante para estado UNASSIGNED (não vinculado a mesa).
// Amarelo pisca rápido: 200ms ligado, 200ms desligado.
#define UNASSIGNED_BLINK_HALF_MS 200UL
void updateUnassignedBlink() {
    static unsigned long lastToggle = 0;
    static bool blinkOn = false;
    unsigned long now = millis();
    if (now - lastToggle >= UNASSIGNED_BLINK_HALF_MS) {
        lastToggle = now;
        blinkOn = !blinkOn;
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        digitalWrite(LED_AZUL_PIN,     LOW);
        digitalWrite(LED_AMARELO_PIN,  blinkOn ? HIGH : LOW);
    }
}

// Blink não-bloqueante para MQTT_CONNECTING (sem broker).
// Amarelo e vermelho piscam alternados a cada 500ms — diagonal.
#define MQTT_WAIT_BLINK_MS 500UL
void updateMQTTConnectingBlink() {
    static unsigned long lastToggle = 0;
    static bool phase = false;
    unsigned long now = millis();
    if (now - lastToggle >= MQTT_WAIT_BLINK_MS) {
        lastToggle = now;
        phase = !phase;
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  phase ? HIGH : LOW);
        digitalWrite(LED_VERMELHO_PIN, phase ? LOW : HIGH);
        digitalWrite(LED_AZUL_PIN,     LOW);
    }
}

// Blink não-bloqueante para MESH_NODE (sem WiFi, operando via mesh).
// Azul pisca lento (1s on/off) — indica "online mas sem WiFi direto".
#define MESH_NODE_BLINK_MS 1000UL
void updateMeshNodeBlink() {
    static unsigned long lastToggle = 0;
    static bool blinkOn = false;
    unsigned long now = millis();
    if (now - lastToggle >= MESH_NODE_BLINK_MS) {
        lastToggle = now;
        blinkOn = !blinkOn;
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        digitalWrite(LED_AZUL_PIN,     blinkOn ? HIGH : LOW);
    }
}

// Animação de boot: sequência circular (Verde → Amarelo → Azul → Vermelho) 3x
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

// Animação WiFi conectado: Verde pisca 3x + todas acendem (celebração)
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

// Animação Mesh conectado: Alternância vertical (linha inferior ↔ superior) 3x
void playMeshConnectedAnimation() {
    for (int i = 0; i < 3; i++) {
        // Linha inferior (Vermelho + Azul)
        digitalWrite(LED_VERMELHO_PIN, HIGH);
        digitalWrite(LED_AZUL_PIN,     HIGH);
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        delay(400);
        
        digitalWrite(LED_VERMELHO_PIN, LOW);
        digitalWrite(LED_AZUL_PIN,     LOW);
        delay(200);
        
        // Linha superior (Verde + Amarelo)
        digitalWrite(LED_VERDE_PIN,    HIGH);
        digitalWrite(LED_AMARELO_PIN,  HIGH);
        delay(400);
        
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        delay(200);
    }
}

// Pisca vermelho 3 vezes quando desconectado (não-bloqueante)
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
        digitalWrite(LED_VERMELHO_PIN, (redLED.state) ? HIGH : LOW);
    }
}

// Erro: WiFi Timeout - Linha superior tenta 2x → Vermelho indica falha
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

// Erro: MQTT Falha - Diagonal pisca 3x → Vermelho fixo
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

// Erro: Heap Baixo - Vermelho pisca 5x → Amarelo confirma
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

// Erro: Watchdog Reset - Todas piscam 4x → Vermelho fixo
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

// Confirmação: Reset Manual - Todas piscam 3x → Azul confirma
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

// Confirmação: Restart Remoto - Verde+Azul piscam 2x → Todas confirmam
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

// ═══════════════════════════════════════════════════════════
// MESH — CAPACIDADE E CALLBACKS
// ═══════════════════════════════════════════════════════════

void updateMeshCapacity() {
    auto nb = g_mesh.getNodeList(true);
    g_directChildren = (uint8_t)nb.size();
    bool isFull = (g_directChildren >= MESH_MAX_CHILDREN);
    if (isFull && !g_announcedFull) {
        g_announcedFull = true;
        logSerial("MESH: capacidade cheia (" + String(g_directChildren) + "/" + String(MESH_MAX_CHILDREN) + ")");
    } else if (!isFull && g_announcedFull) {
        g_announcedFull = false;
        logSerial("MESH: capacidade liberada (" + String(g_directChildren) + "/" + String(MESH_MAX_CHILDREN) + ")");
    }
}

void onMeshNewConnection(uint32_t nodeId) {
    logSerial("MESH: novo nó " + String(nodeId));
    updateMeshCapacity();
    // Raiz reenvia seu próprio discovery para atualizar mesh_node_count no backend
    if (g_isRoot && mqttClient.connected()) {
        String disc = createDiscoveryMessage();
        mqttClient.publish("andon/discovery", disc.c_str(), false);
    }
}

void onMeshDroppedConnection(uint32_t nodeId) {
    logSerial("MESH: nó desconectado " + String(nodeId));
    updateMeshCapacity();
}

void onMeshChangedConnections() {
    updateMeshCapacity();
}

void onMeshNodeTimeAdjusted(int32_t) {}

void onMeshMessage(uint32_t from, String& msg) {
    StaticJsonDocument<384> doc;
    if (deserializeJson(doc, msg) != DeserializationError::Ok) return;

    const char* type = doc["type"] | "";

    // Nó raiz republica eventos de botão no MQTT
    if (strcmp(type, "button") == 0 && g_isRoot && mqttClient.connected()) {
        const char* mac   = doc["mac"]   | "";
        const char* color = doc["color"] | "";
        if (strlen(mac) > 0 && strlen(color) > 0) {
            String topic = "andon/button/" + String(mac) + "/" + color;
            mqttClient.publish(topic.c_str(), "PRESSED", false);
            logSerial("MESH->MQTT button: " + topic);
        }
    }

    // Nó raiz republica discovery de nós folha no MQTT
    // Folhas enviam {type:"discovery", mac_address:"...", device_name:"...", ...}
    else if (strcmp(type, "discovery") == 0 && g_isRoot && mqttClient.connected()) {
        // Reserializa o payload original (sem o campo "type") e publica em andon/discovery
        doc.remove("type");
        String payload;
        serializeJson(doc, payload);
        mqttClient.publish("andon/discovery", payload.c_str(), false);
        logSerial("MESH->MQTT discovery: " + String(doc["mac_address"] | "?"));
    }

    // Nó raiz republica heartbeat de nós folha no MQTT
    // Folhas enviam {type:"heartbeat", mac:"...", heap:N, uptime:N, mesh_nodes:N}
    else if (strcmp(type, "heartbeat") == 0 && g_isRoot && mqttClient.connected()) {
        const char* mac = doc["mac"] | "";
        if (strlen(mac) > 0) {
            doc.remove("type");
            doc.remove("mac");
            String payload;
            serializeJson(doc, payload);
            String topic = "andon/status/" + String(mac);
            mqttClient.publish(topic.c_str(), payload.c_str(), false);
            logSerial("MESH->MQTT heartbeat: " + String(mac));
        }
    }

    // Nó raiz republica logs de nós folha no MQTT
    // Folhas enviam {type:"log", mac:"...", message:"..."}
    else if (strcmp(type, "log") == 0 && g_isRoot && mqttClient.connected()) {
        const char* mac = doc["mac"] | "";
        const char* message = doc["message"] | "";
        if (strlen(mac) > 0 && strlen(message) > 0) {
            String topic = "andon/logs/" + String(mac);
            mqttClient.publish(topic.c_str(), message, false);
        }
    }
}

// Folha envia seu próprio discovery via mesh para a raiz republicar no MQTT
void sendMeshDiscovery() {
    StaticJsonDocument<384> doc;
    doc["type"]             = "discovery";
    doc["mac_address"]      = macAddress;
    doc["device_name"]      = deviceName;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["is_root"]          = false;
    doc["connection_type"]  = "mesh";
    doc["mesh_node_id"]     = String(g_mesh.getNodeId());
    doc["mesh_node_count"]  = (int)(g_mesh.getNodeList().size() + 1);
    doc["mesh_children"]    = g_directChildren;
    doc["rssi"]             = 0;  // Folha não tem WiFi — RSSI irrelevante
    doc["ip_address"]       = "0.0.0.0";
    String msg;
    serializeJson(doc, msg);
    g_mesh.sendBroadcast(msg);
    logSerial("MESH-NODE: discovery enviado via mesh");
}

// Folha envia heartbeat via mesh para a raiz republicar no MQTT
void sendMeshHeartbeat() {
    StaticJsonDocument<128> doc;
    doc["type"]         = "heartbeat";
    doc["mac"]          = macAddress;
    doc["heap"]         = ESP.getFreeHeap();
    doc["uptime"]       = millis() / 1000;
    doc["mesh_nodes"]   = (int)(g_mesh.getNodeList().size() + 1);
    doc["is_root"]      = false;
    String msg;
    serializeJson(doc, msg);
    g_mesh.sendBroadcast(msg);
}

// Folha envia log via mesh para a raiz republicar no MQTT
void logMeshNode(const String& message) {
    logSerial(message);
    if (!g_isRoot && g_meshStarted) {
        StaticJsonDocument<256> doc;
        doc["type"]    = "log";
        doc["mac"]     = macAddress;
        doc["message"] = message;
        String msg;
        serializeJson(doc, msg);
        g_mesh.sendBroadcast(msg);
    }
}


void startMesh(bool asRoot) {
    if (g_meshStarted) return;
    g_meshStarted = true;
    g_isRoot = asRoot;

    g_mesh.setDebugMsgTypes(ERROR | STARTUP);
    g_mesh.init(MESH_ID, MESH_PASSWORD, MESH_PORT, WIFI_AP_STA, MESH_CHANNEL);

    if (asRoot) {
        g_mesh.stationManual(WIFI_SSID, WIFI_PASSWORD);
    }

    g_mesh.setRoot(asRoot);
    g_mesh.setContainsRoot(true);
    g_mesh.onNewConnection(&onMeshNewConnection);
    g_mesh.onDroppedConnection(&onMeshDroppedConnection);
    g_mesh.onChangedConnections(&onMeshChangedConnections);
    g_mesh.onNodeTimeAdjusted(&onMeshNodeTimeAdjusted);
    g_mesh.onReceive(&onMeshMessage);

    // Limita conexões diretas no nível do driver WiFi (SoftAP).
    // Isso faz o hardware rejeitar novas conexões acima do limite,
    // forçando nós excedentes a procurar outro pai na mesh.
    wifi_config_t apConfig;
    esp_wifi_get_config(WIFI_IF_AP, &apConfig);
    apConfig.ap.max_connection = MESH_MAX_CHILDREN;
    esp_wifi_set_config(WIFI_IF_AP, &apConfig);

    logSerial("MESH: iniciada como " + String(asRoot ? "RAIZ" : "NO-FOLHA") +
              " | ID=" + String(MESH_ID) + " canal=" + String(MESH_CHANNEL) +
              " max_filhos=" + String(MESH_MAX_CHILDREN));
}

// Para a mesh e prepara para reconectar ao WiFi (quando WiFi volta em MESH_NODE)
void stopMeshAndRejoinWiFi() {
    logSerial("MESH: encerrando para reconectar ao WiFi...");
    g_mesh.stop();
    g_meshStarted    = false;
    g_isRoot         = false;
    g_announcedFull  = false;
    g_directChildren = 0;
    WiFi.mode(WIFI_STA);
    delay(100);
}

// ═══════════════════════════════════════════════════════════
// LED ONBOARD
// ═══════════════════════════════════════════════════════════

void updateOnboardLED() {
    unsigned long now = millis();
    switch (currentState) {
        case WIFI_CONNECTING:
            if (now - ledBlinkTimer.lastTrigger >= WIFI_BLINK_MS) {
                onboardLED.state = !onboardLED.state;
                digitalWrite(LED_ONBOARD_PIN, onboardLED.state ? HIGH : LOW);
                ledBlinkTimer.lastTrigger = now;
            }
            break;
        case MQTT_CONNECTING:
            if (now - ledBlinkTimer.lastTrigger >= MQTT_BLINK_MS) {
                onboardLED.state = !onboardLED.state;
                digitalWrite(LED_ONBOARD_PIN, onboardLED.state ? HIGH : LOW);
                ledBlinkTimer.lastTrigger = now;
            }
            break;
        case MESH_NODE:
            {
                unsigned long phase = now % 2000;
                bool on = (phase < 150) || (phase > 300 && phase < 450);
                if (on != onboardLED.state) {
                    onboardLED.state = on;
                    digitalWrite(LED_ONBOARD_PIN, on ? HIGH : LOW);
                }
            }
            break;
        case OPERATIONAL:
            if (!onboardLED.state) {
                onboardLED.state = true;
                digitalWrite(LED_ONBOARD_PIN, HIGH);
            }
            break;
        default: break;
    }
}

// ═══════════════════════════════════════════════════════════
// WIFI — conecta diretamente sem scan prévio
// Scan conflita com painlessMesh que já segura a interface WiFi.
// ═══════════════════════════════════════════════════════════

// Inicia uma tentativa de conexão WiFi (chamado no boot e no retry do MESH_NODE)
void beginWiFiConnect() {
    logSerial("WIFI: conectando a " + String(WIFI_SSID) + " (timeout=" +
              String(WIFI_TIMEOUT_MS / 1000) + "s)...");
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    wifiReconnect.lastAttempt  = millis();
    wifiReconnect.attemptCount = 1;
    currentState = WIFI_CONNECTING;
}

void handleWiFiConnecting() {
    // Animação: linha superior oscilando (Verde ↔ Amarelo)
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
    
    if (WiFi.status() == WL_CONNECTED) {
        logSerial("WIFI: Conectado! IP=" + WiFi.localIP().toString() +
                  " RSSI=" + String(WiFi.RSSI()) + "dBm");
        playWiFiConnectedAnimation();
        startMesh(true);
        resetBackoff(&wifiReconnect);
        currentState = MQTT_CONNECTING;
        return;
    }

    if ((millis() - wifiReconnect.lastAttempt) >= WIFI_TIMEOUT_MS) {
        logSerial("WIFI: timeout (" + String(WIFI_TIMEOUT_MS / 1000) +
                  "s) sem conectar -> MESH_NODE (fallback)");
        playWiFiTimeoutError(); // Mostra erro de timeout
        WiFi.disconnect(true);
        WiFi.mode(WIFI_OFF);
        resetBackoff(&wifiReconnect);
        currentState = MESH_NODE;
        playMeshConnectedAnimation();
        startMesh(false);
        // Envia discovery imediatamente para o backend registrar a folha
        // O timer de heartbeat enviará novamente periodicamente
        // Aguarda 2s para a mesh estabilizar antes do primeiro broadcast
        delay(2000);
        sendMeshDiscovery();
    }
}

// ═══════════════════════════════════════════════════════════
// MQTT
// ═══════════════════════════════════════════════════════════

String createDiscoveryMessage() {
    StaticJsonDocument<384> doc;
    doc["mac_address"]      = macAddress;
    doc["device_name"]      = deviceName;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["is_root"]          = g_isRoot;
    doc["mesh_node_id"]     = String(g_mesh.getNodeId());
    doc["mesh_node_count"]  = (int)(g_mesh.getNodeList().size() + 1);
    doc["mesh_children"]    = g_directChildren;
    doc["rssi"]             = WiFi.RSSI();
    doc["ip_address"]       = WiFi.localIP().toString();
    // connection_type: "wifi" = raiz com WiFi direto, "mesh" = nó folha sem WiFi
    doc["connection_type"]  = g_isRoot ? "wifi" : "mesh";
    String output;
    serializeJson(doc, output);
    return output;
}

void logMQTT(const String& message) {
    logSerial(message);
    if (mqttClient.connected()) {
        String topic = "andon/logs/" + macAddress;
        mqttClient.publish(topic.c_str(), message.c_str(), false);
    }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    String payloadStr;
    for (unsigned int i = 0; i < length; i++) payloadStr += (char)payload[i];

    String stateTopic    = "andon/state/"     + macAddress;
    String restartTopic  = "andon/restart/"   + macAddress;
    String odooErrTopic  = "andon/odoo_error/" + macAddress;

    if (String(topic) == stateTopic) {
        payloadStr.trim();
        payloadStr.toUpperCase();
        if (payloadStr == "GREEN" || payloadStr == "YELLOW" ||
            payloadStr == "RED"   || payloadStr == "GRAY"   ||
            payloadStr == "UNASSIGNED") {
            g_andonStatus = payloadStr;
            g_lastAndonUpdate = millis();
            updateAndonLEDs();
            logSerial("ANDON STATE: " + payloadStr + " (fonte: Odoo via MQTT)");
            // Se GRAY, o blink azul no loop() ativa automaticamente
            // Se outro estado durante GRAY, o blink para e LEDs fixos assumem
        }
    } else if (String(topic) == "andon/ota/trigger") {
        // Comando de atualização OTA recebido via broadcast
        logSerial("OTA: Trigger recebido via MQTT");
        handleOTATrigger(payloadStr.c_str());
    } else if (String(topic) == "andon/ota/cancel") {
        // Comando de cancelamento OTA recebido via broadcast
        logSerial("OTA: Cancel recebido via MQTT - ignorando downloads futuros");
        publishOTAProgress("cancelled", 0, "Cancelado pelo backend");
    } else if (String(topic) == odooErrTopic) {
        // Integração Odoo falhou — acionamento registrado localmente mas não chegou ao Odoo
        // Pisca vermelho rápido por 5s para alertar o operador
        if (!g_odooErrorActive) {
            g_odooErrorActive   = true;
            g_odooErrorStartMs  = millis();
            logMQTT("ODOO ERROR: falha na integracao Odoo — acionamento local OK, Odoo NAO atualizado");
        }
    } else if (String(topic) == restartTopic) {
        payloadStr.trim();
        payloadStr.toUpperCase();
        if (payloadStr == "RESTART") {
            logMQTT("RESTART: comando remoto recebido — reiniciando em 1s...");
            // Publica ACK antes de reiniciar para o backend registrar
            String ackTopic = "andon/restart/ack/" + macAddress;
            mqttClient.publish(ackTopic.c_str(), "RESTARTING", false);
            // Animação de confirmação de restart remoto
            playRemoteRestartConfirmation();
            delay(500);
            ESP.restart();
        }
    }
}

void handleMQTTConnecting() {
    // Animação: diagonal (Amarelo ↔ Vermelho)
    updateMQTTConnectingBlink();
    
    unsigned long now = millis();

    if (WiFi.status() != WL_CONNECTED) {
        logSerial("MQTT: WiFi perdido -> WIFI_CONNECTING");
        beginWiFiConnect();
        return;
    }

    if (mqttClient.connected()) {
        String statusTopic = "andon/status/" + macAddress;
        mqttClient.publish(statusTopic.c_str(), "online", true);

        String disc = createDiscoveryMessage();
        if (!disc.isEmpty())
            mqttClient.publish("andon/discovery", disc.c_str(), false);

        String ledTopic      = "andon/led/"       + macAddress + "/command";
        String stateTopic    = "andon/state/"     + macAddress;
        String restartTopic  = "andon/restart/"   + macAddress;
        String odooErrTopic  = "andon/odoo_error/" + macAddress;
        String otaTrigger    = "andon/ota/trigger";
        String otaCancel     = "andon/ota/cancel";
        mqttClient.subscribe(ledTopic.c_str(),     1);
        mqttClient.subscribe(stateTopic.c_str(),   1);
        mqttClient.subscribe(restartTopic.c_str(), 1);
        mqttClient.subscribe(odooErrTopic.c_str(), 1);
        mqttClient.subscribe(otaTrigger.c_str(),   1);
        mqttClient.subscribe(otaCancel.c_str(),    1);

        String reqTopic = "andon/state/request/" + macAddress;
        mqttClient.publish(reqTopic.c_str(), "REQUEST", false);

        currentState = OPERATIONAL;
        g_wifiLostAt = 0;
        resetBackoff(&mqttReconnect);
        // Apaga LEDs de conexão e aplica status Andon já conhecido (se houver)
        // O backend pode ter respondido ao REQUEST antes desta linha
        if (g_andonStatus != "UNKNOWN") {
            updateAndonLEDs();
            logSerial("MQTT: status Andon restaurado -> " + g_andonStatus);
        } else {
            digitalWrite(LED_VERMELHO_PIN, LOW);
            digitalWrite(LED_AMARELO_PIN,  LOW);
            digitalWrite(LED_VERDE_PIN,    LOW);
        }
        logSerial("MQTT: conectado -> OPERATIONAL (raiz, IP=" +
                  WiFi.localIP().toString() + " RSSI=" + String(WiFi.RSSI()) + "dBm)");
        return;
    }

    if (now - mqttReconnect.lastAttempt < mqttReconnect.backoffDelay) return;

    if (mqttReconnect.attemptCount >= MQTT_MAX_RETRIES) {
        logSerial("MQTT: max tentativas -> reiniciando");
        playMQTTConnectionError(); // Mostra erro de conexão MQTT
        delay(500); 
        ESP.restart();
    }

    if (mqttReconnect.attemptCount == 0)
        logSerial("MQTT: conectando a " + String(MQTT_BROKER) + ":" +
                  String(MQTT_PORT) + " (IP=" + WiFi.localIP().toString() + ")");

    String lwtTopic = "andon/status/" + macAddress;
    bool ok = mqttClient.connect(deviceName.c_str(), lwtTopic.c_str(), 1, true, "offline");
    mqttReconnect.lastAttempt = now;

    if (!ok) {
        logSerial("MQTT: falha rc=" + String(mqttClient.state()) +
                  " retry " + String(mqttReconnect.backoffDelay / 1000) + "s");
        updateBackoff(&mqttReconnect);
    }
}

// ═══════════════════════════════════════════════════════════
// ESTADO OPERATIONAL (nó raiz)
// ═══════════════════════════════════════════════════════════

void handleOperational() {
    g_mesh.update();
    if (mqttClient.connected()) mqttClient.loop();

    if (WiFi.status() != WL_CONNECTED) {
        unsigned long now = millis();
        if (g_wifiLostAt == 0) {
            g_wifiLostAt = now;
            // Limpa LEDs Andon imediatamente ao perder WiFi
            g_andonStatus = "UNKNOWN";
            digitalWrite(LED_VERDE_PIN,    LOW);
            digitalWrite(LED_AMARELO_PIN,  LOW);
            digitalWrite(LED_VERMELHO_PIN, LOW);
            logSerial("OPERATIONAL: WiFi perdido, aguardando " +
                      String(WIFI_LOSS_FALLBACK_MS / 1000) + "s antes de fallback...");
        } else if (now - g_wifiLostAt >= WIFI_LOSS_FALLBACK_MS) {
            logSerial("OPERATIONAL: WiFi ausente por " +
                      String(WIFI_LOSS_FALLBACK_MS / 1000) + "s -> MESH_NODE (fallback)");
            mqttClient.disconnect();
            g_mesh.setRoot(false);
            g_isRoot     = false;
            g_wifiLostAt = 0;
            currentState = MESH_NODE;
        }
        return;
    } else {
        if (g_wifiLostAt != 0) {
            logSerial("OPERATIONAL: WiFi restaurado dentro da janela de fallback");
            g_wifiLostAt = 0;
        }
    }

    if (!mqttClient.connected()) {
        logSerial("OPERATIONAL: MQTT perdido -> MQTT_CONNECTING");
        // Limpa LEDs Andon — não deve mostrar estado Andon sem conexão ativa
        g_andonStatus = "UNKNOWN";
        digitalWrite(LED_VERDE_PIN,    LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        resetBackoff(&mqttReconnect);
        currentState = MQTT_CONNECTING;
        return;
    }

    processButton(&greenButton);
    processButton(&yellowButton);
    processButton(&redButton);
    processButton(&blueButton);

    unsigned long now = millis();
    bool interlockActive = (now - g_lastButtonPress) < BUTTON_INTERLOCK_MS;
    
    // Botões coloridos: bloqueados durante GRAY (pause) e com intertravamento
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
    
    if (yellowButton.pressed) {
        if (interlockActive) {
            logSerial("BUTTON: amarelo ignorado (intertravamento ativo)");
        } else if (g_andonStatus == "GRAY") {
            logSerial("BUTTON: amarelo ignorado (fabricacao pausada)");
        } else {
            publishButtonEvent("yellow");
            g_lastButtonPress = now;
        }
        yellowButton.pressed = false;
    }
    
    if (redButton.pressed) {
        if (interlockActive) {
            logSerial("BUTTON: vermelho ignorado (intertravamento ativo)");
        } else if (g_andonStatus == "GRAY") {
            logSerial("BUTTON: vermelho ignorado (fabricacao pausada)");
        } else {
            publishButtonEvent("red");
            g_lastButtonPress = now;
        }
        redButton.pressed = false;
    }
    
    // Botão azul (pause): sempre funciona, SEM intertravamento
    // É ele que tira o estado GRAY, então não pode ser bloqueado
    if (blueButton.pressed) {
        publishButtonEvent("pause");  // Backend espera "pause" não "blue"
        g_lastButtonPress = now;  // Atualiza para bloquear outros botões
        logSerial("PAUSE: solicitacao enviada ao Odoo (estado atual: " + g_andonStatus + ")");
        blueButton.pressed = false;
    }

    if (checkTimer(&heartbeatTimer)) {
        StaticJsonDocument<128> hb;
        hb["heap"]          = ESP.getFreeHeap();
        hb["rssi"]          = WiFi.RSSI();
        hb["mesh_nodes"]    = (int)(g_mesh.getNodeList().size() + 1);
        hb["mesh_children"] = g_directChildren;
        hb["is_root"]       = true;
        String s; serializeJson(hb, s);
        mqttClient.publish(("andon/status/" + macAddress).c_str(), s.c_str(), false);
        logSerial("HEARTBEAT: " + s);
    }

    if (checkTimer(&heapMonitorTimer)) {
        uint32_t heap = ESP.getFreeHeap();
        if (heap < HEAP_WARN_THRESHOLD)
            logMQTT("AVISO: Heap baixo - " + String(heap) + " bytes");
    }
}

// ═══════════════════════════════════════════════════════════
// MESH NODE — nó folha; verifica periodicamente se WiFi voltou
// ═══════════════════════════════════════════════════════════

void handleMeshNode() {
    g_mesh.update();

    processButton(&greenButton);
    processButton(&yellowButton);
    processButton(&redButton);
    processButton(&blueButton);

    unsigned long now = millis();
    bool interlockActive = (now - g_lastButtonPress) < BUTTON_INTERLOCK_MS;
    
    // Mesma lógica do nó raiz: bloqueio durante GRAY e intertravamento
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
    
    if (yellowButton.pressed) {
        if (interlockActive) {
            logSerial("BUTTON: amarelo ignorado (intertravamento ativo)");
        } else if (g_andonStatus == "GRAY") {
            logSerial("BUTTON: amarelo ignorado (fabricacao pausada)");
        } else {
            publishButtonEvent("yellow");
            g_lastButtonPress = now;
        }
        yellowButton.pressed = false;
    }
    
    if (redButton.pressed) {
        if (interlockActive) {
            logSerial("BUTTON: vermelho ignorado (intertravamento ativo)");
        } else if (g_andonStatus == "GRAY") {
            logSerial("BUTTON: vermelho ignorado (fabricacao pausada)");
        } else {
            publishButtonEvent("red");
            g_lastButtonPress = now;
        }
        redButton.pressed = false;
    }
    
    if (blueButton.pressed) {
        publishButtonEvent("pause");  // Backend espera "pause" não "blue"
        g_lastButtonPress = now;  // Atualiza para bloquear outros botões
        logSerial("PAUSE: solicitacao enviada ao Odoo (estado atual: " + g_andonStatus + ")");
        blueButton.pressed = false;
    }

    // Heartbeat + discovery periódico via mesh para o backend ver a folha
    if (checkTimer(&heartbeatTimer)) {
        sendMeshHeartbeat();
        sendMeshDiscovery();  // Reenvia discovery para manter o backend atualizado
        logSerial("MESH-NODE: heartbeat+discovery enviados | heap=" + String(ESP.getFreeHeap()) +
                  " nos=" + String(g_mesh.getNodeList().size() + 1));
    }

    if (checkTimer(&heapMonitorTimer)) {
        uint32_t heap = ESP.getFreeHeap();
        if (heap < HEAP_WARN_THRESHOLD)
            logMeshNode("AVISO: Heap baixo - " + String(heap) + " bytes");
    }

    // Pisca vermelho a cada 1 minuto quando sem conexão WiFi
    if (checkTimer(&disconnectBlinkTimer)) {
        playDisconnectedBlink();
    }

    // Verifica periodicamente se o WiFi voltou — tenta conectar diretamente
    if (checkTimer(&wifiRetryTimer)) {
        logSerial("MESH-NODE: tentando reconectar ao WiFi...");
        stopMeshAndRejoinWiFi();
        beginWiFiConnect();
    }
}

// ═══════════════════════════════════════════════════════════
// BOTÕES E LEDS
// ═══════════════════════════════════════════════════════════

void processButton(ButtonState* btn) {
    bool reading = digitalRead(btn->pin);
    unsigned long now = millis();
    
    if (reading == btn->lastReading) return;
    if ((now - btn->lastChangeTime) < DEBOUNCE_MS) return;
    
    btn->lastReading = reading;
    btn->lastChangeTime = now;
    
    if (reading == LOW) {
        btn->pressed = true;
        logSerial("BTN: GPIO " + String(btn->pin));
    }
}

// Verifica se o botão azul está sendo segurado para reset
void checkResetCombo() {
    bool blueDown = (digitalRead(BTN_AZUL) == LOW);
    unsigned long now = millis();

    if (blueDown) {
        if (g_pauseHeldSince == 0) {
            g_pauseHeldSince = now;
        } else if (now - g_pauseHeldSince >= RESET_HOLD_MS) {
            logSerial("RESET: botao azul segurado 5s -> reiniciando...");
            // Animação de confirmação de reset manual
            playManualResetConfirmation();
            ESP.restart();
        }
    } else {
        g_pauseHeldSince = 0;
    }
}

void publishButtonEvent(const String& color) {
    if (g_isRoot && mqttClient.connected()) {
        String topic = "andon/button/" + macAddress + "/" + color;
        if (mqttClient.publish(topic.c_str(), "PRESSED", false))
            logSerial("BUTTON: " + color + " -> MQTT " + topic);
        else
            logSerial("ERRO: falha ao publicar botão " + color);
        return;
    }
    StaticJsonDocument<128> doc;
    doc["type"]  = "button";
    doc["mac"]   = macAddress;
    doc["color"] = color;
    String msg; serializeJson(doc, msg);
    g_mesh.sendBroadcast(msg);
    logSerial("BUTTON: " + color + " -> MESH broadcast");
}

bool processLEDCommand(const String& payload) {
    StaticJsonDocument<128> doc;
    if (deserializeJson(doc, payload) != DeserializationError::Ok) {
        logMQTT("ERRO: JSON inválido no comando LED");
        return false;
    }
    if (!doc.containsKey("red") || !doc.containsKey("yellow") || !doc.containsKey("green")) {
        logMQTT("ERRO: Comando LED sem campos obrigatórios");
        return false;
    }
    updateLEDState(&redLED,    doc["red"].as<bool>());
    updateLEDState(&yellowLED, doc["yellow"].as<bool>());
    updateLEDState(&greenLED,  doc["green"].as<bool>());
    logSerial("LED: red=" + String((bool)doc["red"]) +
              " yellow=" + String((bool)doc["yellow"]) +
              " green="  + String((bool)doc["green"]));
    return true;
}

// ═══════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════

void initializeGPIOs() {
    pinMode(BTN_VERDE,    INPUT_PULLUP);
    pinMode(BTN_AMARELO,  INPUT_PULLUP);
    pinMode(BTN_VERMELHO, INPUT_PULLUP);
    pinMode(BTN_AZUL,     INPUT_PULLUP);

    const uint8_t leds[] = {LED_VERMELHO_PIN, LED_AMARELO_PIN, LED_VERDE_PIN, LED_AZUL_PIN, LED_ONBOARD_PIN};
    for (uint8_t p : leds) { pinMode(p, OUTPUT); digitalWrite(p, LOW); }

    logSerial("GPIO: inicializados (4 botoes + 5 LEDs)");
}

void initializeWatchdog() {
    esp_task_wdt_init(WATCHDOG_TIMEOUT_S, true);
    esp_task_wdt_add(NULL);
    if (esp_reset_reason() == ESP_RST_TASK_WDT) {
        logSerial("AVISO: Reset por watchdog detectado");
        playWatchdogResetWarning(); // Mostra erro de watchdog
    }
    logSerial("WDT: inicializado (" + String(WATCHDOG_TIMEOUT_S) + "s)");
}

void obtainMACAddress() {
    // Garante que o WiFi está em modo STA para ler o MAC correto
    if (WiFi.getMode() == WIFI_OFF) WiFi.mode(WIFI_STA);
    macAddress = WiFi.macAddress();
    // Fallback: se MAC ainda inválido, usa o MAC do chip diretamente
    if (macAddress == "00:00:00:00:00:00" || macAddress.isEmpty()) {
        uint8_t mac[6];
        esp_read_mac(mac, ESP_MAC_WIFI_STA);
        char buf[18];
        snprintf(buf, sizeof(buf), "%02X:%02X:%02X:%02X:%02X:%02X",
                 mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
        macAddress = String(buf);
    }
    String suffix = macAddress.substring(macAddress.length() - 5);
    suffix.replace(":", "");
    deviceName = "ESP32-Andon-" + suffix;
    logSerial("MAC: " + macAddress + "  Nome: " + deviceName);
}

// ═══════════════════════════════════════════════════════════
// SETUP / LOOP
// ═══════════════════════════════════════════════════════════

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    Serial.println();
    Serial.println("═══════════════════════════════════════════════════════");
    Serial.println("  Firmware ESP32 Andon v2.4.0 - ID Visual AX");
    Serial.println("  WiFi Direto + Fallback ESP-MESH");
    Serial.println("═══════════════════════════════════════════════════════");
    Serial.println();

    initializeGPIOs();
    
    // Jogo de luzes na inicialização
    playBootAnimation();
    
    initializeWatchdog();
    obtainMACAddress();

    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setBufferSize(MQTT_BUFFER_SIZE);
    mqttClient.setCallback(mqttCallback);
    logSerial("MQTT: broker=" + String(MQTT_BROKER) + ":" + String(MQTT_PORT));

    // Tenta WiFi direto — sem scan (scan conflita com mesh)
    beginWiFiConnect();
}

void loop() {
    esp_task_wdt_reset();
    checkResetCombo();
    updateOnboardLED();

    // Blink de aguardando broker: vermelho e amarelo alternados quando sem MQTT
    // Ao sair do estado MQTT_CONNECTING, força resincronização dos pinos com as structs
    // (updateMQTTConnectingBlink escreve direto nos pinos sem atualizar as structs LEDState)
    static SystemState prevState = BOOT;
    if (currentState == MQTT_CONNECTING) {
        updateMQTTConnectingBlink();
    } else if (prevState == MQTT_CONNECTING) {
        // Acabou de sair do MQTT_CONNECTING — limpa os pinos e aplica status Andon
        digitalWrite(LED_VERMELHO_PIN, LOW);
        digitalWrite(LED_AMARELO_PIN,  LOW);
        digitalWrite(LED_VERDE_PIN,    LOW);
        if (g_andonStatus != "UNKNOWN") {
            updateAndonLEDs();
        }
    }
    prevState = currentState;

    // Blink de pausa: todos os LEDs piscam juntos a ~70 BPM quando GRAY
    if (currentState == OPERATIONAL && g_andonStatus == "GRAY") {
        updatePauseBlink();
    }
    // Blink de não-vinculado: amarelo pisca rápido quando UNASSIGNED
    if (currentState == OPERATIONAL && g_andonStatus == "UNASSIGNED") {
        updateUnassignedBlink();
    }
    // Blink de erro Odoo: vermelho rápido por 5s — integração Odoo falhou
    // Tem prioridade sobre o estado Andon atual; ao terminar restaura o estado
    if (g_odooErrorActive) {
        updateOdooErrorBlink();
    }
    // Blink de nó folha: amarelo lento (1s) indica sem WiFi direto, operando via mesh
    if (currentState == MESH_NODE) {
        updateMeshNodeBlink();
    }

    switch (currentState) {
        case BOOT:            break;
        case WIFI_CONNECTING: handleWiFiConnecting(); break;
        case MQTT_CONNECTING:
            g_mesh.update();
            handleMQTTConnecting();
            break;
        case OPERATIONAL:     handleOperational();   break;
        case MESH_NODE:       handleMeshNode();      break;
    }
}
