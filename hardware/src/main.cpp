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

void setup() {
    // Placeholder
}

void loop() {
    // Placeholder
}
