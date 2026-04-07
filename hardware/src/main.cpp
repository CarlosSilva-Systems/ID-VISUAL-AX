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
#include <set>
#include "config.h"

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

// Papel na mesh
bool g_isRoot            = false;
bool g_meshStarted       = false;
uint8_t g_directChildren = 0;
bool g_announcedFull     = false;
std::set<uint32_t> g_fullNodes;

// Fallback WiFi→Mesh: marca quando o WiFi caiu em OPERATIONAL
unsigned long g_wifiLostAt = 0;   // 0 = WiFi está ok

// Retry WiFi em MESH_NODE: tenta reconectar periodicamente
Timer wifiRetryTimer = {WIFI_RETRY_INTERVAL_MS, 0};

ButtonState greenButton  = {BTN_VERDE,    HIGH, 0, false};
ButtonState yellowButton = {BTN_AMARELO,  HIGH, 0, false};
ButtonState redButton    = {BTN_VERMELHO, HIGH, 0, false};
ButtonState pauseButton  = {BTN_PAUSE,    HIGH, 0, false};

LEDState redLED     = {LED_VERMELHO_PIN, false};
LEDState yellowLED  = {LED_AMARELO_PIN,  false};
LEDState greenLED   = {LED_VERDE_PIN,    false};
LEDState onboardLED = {LED_ONBOARD_PIN,  false};

Timer heartbeatTimer   = {HEARTBEAT_INTERVAL_MS,    0};
Timer heapMonitorTimer = {HEAP_MONITOR_INTERVAL_MS, 0};
Timer ledBlinkTimer    = {WIFI_BLINK_MS,            0};
Timer disconnectBlinkTimer = {60000UL, 0};  // 1 minuto para piscar vermelho quando desconectado

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
void publishButtonEvent(const String& color);
bool processLEDCommand(const String& payload);
void initializeGPIOs();
void initializeWatchdog();
void obtainMACAddress();
void startMesh(bool asRoot);
void stopMeshAndRejoinWiFi();
void announceMeshCapacity(bool full);
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
    // Atualiza LEDs baseado no status Andon recebido do backend
    if (g_andonStatus == "GREEN") {
        updateLEDState(&greenLED, true);
        updateLEDState(&yellowLED, false);
        updateLEDState(&redLED, false);
    } else if (g_andonStatus == "YELLOW") {
        updateLEDState(&greenLED, false);
        updateLEDState(&yellowLED, true);
        updateLEDState(&redLED, false);
    } else if (g_andonStatus == "RED") {
        updateLEDState(&greenLED, false);
        updateLEDState(&yellowLED, false);
        updateLEDState(&redLED, true);
    } else if (g_andonStatus == "GRAY") {
        // Pausado - todos apagados
        updateLEDState(&greenLED, false);
        updateLEDState(&yellowLED, false);
        updateLEDState(&redLED, false);
    }
    // UNKNOWN mantém o estado atual
}

void playBootAnimation() {
    // Jogo de luzes na inicialização: onda contínua
    for (int ciclo = 0; ciclo < 3; ciclo++) {
        // Verde acende
        digitalWrite(LED_VERDE_PIN, HIGH);
        delay(200);
        // Verde apaga enquanto amarelo acende
        digitalWrite(LED_VERDE_PIN, LOW);
        digitalWrite(LED_AMARELO_PIN, HIGH);
        delay(200);
        // Amarelo apaga enquanto vermelho acende
        digitalWrite(LED_AMARELO_PIN, LOW);
        digitalWrite(LED_VERMELHO_PIN, HIGH);
        delay(200);
        // Vermelho apaga
        digitalWrite(LED_VERMELHO_PIN, LOW);
        delay(200);
    }
}

void playWiFiConnectedAnimation() {
    // Verde pisca 3 vezes quando conecta WiFi
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_VERDE_PIN, HIGH);
        delay(200);
        digitalWrite(LED_VERDE_PIN, LOW);
        delay(200);
    }
}

void playMeshConnectedAnimation() {
    // Amarelo pisca 3 vezes quando conecta mesh
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_AMARELO_PIN, HIGH);
        delay(200);
        digitalWrite(LED_AMARELO_PIN, LOW);
        delay(200);
    }
}

void playDisconnectedBlink() {
    // Pisca vermelho 3 vezes (mantém LED do último status Andon)
    bool wasOn = redLED.state;
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_VERMELHO_PIN, HIGH);
        delay(200);
        digitalWrite(LED_VERMELHO_PIN, LOW);
        delay(200);
    }
    // Restaura estado anterior
    digitalWrite(LED_VERMELHO_PIN, wasOn ? HIGH : LOW);
}

// ═══════════════════════════════════════════════════════════
// MESH — CAPACIDADE E CALLBACKS
// ═══════════════════════════════════════════════════════════

