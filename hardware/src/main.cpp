/**
 * Firmware ESP32 Andon - Sistema ID Visual AX
 * Versão: 1.0.0
 * Autor: Sistema ID Visual AX
 * Data: 2026-03-31
 * 
 * Descrição: Firmware para dispositivo ESP32 que atua como interface física
 * do sistema Andon, capturando eventos de botões e controlando LEDs de status
 * através de comunicação MQTT bidirecional com o backend FastAPI.
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

// Estados da máquina de estados
enum SystemState {
    BOOT,
    WIFI_CONNECTING,
    MQTT_CONNECTING,
    OPERATIONAL
};

// Estado de um botão com debounce
struct ButtonState {
    uint8_t pin;
    bool lastState;
    bool currentState;
    unsigned long lastDebounceTime;
    bool pressed;
};

// Estado de um LED
struct LEDState {
    uint8_t pin;
    bool state;
};

// Timer não-bloqueante
struct Timer {
    unsigned long interval;
    unsigned long lastTrigger;
};

// Estado de reconexão com backoff exponencial
struct ReconnectionState {
    uint8_t attemptCount;
    unsigned long backoffDelay;
    unsigned long lastAttempt;
};

// ═══════════════════════════════════════════════════════════
// VARIÁVEIS GLOBAIS
// ═══════════════════════════════════════════════════════════

// Estado do sistema
SystemState currentState = BOOT;
String macAddress;
String deviceName;

// Botões
ButtonState greenButton = {BTN_VERDE, HIGH, HIGH, 0, false};
ButtonState yellowButton = {BTN_AMARELO, HIGH, HIGH, 0, false};
ButtonState redButton = {BTN_VERMELHO, HIGH, HIGH, 0, false};

// LEDs
LEDState redLED = {LED_VERMELHO_PIN, LOW};
LEDState yellowLED = {LED_AMARELO_PIN, LOW};
LEDState greenLED = {LED_VERDE_PIN, LOW};
LEDState onboardLED = {LED_ONBOARD_PIN, LOW};

// Timers
Timer heartbeatTimer = {HEARTBEAT_INTERVAL_MS, 0};
Timer heapMonitorTimer = {HEAP_MONITOR_INTERVAL_MS, 0};
Timer ledBlinkTimer = {WIFI_BLINK_MS, 0};

// Reconexão
ReconnectionState wifiReconnect = {0, INITIAL_BACKOFF_MS, 0};
ReconnectionState mqttReconnect = {0, INITIAL_BACKOFF_MS, 0};

// Clientes WiFi e MQTT
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// ═══════════════════════════════════════════════════════════
// DECLARAÇÕES DE FUNÇÕES
// ═══════════════════════════════════════════════════════════

void updateBackoff(ReconnectionState* state);
void resetBackoff(ReconnectionState* state);
void handleWiFiConnecting();
void updateOnboardLED();

/**
 * Atualiza o backoff exponencial após falha
 */
void updateBackoff(ReconnectionState* state) {
    state->attemptCount++;
    state->backoffDelay = min(state->backoffDelay * 2, (unsigned long)MAX_BACKOFF_MS);
}

/**
 * Reseta o backoff após sucesso
 */
void resetBackoff(ReconnectionState* state) {
    state->attemptCount = 0;
    state->backoffDelay = INITIAL_BACKOFF_MS;
}

/**
 * Atualiza o LED onboard baseado no estado atual
 */
void updateOnboardLED() {
    unsigned long now = millis();
    
    if (currentState == WIFI_CONNECTING) {
        // Piscar a cada 500ms
        if (now - ledBlinkTimer.lastTrigger >= WIFI_BLINK_MS) {
            onboardLED.state = !onboardLED.state;
            digitalWrite(LED_ONBOARD_PIN, onboardLED.state ? HIGH : LOW);
            ledBlinkTimer.lastTrigger = now;
        }
    } else if (currentState == MQTT_CONNECTING) {
        // Piscar a cada 1000ms
        if (now - ledBlinkTimer.lastTrigger >= MQTT_BLINK_MS) {
            onboardLED.state = !onboardLED.state;
            digitalWrite(LED_ONBOARD_PIN, onboardLED.state ? HIGH : LOW);
            ledBlinkTimer.lastTrigger = now;
        }
    } else if (currentState == OPERATIONAL) {
        // Aceso continuamente
        if (!onboardLED.state) {
            onboardLED.state = true;
            digitalWrite(LED_ONBOARD_PIN, HIGH);
        }
    }
}

/**
 * Gerencia a conexão WiFi com backoff exponencial
 */
