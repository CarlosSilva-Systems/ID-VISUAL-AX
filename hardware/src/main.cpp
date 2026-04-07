/**
 * Firmware ESP32 Andon - Sistema ID Visual AX
 * Versão: 1.0.0
 * Data: 2026-03-31
 *
 * Descrição: Firmware para dispositivo ESP32 que atua como interface física
 * do sistema Andon, capturando eventos de botões e controlando LEDs de status
 * através de comunicação MQTT bidirecional com o backend FastAPI.
 *
 * Arquitetura: WiFi direto (sem mesh) + MQTT + botões + LEDs
 * Máquina de estados: BOOT → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <esp_system.h>
#include "config.h"

// ═══════════════════════════════════════════════════════════
// ESTRUTURAS DE DADOS
// ═══════════════════════════════════════════════════════════

enum SystemState {
    BOOT,
    WIFI_CONNECTING,
    MQTT_CONNECTING,
    OPERATIONAL
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

ReconnectionState wifiReconnect = {0, INITIAL_BACKOFF_MS, 0};
ReconnectionState mqttReconnect = {0, INITIAL_BACKOFF_MS, 0};

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// ═══════════════════════════════════════════════════════════
// DECLARAÇÕES ANTECIPADAS
// ═══════════════════════════════════════════════════════════

void logSerial(const String& message);
void updateBackoff(ReconnectionState* state);
void resetBackoff(ReconnectionState* state);
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
void initializeGPIOs();
void initializeWatchdog();
void obtainMACAddress();

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
    state->backoffDelay = min(state->backoffDelay * 2, (unsigned long)MAX_BACKOFF_MS);
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
// LED ONBOARD
// ═══════════════════════════════════════════════════════════

void updateOnboardLED() {
    unsigned long now = millis();

    if (currentState == WIFI_CONNECTING) {
        if (now - ledBlinkTimer.lastTrigger >= WIFI_BLINK_MS) {
            onboardLED.state = !onboardLED.state;
            digitalWrite(LED_ONBOARD_PIN, onboardLED.state ? HIGH : LOW);
            ledBlinkTimer.lastTrigger = now;
        }
    } else if (currentState == MQTT_CONNECTING) {
        if (now - ledBlinkTimer.lastTrigger >= MQTT_BLINK_MS) {
            onboardLED.state = !onboardLED.state;
            digitalWrite(LED_ONBOARD_PIN, onboardLED.state ? HIGH : LOW);
            ledBlinkTimer.lastTrigger = now;
        }
    } else if (currentState == OPERATIONAL) {
        if (!onboardLED.state) {
            onboardLED.state = true;
            digitalWrite(LED_ONBOARD_PIN, HIGH);
        }
    }
}

// ═══════════════════════════════════════════════════════════
// WIFI
// ═══════════════════════════════════════════════════════════

void handleWiFiConnecting() {
    unsigned long now = millis();

    if (WiFi.status() == WL_CONNECTED) {
        logSerial("WIFI: Conectado! IP: " + WiFi.localIP().toString());
        currentState = MQTT_CONNECTING;
        resetBackoff(&wifiReconnect);
        logSerial("WIFI: -> MQTT_CONNECTING");
        return;
    }

    if (now - wifiReconnect.lastAttempt < wifiReconnect.backoffDelay) return;

    if (wifiReconnect.attemptCount == 0) {
        logSerial("WIFI: Conectando a " + String(WIFI_SSID) + "...");
        WiFi.mode(WIFI_STA);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }

    wifiReconnect.lastAttempt = now;

    if (wifiReconnect.attemptCount > 0 &&
        (now - wifiReconnect.lastAttempt) >= WIFI_TIMEOUT_MS) {
        logSerial("WIFI: Timeout, tentando novamente em " +
                  String(wifiReconnect.backoffDelay / 1000) + "s");
        updateBackoff(&wifiReconnect);
        WiFi.disconnect();
    }
}

// ═══════════════════════════════════════════════════════════
// MQTT
// ═══════════════════════════════════════════════════════════

String createDiscoveryMessage() {
    StaticJsonDocument<256> doc;
    doc["mac_address"]      = macAddress;
    doc["device_name"]      = deviceName;
    doc["firmware_version"] = FIRMWARE_VERSION;
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

    logSerial("MQTT: msg em " + String(topic));

    String ledTopic = "andon/led/" + macAddress + "/command";
    if (String(topic) == ledTopic && currentState == OPERATIONAL) {
        processLEDCommand(payloadStr);
    }

    // Estado Andon recebido do backend
    String stateTopic = "andon/state/" + macAddress;
    if (String(topic) == stateTopic) {
        payloadStr.trim();
        payloadStr.toUpperCase();
        logSerial("ANDON STATE: " + payloadStr);
    }
}

void handleMQTTConnecting() {
    unsigned long now = millis();

    if (WiFi.status() != WL_CONNECTED) {
        logSerial("MQTT: WiFi perdido -> WIFI_CONNECTING");
        currentState = WIFI_CONNECTING;
        return;
    }

    if (mqttClient.connected()) {
        // Publicar status online com retain
        String statusTopic = "andon/status/" + macAddress;
        mqttClient.publish(statusTopic.c_str(), "online", true);
        logSerial("MQTT: Status 'online' publicado");

        // Discovery
        String disc = createDiscoveryMessage();
        if (!disc.isEmpty()) {
            mqttClient.publish("andon/discovery", disc.c_str(), false);
            logSerial("MQTT: Discovery publicado: " + disc);
        }

        // Subscrever comandos LED e estado Andon
        String ledTopic   = "andon/led/"   + macAddress + "/command";
        String stateTopic = "andon/state/" + macAddress;
        mqttClient.subscribe(ledTopic.c_str(),   1);
        mqttClient.subscribe(stateTopic.c_str(), 1);
        logSerial("MQTT: Subscrito em " + ledTopic);

        // Solicitar estado atual ao backend
        String reqTopic = "andon/state/request/" + macAddress;
        mqttClient.publish(reqTopic.c_str(), "REQUEST", false);

        currentState = OPERATIONAL;
        resetBackoff(&mqttReconnect);
        logSerial("MQTT: -> OPERATIONAL");
        return;
    }

    if (now - mqttReconnect.lastAttempt < mqttReconnect.backoffDelay) return;

    if (mqttReconnect.attemptCount >= MQTT_MAX_RETRIES) {
        logSerial("MQTT: 10 tentativas falhadas, reiniciando...");
        delay(1000);
        ESP.restart();
    }

    if (mqttReconnect.attemptCount == 0)
        logSerial("MQTT: Conectando ao broker " + String(MQTT_BROKER) +
                  ":" + String(MQTT_PORT) + "...");

    String lwtTopic = "andon/status/" + macAddress;
    bool connected = mqttClient.connect(
        deviceName.c_str(),
        lwtTopic.c_str(), 1, true, "offline"
    );

    mqttReconnect.lastAttempt = now;

    if (!connected) {
        logSerial("MQTT: Falha rc=" + String(mqttClient.state()) +
                  ", retry em " + String(mqttReconnect.backoffDelay / 1000) + "s");
        updateBackoff(&mqttReconnect);
    }
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
    String topic = "andon/button/" + macAddress + "/" + color;
    if (mqttClient.publish(topic.c_str(), "PRESSED", false)) {
        logSerial("BUTTON: " + color + " -> " + topic);
    } else {
        logSerial("ERRO: Falha ao publicar botão " + color);
    }
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
// ESTADO OPERATIONAL
// ═══════════════════════════════════════════════════════════

void handleOperational() {
    if (WiFi.status() != WL_CONNECTED) {
        logSerial("OPERATIONAL: WiFi perdido -> WIFI_CONNECTING");
        currentState = WIFI_CONNECTING;
        return;
    }
    if (!mqttClient.connected()) {
        logSerial("OPERATIONAL: MQTT perdido -> MQTT_CONNECTING");
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

    // Heartbeat a cada 5 minutos
    if (checkTimer(&heartbeatTimer)) {
        String statusTopic = "andon/status/" + macAddress;
        mqttClient.publish(statusTopic.c_str(), "heartbeat", false);
        logSerial("HEARTBEAT: heap=" + String(ESP.getFreeHeap()) + " bytes");
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
    Serial.println("  Firmware ESP32 Andon v1.0.0 - ID Visual AX");
    Serial.println("  WiFi Direto + MQTT");
    Serial.println("═══════════════════════════════════════════════════════");
    Serial.println();

    // Piscar 3x no boot
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
    logSerial("MQTT: cliente configurado para " + String(MQTT_BROKER));

    currentState = WIFI_CONNECTING;
    logSerial("BOOT: -> WIFI_CONNECTING");
}

void loop() {
    esp_task_wdt_reset();

    if (mqttClient.connected()) mqttClient.loop();

    updateOnboardLED();

    switch (currentState) {
        case BOOT:            break;
        case WIFI_CONNECTING: handleWiFiConnecting(); break;
        case MQTT_CONNECTING: handleMQTTConnecting(); break;
        case OPERATIONAL:     handleOperational();    break;
    }
}