void announceMeshCapacity(bool full) {
    StaticJsonDocument<64> doc;
    doc["type"] = "capacity";
    doc["full"] = full;
    doc["id"]   = String(g_mesh.getNodeId());
    String msg; serializeJson(doc, msg);
    g_mesh.sendBroadcast(msg);
}

void updateMeshCapacity() {
    auto nb = g_mesh.getNodeList(true);
    g_directChildren = (uint8_t)nb.size();
    bool isFull = (g_directChildren >= MESH_MAX_CHILDREN);
    if (isFull && !g_announcedFull) {
        g_announcedFull = true;
        announceMeshCapacity(true);
        logSerial("MESH: capacidade cheia (" + String(g_directChildren) + "/" + String(MESH_MAX_CHILDREN) + ")");
    } else if (!isFull && g_announcedFull) {
        g_announcedFull = false;
        announceMeshCapacity(false);
    }
}

void onMeshNewConnection(uint32_t nodeId) {
    logSerial("MESH: novo nó " + String(nodeId));
    updateMeshCapacity();
}

void onMeshDroppedConnection(uint32_t nodeId) {
    logSerial("MESH: nó desconectado " + String(nodeId));
    g_fullNodes.erase(nodeId);
    updateMeshCapacity();
}

void onMeshChangedConnections() {
    updateMeshCapacity();
}

void onMeshNodeTimeAdjusted(int32_t) {}