void handleWiFiConnecting() {
    unsigned long now = millis();
    
    // Verificar se já está conectado
    if (WiFi.status() == WL_CONNECTED) {
        String ip = WiFi.localIP().toString();
        logSerial("WIFI: Conectado! IP: " + ip);
        
        // Transitar para MQTT_CONNECTING
        currentState = MQTT_CONNECTING;
        resetBackoff(&wifiReconnect);
        logSerial("WIFI: Transição para MQTT_CONNECTING");
        return;
    }
    
    // Verificar se é hora de tentar reconectar
    if (now - wifiReconnect.lastAttempt < wifiReconnect.backoffDelay) {
        return; // Ainda no período de backoff
    }
    
    // Tentar conectar
    if (wifiReconnect.attemptCount == 0) {
        logSerial("WIFI: Conectando a " + String(WIFI_SSID) + "...");
        WiFi.mode(WIFI_STA);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    
    wifiReconnect.lastAttempt = now;
    
    // Verificar timeout de 30s
    if (wifiReconnect.attemptCount > 0 && (now - wifiReconnect.lastAttempt) >= WIFI_TIMEOUT_MS) {
        logSerial("WIFI: Timeout após 30s, tentando novamente em " + String(wifiReconnect.backoffDelay / 1000) + "s");
        updateBackoff(&wifiReconnect);
        WiFi.disconnect();
    }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════

/**
 * Publica mensagem de log no Serial Monitor com timestamp
 */
void logSerial(const String& message) {
    unsigned long timestamp = millis();
    Serial.print("[");
    Serial.print(timestamp);
    Serial.print("] ");
    Serial.println(message);
}

/**
 * Inicializa todos os GPIOs (botões e LEDs)
 */
void initializeGPIOs() {
    // Configurar botões
    pinMode(BTN_VERDE, INPUT);          // GPIO 34 - input-only
    pinMode(BTN_AMARELO, INPUT);        // GPIO 35 - input-only
    pinMode(BTN_VERMELHO, INPUT_PULLUP); // GPIO 32 - suporta pull-up
    
    // Configurar LEDs
    pinMode(LED_VERMELHO_PIN, OUTPUT);
    pinMode(LED_AMARELO_PIN, OUTPUT);
    pinMode(LED_VERDE_PIN, OUTPUT);
    pinMode(LED_ONBOARD_PIN, OUTPUT);
    
    // Definir estado inicial (todos apagados)
    digitalWrite(LED_VERMELHO_PIN, LOW);
    digitalWrite(LED_AMARELO_PIN, LOW);
    digitalWrite(LED_VERDE_PIN, LOW);
    digitalWrite(LED_ONBOARD_PIN, LOW);
    
    logSerial("GPIOs inicializados");
}

/**
 * Inicializa o Watchdog Timer
 */
void initializeWatchdog() {
    esp_task_wdt_init(WATCHDOG_TIMEOUT_S, true);
    esp_task_wdt_add(NULL);
    
    // Detectar se houve reset por watchdog
    esp_reset_reason_t reason = esp_reset_reason();
    if (reason == ESP_RST_TASK_WDT) {
        logSerial("AVISO: Watchdog reset detectado");
    }
    
    logSerial("Watchdog Timer inicializado (30s timeout)");
}

/**
 * Obtém e formata o MAC address do ESP32
 */
void obtainMACAddress() {
    macAddress = WiFi.macAddress();
    
    // Extrair últimos 4 caracteres (sem ':')
    String macSuffix = macAddress.substring(macAddress.length() - 5);
    macSuffix.replace(":", "");
    
    // Criar device name
    deviceName = "ESP32-Andon-" + macSuffix;
    
    logSerial("MAC Address: " + macAddress);
    logSerial("Device Name: " + deviceName);
}

// ═══════════════════════════════════════════════════════════
// IMPLEMENTAÇÃO - SETUP
// ═══════════════════════════════════════════════════════════

void setup() {
    // Inicializar Serial Monitor
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {
        ; // Aguardar Serial estar pronto (timeout 3s)
    }
    
    // Mensagem de boot
    Serial.println();
    Serial.println("═══════════════════════════════════════════════════════");
    Serial.println("  Firmware ESP32 Andon - Sistema ID Visual AX");
    Serial.println("  Versão: " + String(FIRMWARE_VERSION));
    Serial.println("═══════════════════════════════════════════════════════");
    Serial.println();
    
    logSerial("BOOT: Iniciando firmware ID Visual AX v" + String(FIRMWARE_VERSION));
    
    // Piscar LED onboard 3x para sinalizar boot
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_ONBOARD_PIN, HIGH);
        delay(200);
        digitalWrite(LED_ONBOARD_PIN, LOW);
        delay(200);
    }
    
    // Inicializar componentes
    initializeGPIOs();
    initializeWatchdog();
    obtainMACAddress();
    
    // Configurar cliente MQTT
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setBufferSize(MQTT_MAX_PACKET_SIZE);
    logSerial("MQTT: Cliente configurado");
    
    // Transitar para WIFI_CONNECTING
    currentState = WIFI_CONNECTING;
    logSerial("BOOT: Transição para WIFI_CONNECTING");
}

void loop() {
    // Placeholder
}
