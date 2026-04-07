#pragma once

// ═══════════════════════════════════════════════════════════
// FIRMWARE ID VISUAL AX — CONFIGURAÇÕES v2.3.0
// ═══════════════════════════════════════════════════════════

// ─── Versão ────────────────────────────────────────────────
#define FIRMWARE_VERSION    "2.3.0"
#define FIRMWARE_BUILD_DATE __DATE__

// ─── WiFi ──────────────────────────────────────────────────
#define WIFI_SSID           "AX-CORPORATIVO"
#define WIFI_PASSWORD       "auto@bacia"
#define WIFI_TIMEOUT_MS     15000UL     // 15s para conectar antes de desistir
#define WIFI_BLINK_MS       500UL

// Limiar de qualidade de sinal para conexão direta.
// -80 dBm ≈ 30% de qualidade. Abaixo disso, usa mesh como fallback.
// Escala de referência: -50=excelente, -67=bom, -80=mínimo, -90=ruim
#define WIFI_RSSI_MIN_DBM   (-80)

// ─── ESP-MESH ──────────────────────────────────────────────
// Todos os nós usam o mesmo MESH_ID/MESH_PASSWORD.
// O nó com WiFi direto bom vira raiz e faz ponte para o MQTT.
// Nós sem sinal suficiente entram como folhas e roteiam via mesh.
#define MESH_ID             "IDVISUAL_ANDON"
#define MESH_PASSWORD       "andon@mesh2024"
#define MESH_PORT           5555
#define MESH_CHANNEL        6       // Canal WiFi fixo para a mesh (deve bater com o AP)

// Máximo de filhos diretos por nó.
// Acima de 4 o ESP32 começa a ter instabilidade de conexão.
#define MESH_MAX_CHILDREN   4

// ─── MQTT Broker ───────────────────────────────────────────
#define MQTT_BROKER         "192.168.10.55"
#define MQTT_PORT           1883
#define MQTT_BUFFER_SIZE    512
#define MQTT_BLINK_MS       1000UL
#define MQTT_MAX_RETRIES    10
#define MQTT_KEEPALIVE_S    60

// ─── Pinos — Botões (INPUT_PULLUP, ativo em LOW) ───────────
#define BTN_VERDE           12
#define BTN_AMARELO         13
#define BTN_VERMELHO        32
#define BTN_PAUSE           33      // Toggle pause/resume fabricação

// ─── Pinos — LEDs de status Andon ──────────────────────────
#define LED_VERMELHO_PIN    25
#define LED_AMARELO_PIN     26
#define LED_VERDE_PIN       27
#define LED_ONBOARD_PIN     2       // LED azul onboard

// ─── Debounce ──────────────────────────────────────────────
#define DEBOUNCE_MS         30UL

// ─── Intervalos de timer ───────────────────────────────────
#define HEARTBEAT_INTERVAL_MS    300000UL   // 5 minutos
#define HEAP_MONITOR_INTERVAL_MS  30000UL   // 30 segundos
#define RSSI_MONITOR_INTERVAL_MS  60000UL   // 1 minuto — verifica sinal do raiz

// ─── Reconexão com backoff exponencial ─────────────────────
#define INITIAL_BACKOFF_MS  5000UL
#define MAX_BACKOFF_MS      60000UL

// ─── Watchdog ──────────────────────────────────────────────
#define WATCHDOG_TIMEOUT_S  60

// ─── Thresholds de saúde ───────────────────────────────────
#define HEAP_WARN_THRESHOLD 10240   // 10 KB
