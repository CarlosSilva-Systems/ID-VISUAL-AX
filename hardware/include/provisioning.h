#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

// Estrutura de payload de provisionamento (antes da criptografia)
struct ProvisioningPayload {
    char ssid[33];          // SSID WiFi (máximo 32 chars + null terminator)
    char password[65];      // Senha WiFi (máximo 64 chars + null terminator)
    uint32_t timestamp;     // Unix timestamp (segundos desde 1970-01-01)
    char device_id[21];     // ID do transmissor (máximo 20 chars + null terminator)
};

// Estrutura de payload criptografado
struct EncryptedPayload {
    uint8_t iv[12];                    // Initialization Vector (12 bytes)
    uint8_t ciphertext[200];           // Ciphertext (tamanho variável, máximo 200)
    size_t ciphertext_len;             // Tamanho real do ciphertext
    uint8_t auth_tag[16];              // Authentication Tag (16 bytes)
};

// Estado do device no ciclo de provisionamento
enum class ProvisioningState : uint8_t {
    UNCONFIGURED,    // Aguardando credenciais
    TRANSMITTING,    // Transmitindo credenciais (0-10 min)
    OPERATIONAL      // Operação normal (após 10 min ou credenciais hardcoded)
};

// Timer de transmissão
struct TransmissionTimer {
    unsigned long start_ms;           // Timestamp de início (millis())
    unsigned long duration_ms;        // Duração total (600.000 ms = 10 min)
    unsigned long interval_ms;        // Intervalo entre transmissões (30.000 ms)
    unsigned long last_transmission;  // Timestamp da última transmissão
    uint8_t transmission_count;       // Contador de transmissões (0-20)
    
    bool isExpired() const {
        return (millis() - start_ms) >= duration_ms;
    }
    
    bool shouldTransmit() const {
        return (millis() - last_transmission) >= interval_ms;
    }
};

// Inicialização do módulo de provisionamento
void provisioningInit();

// Configuração manual via Serial
bool provisionManual(const char* ssid, const char* password);

// Reset de credenciais
bool provisionReset();

// Verificação de estado
ProvisioningState getProvisioningState();

// Carregamento de credenciais da NVS
bool loadCredentialsFromNVS(char* ssid, char* password);

// Salvamento de credenciais na NVS
bool saveCredentialsToNVS(const char* ssid, const char* password);

// Serialização de ProvisioningPayload para JSON
bool serializeProvisioningPayload(const ProvisioningPayload& payload, char* json_out, size_t max_len);

// Desserialização de JSON para ProvisioningPayload
bool deserializeProvisioningPayload(const char* json_str, ProvisioningPayload& payload_out);

// Transmissão de payload de provisionamento
void transmitProvisioningPayload();

// Processamento de payload recebido
void processReceivedProvisioningPayload(const uint8_t* mac_addr, const uint8_t* data, int data_len);
