#pragma once

// ─── Versão ────────────────────────────────────────────────
#define FIRMWARE_VERSION "1.0.0"

// ─── WiFi ──────────────────────────────────────────────────
#define WIFI_SSID "AX-CORPORATIVO"
#define WIFI_PASSWORD "auto@bacia"
#define WIFI_TIMEOUT_MS 30000
#define WIFI_BLINK_MS 500

// ─── MQTT Broker ───────────────────────────────────────────
#define MQTT_BROKER "192.168.10.55"
#define MQTT_PORT 1883
#define MQTT_BUFFER_SIZE 512
#define MQTT_TIMEOUT_MS 10000
#define MQTT_BLINK_MS 1000
#define MQTT_MAX_RETRIES 10

// ─── Pinos — Botões ────────────────────────────────────────
#define BTN_VERDE 12    // suporta INPUT_PULLUP
#define BTN_AMARELO 13  // suporta INPUT_PULLUP
#define BTN_VERMELHO 32 // suporta INPUT_PULLUP

// ─── Pinos — LEDs de status ────────────────────────────────
#define LED_VERMELHO_PIN 25
#define LED_AMARELO_PIN 26
#define LED_VERDE_PIN 33
#define LED_ONBOARD_PIN 2

// ─── Timers (ms) ───────────────────────────────────────────
#define DEBOUNCE_MS 200  // Aumentado para 200ms para botões com bouncing extremo
#define STABLE_READS_REQUIRED 3  // Número de leituras consecutivas iguais necessárias
#define HEARTBEAT_INTERVAL_MS 300000  // 5 minutos
#define HEAP_MONITOR_INTERVAL_MS 30000 // 30 segundos
#define CHECK_INTERVAL_MS 5000

// ─── Cooldown de Botões (ms) ───────────────────────────────
#define BTN_GREEN_COOLDOWN_MS 10000   // 10 segundos
#define BTN_YELLOW_COOLDOWN_MS 5000   // 5 segundos
#define BTN_RED_COOLDOWN_MS 5000      // 5 segundos

// ─── Reconexão ─────────────────────────────────────────────
#define INITIAL_BACKOFF_MS 5000
#define MAX_BACKOFF_MS 60000

// ─── Thresholds ────────────────────────────────────────────
#define HEAP_WARN_THRESHOLD 10240  // 10KB
#define WATCHDOG_TIMEOUT_S 30