void onMeshMessage(uint32_t from, String& msg) {
    StaticJsonDocument<128> doc;
    if (deserializeJson(doc, msg) != DeserializationError::Ok) return;

    const char* type = doc["type"] | "";

    if (strcmp(type, "capacity") == 0) {
        uint32_t nodeId = (uint32_t)(doc["id"].as<String>().toInt());
        bool full = doc["full"] | false;
        if (full) g_fullNodes.insert(nodeId);
        else      g_fullNodes.erase(nodeId);
        return;
    }

    // Nó raiz republica eventos de botão no MQTT
    if (strcmp(type, "button") == 0 && g_isRoot && mqttClient.connected()) {
        const char* mac   = doc["mac"]   | "";
        const char* color = doc["color"] | "";
        if (strlen(mac) > 0 && strlen(color) > 0) {
            String topic = "andon/button/" + String(mac) + "/" + color;
            mqttClient.publish(topic.c_str(), "PRESSED", false);
            logSerial("MESH->MQTT: " + topic);
        }
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

    logSerial("MESH: iniciada como " + String(asRoot ? "RAIZ" : "NO-FOLHA") +
              " | ID=" + String(MESH_ID) + " canal=" + String(MESH_CHANNEL));
}

// Para a mesh e prepara para reconectar ao WiFi (quando WiFi volta em MESH_NODE)
void stopMeshAndRejoinWiFi() {
    logSerial("MESH: encerrando para reconectar ao WiFi...");
    g_mesh.stop();
    g_meshStarted    = false;
    g_isRoot         = false;
    g_announcedFull  = false;
    g_directChildren = 0;
    g_fullNodes.clear();
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
    // Animação de onda enquanto procura WiFi
    static unsigned long lastWaveUpdate = 0;
    static uint8_t waveStep = 0;
    unsigned long now = millis();
    
    if (now - lastWaveUpdate >= 250) {
        lastWaveUpdate = now;
        
        // Ciclo de onda: verde → amarelo → vermelho → (pausa) → repete
        switch (waveStep % 4) {
            case 0: // Verde acende, outros apagados
                digitalWrite(LED_VERDE_PIN, HIGH);
                digitalWrite(LED_AMARELO_PIN, LOW);
                digitalWrite(LED_VERMELHO_PIN, LOW);
                break;
            case 1: // Amarelo acende, verde apaga, vermelho apagado
                digitalWrite(LED_VERDE_PIN, LOW);
                digitalWrite(LED_AMARELO_PIN, HIGH);
                digitalWrite(LED_VERMELHO_PIN, LOW);
                break;
            case 2: // Vermelho acende, amarelo apaga, verde apagado
                digitalWrite(LED_VERDE_PIN, LOW);
                digitalWrite(LED_AMARELO_PIN, LOW);
                digitalWrite(LED_VERMELHO_PIN, HIGH);
                break;
            case 3: // Todos apagados (pausa antes de reiniciar)
                digitalWrite(LED_VERDE_PIN, LOW);
                digitalWrite(LED_AMARELO_PIN, LOW);
                digitalWrite(LED_VERMELHO_PIN, LOW);
                break;
        }
        waveStep++;
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
        WiFi.disconnect(true);
        WiFi.mode(WIFI_OFF);
        resetBackoff(&wifiReconnect);
        currentState = MESH_NODE;
        playMeshConnectedAnimation();
        startMesh(false);
    }
}

// ═══════════════════════════════════════════════════════════
// MQTT
// ═══════════════════════════════════════════════════════════

String createDiscoveryMessage() {
    StaticJsonDocument<320> doc;
    doc["mac_address"]      = macAddress;
    doc["device_name"]      = deviceName;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["is_root"]          = g_isRoot;
    doc["mesh_node_id"]     = String(g_mesh.getNodeId());
    doc["mesh_node_count"]  = (int)(g_mesh.getNodeList().size() + 1);
    doc["mesh_children"]    = g_directChildren;
    doc["rssi"]             = WiFi.RSSI();
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

    String ledTopic   = "andon/led/"   + macAddress + "/command";
    String stateTopic = "andon/state/" + macAddress;

    if (String(topic) == ledTopic && currentState == OPERATIONAL) {
        processLEDCommand(payloadStr);
    } else if (String(topic) == stateTopic) {
        payloadStr.trim();
        payloadStr.toUpperCase();
        
        // Atualiza status Andon e reflete nos LEDs
        if (payloadStr == "GREEN" || payloadStr == "YELLOW" || 
            payloadStr == "RED" || payloadStr == "GRAY") {
            g_andonStatus = payloadStr;
            g_lastAndonUpdate = millis();
            updateAndonLEDs();
            logSerial("ANDON STATE: " + payloadStr);
        }
    }
}

void handleMQTTConnecting() {
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

        String ledTopic   = "andon/led/"   + macAddress + "/command";
        String stateTopic = "andon/state/" + macAddress;
        mqttClient.subscribe(ledTopic.c_str(),   1);
        mqttClient.subscribe(stateTopic.c_str(), 1);
        mqttClient.subscribe("andon/ota/trigger", 1);

        String reqTopic = "andon/state/request/" + macAddress;
        mqttClient.publish(reqTopic.c_str(), "REQUEST", false);

        currentState = OPERATIONAL;
        g_wifiLostAt = 0;
        resetBackoff(&mqttReconnect);
        logSerial("MQTT: conectado -> OPERATIONAL (raiz, IP=" +
                  WiFi.localIP().toString() + " RSSI=" + String(WiFi.RSSI()) + "dBm)");
        return;
    }

    if (now - mqttReconnect.lastAttempt < mqttReconnect.backoffDelay) return;

    if (mqttReconnect.attemptCount >= MQTT_MAX_RETRIES) {
        logSerial("MQTT: max tentativas -> reiniciando");
        delay(500); ESP.restart();
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
        resetBackoff(&mqttReconnect);
        currentState = MQTT_CONNECTING;
        return;
    }

    processButton(&greenButton);
    processButton(&yellowButton);
    processButton(&redButton);
    processButton(&pauseButton);

    if (greenButton.pressed)  { publishButtonEvent("green");  greenButton.pressed  = false; }
    if (yellowButton.pressed) { publishButtonEvent("yellow"); yellowButton.pressed = false; }
    if (redButton.pressed)    { publishButtonEvent("red");    redButton.pressed    = false; }
    if (pauseButton.pressed)  { publishButtonEvent("pause");  pauseButton.pressed  = false; }

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
    processButton(&pauseButton);

    if (greenButton.pressed)  { publishButtonEvent("green");  greenButton.pressed  = false; }
    if (yellowButton.pressed) { publishButtonEvent("yellow"); yellowButton.pressed = false; }
    if (redButton.pressed)    { publishButtonEvent("red");    redButton.pressed    = false; }
    if (pauseButton.pressed)  { publishButtonEvent("pause");  pauseButton.pressed  = false; }

    if (checkTimer(&heartbeatTimer))
        logSerial("MESH-NODE: heap=" + String(ESP.getFreeHeap()) +
                  " nos=" + String(g_mesh.getNodeList().size() + 1));

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
    pinMode(BTN_PAUSE,    INPUT_PULLUP);

    const uint8_t leds[] = {LED_VERMELHO_PIN, LED_AMARELO_PIN, LED_VERDE_PIN, LED_ONBOARD_PIN};
    for (uint8_t p : leds) { pinMode(p, OUTPUT); digitalWrite(p, LOW); }

    logSerial("GPIO: inicializados");
}

void initializeWatchdog() {
    esp_task_wdt_init(WATCHDOG_TIMEOUT_S, true);
    esp_task_wdt_add(NULL);
    if (esp_reset_reason() == ESP_RST_TASK_WDT)
        logSerial("AVISO: Reset por watchdog detectado");
    logSerial("WDT: inicializado (" + String(WATCHDOG_TIMEOUT_S) + "s)");
}

void obtainMACAddress() {
    macAddress = WiFi.macAddress();
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
    updateOnboardLED();

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
