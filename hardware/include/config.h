#pragma once

// ═══════════════════════════════════════════════════════════
// FIRMWARE ID VISUAL AX — CONFIGURAÇÕES v2.3.0
// ═══════════════════════════════════════════════════════════

// ─── Versão ────────────────────────────────────────────────
#define FIRMWARE_VERSION    "2.4.0"
#define FIRMWARE_BUILD_DATE __DATE__

// ─── WiFi ──────────────────────────────────────────────────
#define WIFI_SSID           "AX-CORPORATIVO"
#define WIFI_PASSWORD       "auto@bacia"
// Tempo máximo aguardando WL_CONNECTED antes de cair para mesh.
// Sem scan prévio — WiFi.begin() direto evita conflito com painlessMesh.
#define WIFI_TIMEOUT_MS     15000UL     // 15s
#define WIFI_BLINK_MS       500UL

// Tempo sem WiFi em OPERATIONAL antes de cair para mesh (absorve quedas rápidas)
#define WIFI_LOSS_FALLBACK_MS   60000UL     // 60s

// ─── ESP-MESH ──────────────────────────────────────────────
// Todos os nós usam o mesmo MESH_ID/MESH_PASSWORD.
// O nó que conseguir conectar ao WiFi vira raiz e faz ponte para o MQTT.
// Nós sem WiFi entram como folhas e roteiam via mesh.
// Intervalo de retry WiFi quando em modo folha.
#define WIFI_RETRY_INTERVAL_MS  60000UL     // 60s
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
#define LED_VERDE_PIN       19
#define LED_AMARELO_PIN     18
#define LED_VERMELHO_PIN    17
#define LED_ONBOARD_PIN     2       // LED azul onboard

// ─── Debounce ──────────────────────────────────────────────
#define DEBOUNCE_MS              50UL   // ms de estabilidade para confirmar pressionamento

// ─── Intervalos de timer ───────────────────────────────────
#define HEARTBEAT_INTERVAL_MS    300000UL   // 5 minutos
#define HEAP_MONITOR_INTERVAL_MS  30000UL   // 30 segundos

// ─── Reconexão com backoff exponencial ─────────────────────
#define INITIAL_BACKOFF_MS  5000UL
#define MAX_BACKOFF_MS      60000UL

// ─── Watchdog ──────────────────────────────────────────────
#define WATCHDOG_TIMEOUT_S  60

// ─── Thresholds de saúde ───────────────────────────────────
#define HEAP_WARN_THRESHOLD 10240   // 10 KB

// ─── NVS ───────────────────────────────────────────────────
// Namespace para armazenar credenciais WiFi via provisioning
#define NVS_NAMESPACE "provisioning"

// ─── NTP ───────────────────────────────────────────────────
#define NTP_SERVER      "pool.ntp.org"
#define NTP_TIMEOUT_MS  10000UL

// ─── Viral Provisioning Seguro (AES-GCM + ESP-NOW) ─────────
// Chave secreta para derivação AES-256 via SHA-256
#define PROVISIONING_PASSPHRASE "ChaveSecretaAndon2026"

// Janela de transmissão: 10 minutos após configuração
#define PROVISIONING_TRANSMISSION_DURATION_MS  600000UL  // 10 minutos

// Intervalo entre broadcasts: 30 segundos
#define PROVISIONING_TRANSMISSION_INTERVAL_MS   30000UL  // 30 segundos

// Janela de validação de timestamp (anti-replay): ±5 minutos
#define PROVISIONING_TIMESTAMP_WINDOW_S  300             // 5 minutos
