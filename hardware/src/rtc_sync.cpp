#include "rtc_sync.h"
#include "config.h"

// Estado global do RTC
static RTCState g_rtc = {false, 0, 0};

// Inicialização e sincronização NTP
bool rtcSyncNTP(uint32_t timeout_ms) {
    // Configurar servidor NTP e timezone UTC-3 (Brasília)
    // GMT offset: -3 horas = -10800 segundos
    // Daylight offset: 0 (Brasil não usa horário de verão desde 2019)
    configTime(-10800, 0, NTP_SERVER);
    
    // Aguardar sincronização com timeout
    unsigned long start = millis();
    struct tm timeinfo;
    
    while ((millis() - start) < timeout_ms) {
        if (getLocalTime(&timeinfo)) {
            // Sincronização bem-sucedida
            g_rtc.synced = true;
            g_rtc.last_sync_timestamp = rtcGetTimestamp();
            g_rtc.sync_attempts++;
            
            Serial.printf("[RTC] Sincronizado via NTP: %04d-%02d-%02d %02d:%02d:%02d\n",
                         timeinfo.tm_year + 1900,
                         timeinfo.tm_mon + 1,
                         timeinfo.tm_mday,
                         timeinfo.tm_hour,
                         timeinfo.tm_min,
                         timeinfo.tm_sec);
            
            return true;
        }
        
        delay(100); // Aguardar 100ms antes de tentar novamente
    }
    
    // Timeout atingido
    g_rtc.sync_attempts++;
    Serial.println("[RTC] ERRO: Timeout ao sincronizar com NTP");
    return false;
}

// Obtenção de timestamp Unix atual
uint32_t rtcGetTimestamp() {
    time_t now;
    time(&now);
    return (uint32_t)now;
}

// Verificação de sincronização
bool rtcIsSynced() {
    return g_rtc.synced;
}

// Validação de timestamp (anti-replay)
bool rtcValidateTimestamp(uint32_t payload_timestamp, uint32_t window_seconds) {
    // Graceful degradation: se RTC não sincronizado, aceitar qualquer timestamp
    if (!g_rtc.synced) {
        Serial.println("[RTC] AVISO: RTC não sincronizado - validação de timestamp desabilitada");
        return true;
    }
    
    // Obter timestamp atual
    uint32_t current_timestamp = rtcGetTimestamp();
    
    // Calcular diferença absoluta
    uint32_t diff;
    if (payload_timestamp > current_timestamp) {
        diff = payload_timestamp - current_timestamp;
    } else {
        diff = current_timestamp - payload_timestamp;
    }
    
    // Validar se está dentro da janela permitida
    if (diff <= window_seconds) {
        Serial.printf("[RTC] Timestamp válido (diff=%u s)\n", diff);
        return true;
    }
    
    // Timestamp fora da janela (possível replay attack)
    Serial.printf("[RTC] ERRO: Timestamp inválido (diff=%u s, max=%u s)\n", 
                  diff, window_seconds);
    return false;
}
