#pragma once

// ─── Versão ────────────────────────────────────────────────
#define FIRMWARE_VERSION "1.0.0"

// ─── WiFi ──────────────────────────────────────────────────
#define WIFI_SSID           "AX-CORPORATIVO"
#define WIFI_PASSWORD       "auto@bacia"
#define WIFI_TIMEOUT_MS     30000
#define WIFI_BLINK_MS       500

// ─── MQTT Broker ───────────────────────────────────────────
#define MQTT_BROKER         "192.168.10.55"
#define MQTT_PORT           1883
#define MQTT_BUFFER_SIZE    512
#define MQTT_MAX_PACKET_SIZE 512
#define MQTT_TIMEOUT_MS     10000
#define MQTT_BLINK_MS       1000
#define MQTT_MAX_RETRIES    10

// ─── Pinos — Botões (INPUT_PULLUP, ativo em LOW) ───────────
#define BTN_VERDE           12
#define BTN_AMARELO         13
#define BTN_VERMELHO        32
#define BTN_PAUSE           33      // Pause/Resume fabricação

// ─── Pinos — LEDs de status ────────────────────────────────
#define LED_VERMELHO_PIN    25
#define LED_AMARELO_PIN     26
#define LED_VERDE_PIN       27      // GPIO 33 liberado para BTN_PAUSE
#define LED_ONBOARD_PIN     2

// ─── Debounce ──────────────────────────────────────────────
#define DEBOUNCE_MS         30

// ─── Timers (ms) ───────────────────────────────────────────
#define HEARTBEAT_INTERVAL_MS    300000   // 5 minutos
#define HEAP_MONITOR_INTERVAL_MS  30000   // 30 segundos
#define CHECK_INTERVAL_MS          5000

// ─── Reconexão com backoff exponencial ─────────────────────
#define INITIAL_BACKOFF_MS  5000
#define MAX_BACKOFF_MS      60000

// ─── Watchdog ──────────────────────────────────────────────
#define WATCHDOG_TIMEOUT_S  30

// ─── Thresholds de saúde ───────────────────────────────────
#define HEAP_WARN_THRESHOLD 10240   // 10 KB
