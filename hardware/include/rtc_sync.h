#pragma once

#include <Arduino.h>
#include <time.h>

// Estrutura de estado do RTC
struct RTCState {
    bool synced;                      // Flag indicando se RTC foi sincronizado via NTP
    uint32_t last_sync_timestamp;     // Timestamp da última sincronização bem-sucedida
    uint32_t sync_attempts;           // Contador de tentativas de sincronização
};

// Inicialização e sincronização NTP
bool rtcSyncNTP(uint32_t timeout_ms);

// Obtenção de timestamp Unix atual
uint32_t rtcGetTimestamp();

// Verificação de sincronização
bool rtcIsSynced();

// Validação de timestamp (anti-replay)
bool rtcValidateTimestamp(uint32_t payload_timestamp, uint32_t window_seconds);
