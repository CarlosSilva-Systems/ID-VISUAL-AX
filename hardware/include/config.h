#pragma once

// ═══════════════════════════════════════════════════════════
// FIRMWARE ID VISUAL AX — CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════

// ─── Versão ────────────────────────────────────────────────
#define FIRMWARE_VERSION    "2.1.0"
#define FIRMWARE_BUILD_DATE __DATE__

// ─── WiFi (ponto de acesso para o nó raiz da mesh) ─────────
#define WIFI_SSID           "AX-CORPORATIVO"
#define WIFI_PASSWORD       "auto@bacia"
#define WIFI_TIMEOUT_MS     30000UL
#define WIFI_BLINK_MS       500UL

// ─── ESP-MESH ──────────────────────────────────────────────
// Todos os dispositivos da mesma instalação usam o mesmo MESH_ID e MESH_PASSWORD.
// O nó que conseguir alcançar o WiFi vira raiz automaticamente e faz a ponte
// para o broker MQTT. Os demais roteiam por ele.
#define MESH_ID             "IDVISUAL_ANDON"
#define MESH_PASSWORD       "andon@mesh2024"
#define MESH_PORT           5555
#define MESH_CHANNEL        6       // Canal WiFi fixo para a mesh (1-13)
// Limite de filhos diretos por nó. Quando atingido, o nó anuncia via broadcast
// que está cheio e outros nós o ignoram ao escolher por onde rotear.
// Valor recomendado: 4 (equilibrio entre cobertura e estabilidade do ESP32)
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
#define LED_VERDE_PIN       27      // GPIO 33 liberado para BTN_PAUSE
#define LED_ONBOARD_PIN     2       // LED azul onboard

// ─── Debounce ──────────────────────────────────────────────
// Apenas estabilidade elétrica — deduplicação de eventos no backend
#define DEBOUNCE_MS         30UL

// ─── Intervalos de timer ───────────────────────────────────
#define HEARTBEAT_INTERVAL_MS   300000UL    // 5 minutos
#define HEAP_MONITOR_INTERVAL_MS 30000UL    // 30 segundos
#define STATUS_LOG_INTERVAL_MS  10000UL     // 10 segundos

// ─── Reconexão com backoff exponencial ─────────────────────
#define INITIAL_BACKOFF_MS  5000UL
#define MAX_BACKOFF_MS      60000UL

// ─── Watchdog ──────────────────────────────────────────────
#define WATCHDOG_TIMEOUT_S  30

// ─── Thresholds de saúde ───────────────────────────────────
#define HEAP_WARN_THRESHOLD 10240   // 10 KB
#define RSSI_WARN_THRESHOLD -80     // dBm

// ─── Viral Provisioning Seguro (AES-GCM + ESP-NOW) ─────────
// Chave secreta hardcoded para derivação AES-256 via SHA-256
#define PROVISIONING_PASSPHRASE "ChaveSecretaAndon2026"

// Janela de transmissão: 10 minutos após configuração
#define PROVISIONING_TRANSMISSION_DURATION_MS 600000UL  // 10 minutos

// Intervalo entre broadcasts: 30 segundos (20 transmissões totais)
#define PROVISIONING_TRANSMISSION_INTERVAL_MS 30000UL   // 30 segundos

// Janela de validação de timestamp (anti-replay): ±5 minutos
#define PROVISIONING_TIMESTAMP_WINDOW_S 300             // 5 minutos

// Servidor NTP para sincronização de RTC
#define NTP_SERVER "pool.ntp.org"
#define NTP_TIMEOUT_MS 10000UL                          // 10 segundos

// Namespace NVS para armazenar credenciais WiFi
#define NVS_NAMESPACE "provisioning"
