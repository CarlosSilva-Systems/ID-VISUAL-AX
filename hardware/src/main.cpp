/**
 * Firmware ESP32 Andon - Sistema ID Visual AX
 * Versão: 2.3.0
 * Data: 2026-04-07
 *
 * Arquitetura: WiFi Direto com fallback para ESP-MESH
 *
 * Lógica de conexão:
 *   1. Escaneia a rede AX-CORPORATIVO
 *   2. Se RSSI >= WIFI_RSSI_MIN_DBM (-80dBm ≈ 30% qualidade) → conecta direto
 *      e vira nó RAIZ (faz ponte WiFi↔MQTT para a mesh)
 *   3. Se rede não encontrada ou sinal fraco → entra como NÓ FOLHA na mesh,
 *      roteia eventos de botão via broadcast para o nó raiz
 *   4. Nó raiz monitora RSSI continuamente — se cair abaixo do limiar,
 *      anuncia degradação e reinicia para renegociar papel
 *   5. Máximo MESH_MAX_CHILDREN (4) filhos diretos por nó para estabilidade
 *
 * Máquina de estados:
 *   BOOT → WIFI_SCAN → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL (raiz)
 *                    ↘ MESH_NODE (folha, sem WiFi direto)
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
    WIFI_SCAN,          // Escaneia sinal antes de decidir WiFi ou Mesh
    WIFI_CONNECTING,    // Conectando ao AP diretamente (sinal bom)
    MQTT_CONNECTING,    // Conectando ao broker (nó raiz)
    OPERATIONAL,        // Funcionando — raiz com MQTT ativo
    MESH_NODE           // Nó folha — sem WiFi direto, roteia via mesh
};

struct ButtonState {
    uint8_t pin;
    bool lastState;
    bool currentState;
    unsigned long lastDebounceTime;
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

// Papel na mesh
bool g_isRoot         = false;   // true = nó raiz (tem WiFi direto)
bool g_meshStarted    = false;   // mesh já foi inicializada
uint8_t g_directChildren = 0;   // filhos diretos atuais
bool g_announcedFull  = false;   // já anunciou capacidade cheia
std::set<uint32_t> g_fullNodes; // nós que anunciaram estar cheios

// Scan WiFi
int8_t  g_scannedRSSI = 0;       // RSSI encontrado no scan
bool    g_scanDone    = false;   // scan concluído

ButtonState greenButton  = {BTN_VERDE,    HIGH, HIGH, 0, false};
ButtonState yellowButton = {BTN_AMARELO,  HIGH, HIGH, 0, false};
ButtonState redButton    = {BTN_VERMELHO, HIGH, HIGH, 0, false};
ButtonState pauseButton  = {BTN_PAUSE,    HIGH, HIGH, 0, false};

LEDState redLED     = {LED_VERMELHO_PIN, false};
LEDState yellowLED  = {LED_AMARELO_PIN,  false};
LEDState greenLED   = {LED_VERDE_PIN,    false};
LEDState onboardLED = {LED_ONBOARD_PIN,  false};

Timer heartbeatTimer    = {HEARTBEAT_INTERVAL_MS,    0};
Timer heapMonitorTimer  = {HEAP_MONITOR_INTERVAL_MS, 0};
Timer ledBlinkTimer     = {WIFI_BLINK_MS,            0};
Timer rssiMonitorTimer  = {RSSI_MONITOR_INTERVAL_MS, 0};  // monitora sinal do raiz

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
void handleWiFiScan();
void handleWiFiConnecting();
void updateOnboardLED();
void handleMQTTConnecting();
void mqttCallback(char* topic, byte* payload, unsigned int length);
String createDiscoveryMessage();
void logMQTT(const String& message);
void processButton(ButtonState* btn);
void publishButtonEvent(const String& color);
bool processLEDCommand(const String& payload);
void updateLEDState(LEDState* led, bool state);
bool checkTimer(Timer* timer);
void handleOperational();
void handleMeshNode();
void initializeGPIOs();
void initializeWatchdog();
void obtainMACAddress();
void startMesh(bool asRoot);
void announceMeshCapacity(bool full);
void updateMeshCapacity();

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

// Mensagens recebidas via mesh (nó raiz republica no MQTT)
void onMeshMessage(uint32_t from, String& msg) {
    StaticJsonDocument<128> doc;
    if (deserializeJson(doc, msg) != DeserializationError::Ok) return;

    const char* type = doc["type"] | "";

    // Atualizar mapa de capacidade
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

// Inicia a mesh (modo AP+STA para o raiz, AP para folhas)
void startMesh(bool asRoot) {
    if (g_meshStarted) return;
    g_meshStarted = true;
    g_isRoot = asRoot;

    g_mesh.setDebugMsgTypes(ERROR | STARTUP);
    g_mesh.init(MESH_ID, MESH_PASSWORD, MESH_PORT, WIFI_AP_STA, MESH_CHANNEL);

    if (asRoot) {
        // Raiz já tem WiFi conectado — passa as credenciais para a mesh
        // usar a interface STA já associada
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

// ═══════════════════════════════════════════════════════════
// LED ONBOARD
// ═══════════════════════════════════════════════════════════

void updateOnboardLED() {
    unsigned long now = millis();
    switch (currentState) {
        case WIFI_SCAN:
        case WIFI_CONNECTING:
            // Pisca rápido 500ms — buscando WiFi
            if (now - ledBlinkTimer.lastTrigger >= WIFI_BLINK_MS) {
                onboardLED.state = !onboardLED.state;
                digitalWrite(LED_ONBOARD_PIN, onboardLED.state ? HIGH : LOW);
                ledBlinkTimer.lastTrigger = now;
            }
            break;
        case MQTT_CONNECTING:
            // Pisca lento 1s — WiFi ok, aguardando MQTT
            if (now - ledBlinkTimer.lastTrigger >= MQTT_BLINK_MS) {
                onboardLED.state = !onboardLED.state;
                digitalWrite(LED_ONBOARD_PIN, onboardLED.state ? HIGH : LOW);
                ledBlinkTimer.lastTrigger = now;
            }
            break;
        case MESH_NODE:
            // Dois pulsos rápidos a cada 2s — modo folha mesh
            {
                unsigned long t = (now / 2000) % 2;
                unsigned long phase = now % 2000;
                bool on = (phase < 150) || (phase > 300 && phase < 450);
                if (on != onboardLED.state) {
                    onboardLED.state = on;
                    digitalWrite(LED_ONBOARD_PIN, on ? HIGH : LOW);
                }
            }
            break;
        case OPERATIONAL:
            // Aceso fixo — tudo ok
            if (!onboardLED.state) {
                onboardLED.state = true;
                digitalWrite(LED_ONBOARD_PIN, HIGH);
            }
            break;
        default: break;
    }
}

// ═══════════════════════════════════════════════════════════
// WIFI SCAN — decide WiFi direto ou Mesh
// ═══════════════════════════════════════════════════════════

void handleWiFiScan() {
    if (!g_scanDone) {
        // Inicia scan assíncrono na primeira chamada
        logSerial("WIFI: escaneando rede " + String(WIFI_SSID) + "...");
        WiFi.mode(WIFI_STA);
        WiFi.disconnect(true);
        delay(100);
        WiFi.scanNetworks(true); // assíncrono
        g_scanDone = true;
        return;
    }

    int n = WiFi.scanComplete();
    if (n == WIFI_SCAN_RUNNING) return; // ainda escaneando

    if (n <= 0) {
        // Rede não encontrada
        logSerial("WIFI: rede '" + String(WIFI_SSID) + "' nao encontrada -> MESH_NODE");
        WiFi.scanDelete();
        currentState = MESH_NODE;
        startMesh(false);
        return;
    }

    // Procurar a rede alvo e pegar o melhor RSSI
    int8_t bestRSSI = -127;
    for (int i = 0; i < n; i++) {
        if (WiFi.SSID(i) == String(WIFI_SSID)) {
            if (WiFi.RSSI(i) > bestRSSI) bestRSSI = WiFi.RSSI(i);
        }
    }
    WiFi.scanDelete();

    if (bestRSSI == -127) {
        logSerial("WIFI: SSID '" + String(WIFI_SSID) + "' nao encontrado -> MESH_NODE");
        currentState = MESH_NODE;
        startMesh(false);
        return;
    }

    g_scannedRSSI = bestRSSI;
    logSerial("WIFI: RSSI=" + String(bestRSSI) + "dBm (limiar=" + String(WIFI_RSSI_MIN_DBM) + "dBm)");

    if (bestRSSI >= WIFI_RSSI_MIN_DBM) {
        logSerial("WIFI: sinal bom -> WIFI_CONNECTING (modo raiz)");
        currentState = WIFI_CONNECTING;
    } else {
        logSerial("WIFI: sinal fraco -> MESH_NODE (modo folha)");
        currentState = MESH_NODE;
        startMesh(false);
    }
}

// ═══════════════════════════════════════════════════════════
// WIFI CONNECTING
// ═══════════════════════════════════════════════════════════

void handleWiFiConnecting() {
    unsigned long now = millis();

    if (WiFi.status() == WL_CONNECTED) {
        int8_t rssi = WiFi.RSSI();
        logSerial("WIFI: Conectado! IP=" + WiFi.localIP().toString() +
                  " RSSI=" + String(rssi) + "dBm");

        // Inicia mesh como raiz (usa a conexão WiFi já estabelecida)
        startMesh(true);

        currentState = MQTT_CONNECTING;
        resetBackoff(&wifiReconnect);
        logSerial("WIFI: -> MQTT_CONNECTING (raiz)");
        return;
    }

    if (now - wifiReconnect.lastAttempt < wifiReconnect.backoffDelay) return;

    if (wifiReconnect.attemptCount == 0) {
        logSerial("WIFI: conectando a " + String(WIFI_SSID) + "...");
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }

    wifiReconnect.lastAttempt = now;

    // Timeout: se não conectou em WIFI_TIMEOUT_MS, cai para mesh
    if (wifiReconnect.attemptCount > 0 &&
        (now - wifiReconnect.lastAttempt) >= WIFI_TIMEOUT_MS) {
        logSerial("WIFI: timeout -> MESH_NODE (fallback)");
        WiFi.disconnect(true);
        currentState = MESH_NODE;
        startMesh(false);
        return;
    }

    updateBackoff(&wifiReconnect);
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
        payloadStr.trim(); payloadStr.toUpperCase();
        logSerial("ANDON STATE: " + payloadStr);
    }
}

void handleMQTTConnecting() {
    unsigned long now = millis();

    // Se WiFi caiu enquanto era raiz, tenta reconectar WiFi
    if (WiFi.status() != WL_CONNECTED) {
        logSerial("MQTT: WiFi perdido -> WIFI_SCAN");
        g_scanDone = false;
        currentState = WIFI_SCAN;
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
// MESH NODE — nó folha (sem WiFi direto)
// ═══════════════════════════════════════════════════════════

void handleMeshNode() {
    g_mesh.update();

    // Processar botões e enviar via mesh broadcast para o raiz
    processButton(&greenButton);
    processButton(&yellowButton);
    processButton(&redButton);
    processButton(&pauseButton);

    if (greenButton.pressed)  { publishButtonEvent("green");  greenButton.pressed  = false; }
    if (yellowButton.pressed) { publishButtonEvent("yellow"); yellowButton.pressed = false; }
    if (redButton.pressed)    { publishButtonEvent("red");    redButton.pressed    = false; }
    if (pauseButton.pressed)  { publishButtonEvent("pause");  pauseButton.pressed  = false; }

    // Heartbeat local a cada 5 minutos (sem MQTT, só serial)
    if (checkTimer(&heartbeatTimer))
        logSerial("MESH-NODE: heap=" + String(ESP.getFreeHeap()) +
                  " nos=" + String(g_mesh.getNodeList().size() + 1));
}

// ═══════════════════════════════════════════════════════════
// BOTÕES E LEDS
// ═══════════════════════════════════════════════════════════

void processButton(ButtonState* btn) {
    unsigned long now = millis();
    bool reading = digitalRead(btn->pin);

    if (reading != btn->lastState) btn->lastDebounceTime = now;

    if ((now - btn->lastDebounceTime) > DEBOUNCE_MS) {
        if (reading != btn->currentState) {
            btn->currentState = reading;
            if (btn->currentState == LOW) btn->pressed = true;
        }
    }
    btn->lastState = reading;
}

void publishButtonEvent(const String& color) {
    // Nó raiz com MQTT: publica direto
    if (g_isRoot && mqttClient.connected()) {
        String topic = "andon/button/" + macAddress + "/" + color;
        if (mqttClient.publish(topic.c_str(), "PRESSED", false))
            logSerial("BUTTON: " + color + " -> MQTT " + topic);
        else
            logSerial("ERRO: falha ao publicar botão " + color);
        return;
    }
    // Nó folha: envia via mesh broadcast para o raiz republicar
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
// ESTADO OPERATIONAL (nó raiz)
// ═══════════════════════════════════════════════════════════

void handleOperational() {
    // Manter mesh atualizada mesmo sendo raiz
    g_mesh.update();

    if (mqttClient.connected()) mqttClient.loop();

    // Verificar se WiFi ainda está ok
    if (WiFi.status() != WL_CONNECTED) {
        logSerial("OPERATIONAL: WiFi perdido -> WIFI_SCAN");
        mqttClient.disconnect();
        g_scanDone = false;
        currentState = WIFI_SCAN;
        return;
    }

    if (!mqttClient.connected()) {
        logSerial("OPERATIONAL: MQTT perdido -> MQTT_CONNECTING");
        resetBackoff(&mqttReconnect);
        currentState = MQTT_CONNECTING;
        return;
    }

    // Monitorar RSSI — se cair abaixo do limiar, reinicia para renegociar papel
    if (checkTimer(&rssiMonitorTimer)) {
        int8_t rssi = WiFi.RSSI();
        if (rssi < WIFI_RSSI_MIN_DBM) {
            logSerial("OPERATIONAL: RSSI degradado (" + String(rssi) +
                      "dBm < " + String(WIFI_RSSI_MIN_DBM) + "dBm) -> reiniciando");
            delay(500);
            ESP.restart();
        }
    }

    processButton(&greenButton);
    processButton(&yellowButton);
    processButton(&redButton);
    processButton(&pauseButton);

    if (greenButton.pressed)  { publishButtonEvent("green");  greenButton.pressed  = false; }
    if (yellowButton.pressed) { publishButtonEvent("yellow"); yellowButton.pressed = false; }
    if (redButton.pressed)    { publishButtonEvent("red");    redButton.pressed    = false; }
    if (pauseButton.pressed)  { publishButtonEvent("pause");  pauseButton.pressed  = false; }

    // Heartbeat a cada 5 minutos
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

    // Monitor de heap a cada 30s
    if (checkTimer(&heapMonitorTimer)) {
        uint32_t heap = ESP.getFreeHeap();
        if (heap < HEAP_WARN_THRESHOLD)
            logMQTT("AVISO: Heap baixo - " + String(heap) + " bytes");
    }
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
    Serial.println("  Firmware ESP32 Andon v2.3.0 - ID Visual AX");
    Serial.println("  WiFi Direto + Fallback ESP-MESH");
    Serial.println("═══════════════════════════════════════════════════════");
    Serial.println();

    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_ONBOARD_PIN, HIGH); delay(200);
        digitalWrite(LED_ONBOARD_PIN, LOW);  delay(200);
    }

    initializeGPIOs();
    initializeWatchdog();
    obtainMACAddress();

    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setBufferSize(MQTT_BUFFER_SIZE);
    mqttClient.setCallback(mqttCallback);
    logSerial("MQTT: broker=" + String(MQTT_BROKER) + ":" + String(MQTT_PORT));

    // Começa sempre pelo scan para decidir WiFi direto ou mesh
    currentState = WIFI_SCAN;
    logSerial("BOOT: -> WIFI_SCAN");
}

void loop() {
    esp_task_wdt_reset();
    updateOnboardLED();

    switch (currentState) {
        case BOOT:            break;
        case WIFI_SCAN:       handleWiFiScan();       break;
        case WIFI_CONNECTING: handleWiFiConnecting();  break;
        case MQTT_CONNECTING:
            g_mesh.update();
            handleMQTTConnecting();
            break;
        case OPERATIONAL:     handleOperational();    break;
        case MESH_NODE:       handleMeshNode();       break;
    }
}
