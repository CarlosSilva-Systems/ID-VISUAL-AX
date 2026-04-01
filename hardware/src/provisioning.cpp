#include "provisioning.h"
#include "crypto.h"
#include "nvs_storage.h"
#include "rtc_sync.h"
#include "espnow_comm.h"
#include "config.h"

// Estado global de provisionamento
static ProvisioningState g_provState = ProvisioningState::UNCONFIGURED;
static TransmissionTimer g_txTimer = {0, 0, 0, 0, 0};
static bool g_initialized = false;

// Inicialização do módulo de provisionamento
void provisioningInit() {
    if (g_initialized) {
        return;
    }
    
    // Inicializar módulos dependentes
    nvsInit();
    cryptoInit();
    
    // Verificar se credenciais existem na NVS
    if (nvsKeyExists("wifi_ssid") && nvsKeyExists("wifi_password")) {
        Serial.println("[PROVISIONING] Credenciais encontradas na NVS");
        g_provState = ProvisioningState::OPERATIONAL;
    } else {
        Serial.println("[PROVISIONING] Nenhuma credencial encontrada - estado UNCONFIGURED");
        g_provState = ProvisioningState::UNCONFIGURED;
    }
    
    g_initialized = true;
}

// Configuração manual via Serial
bool provisionManual(const char* ssid, const char* password) {
    // Salvar credenciais na NVS
    if (!saveCredentialsToNVS(ssid, password)) {
        return false;
    }
    
    // Iniciar timer de transmissão
    g_txTimer.start_ms = millis();
    g_txTimer.duration_ms = PROVISIONING_TRANSMISSION_DURATION_MS;
    g_txTimer.interval_ms = PROVISIONING_TRANSMISSION_INTERVAL_MS;
    g_txTimer.last_transmission = 0;
    g_txTimer.transmission_count = 0;
    
    // Mudar estado para TRANSMITTING
    g_provState = ProvisioningState::TRANSMITTING;
    
    Serial.println("[PROVISIONING] Estado alterado para TRANSMITTING");
    
    return true;
}

// Reset de credenciais
bool provisionReset() {
    if (!nvsClearNamespace()) {
        return false;
    }
    
    g_provState = ProvisioningState::UNCONFIGURED;
    Serial.println("[PROVISIONING] Estado alterado para UNCONFIGURED");
    
    return true;
}

// Verificação de estado
ProvisioningState getProvisioningState() {
    return g_provState;
}

// Carregamento de credenciais da NVS
bool loadCredentialsFromNVS(char* ssid, char* password) {
    if (!nvsLoadString("wifi_ssid", ssid, 33)) {
        return false;
    }
    
    if (!nvsLoadString("wifi_password", password, 65)) {
        return false;
    }
    
    return true;
}

// Salvamento de credenciais na NVS
bool saveCredentialsToNVS(const char* ssid, const char* password) {
    if (!nvsSaveString("wifi_ssid", ssid)) {
        return false;
    }
    
    if (!nvsSaveString("wifi_password", password)) {
        return false;
    }
    
    return true;
}

// Serialização de ProvisioningPayload para JSON
bool serializeProvisioningPayload(const ProvisioningPayload& payload, char* json_out, size_t max_len) {
    StaticJsonDocument<256> doc;
    
    doc["ssid"] = payload.ssid;
    doc["password"] = payload.password;
    doc["timestamp"] = payload.timestamp;
    doc["device_id"] = payload.device_id;
    
    // Serializar para string
    size_t len = serializeJson(doc, json_out, max_len);
    
    // Validar tamanho (máximo 200 bytes)
    if (len == 0 || len > 200) {
        Serial.printf("[PROVISIONING] ERRO: JSON muito grande (%d bytes, max 200)\n", len);
        return false;
    }
    
    return true;
}

// Desserialização de JSON para ProvisioningPayload
bool deserializeProvisioningPayload(const char* json_str, ProvisioningPayload& payload_out) {
    StaticJsonDocument<256> doc;
    
    DeserializationError error = deserializeJson(doc, json_str);
    
    if (error) {
        Serial.printf("[PROVISIONING] ERRO: Falha ao desserializar JSON (%s)\n", error.c_str());
        return false;
    }
    
    // Validar campos obrigatórios
    if (!doc.containsKey("ssid") || !doc.containsKey("password") || 
        !doc.containsKey("timestamp") || !doc.containsKey("device_id")) {
        Serial.println("[PROVISIONING] ERRO: Campos obrigatórios ausentes no JSON");
        return false;
    }
    
    // Copiar dados para estrutura
    strncpy(payload_out.ssid, doc["ssid"], 32);
    payload_out.ssid[32] = '\0';
    
    strncpy(payload_out.password, doc["password"], 64);
    payload_out.password[64] = '\0';
    
    payload_out.timestamp = doc["timestamp"];
    
    strncpy(payload_out.device_id, doc["device_id"], 20);
    payload_out.device_id[20] = '\0';
    
    return true;
}

// Transmissão de payload de provisionamento
void transmitProvisioningPayload() {
    // Verificar se está no estado TRANSMITTING
    if (g_provState != ProvisioningState::TRANSMITTING) {
        return;
    }
    
    // Verificar se timer expirou
    if (g_txTimer.isExpired()) {
        Serial.println("[PROVISIONING] Timer de transmissão expirado - mudando para OPERATIONAL");
        g_provState = ProvisioningState::OPERATIONAL;
        return;
    }
    
    // Verificar se deve transmitir agora
    if (!g_txTimer.shouldTransmit()) {
        return;
    }
    
    // Carregar credenciais da NVS
    char ssid[33], password[65];
    if (!loadCredentialsFromNVS(ssid, password)) {
        Serial.println("[PROVISIONING] ERRO: Falha ao carregar credenciais da NVS");
        return;
    }
    
    // Criar payload
    ProvisioningPayload payload;
    strncpy(payload.ssid, ssid, 32);
    payload.ssid[32] = '\0';
    strncpy(payload.password, password, 64);
    payload.password[64] = '\0';
    payload.timestamp = rtcGetTimestamp();
    strncpy(payload.device_id, WiFi.macAddress().c_str(), 20);
    payload.device_id[20] = '\0';
    
    // Serializar para JSON
    char json_str[256];
    if (!serializeProvisioningPayload(payload, json_str, sizeof(json_str))) {
        Serial.println("[PROVISIONING] ERRO: Falha ao serializar payload");
        return;
    }
    
    // Criptografar payload
    uint8_t ciphertext[200];
    size_t ciphertext_len;
    uint8_t iv[12];
    uint8_t auth_tag[16];
    
    if (!encryptPayload((const uint8_t*)json_str, strlen(json_str),
                        ciphertext, &ciphertext_len, iv, auth_tag)) {
        Serial.println("[PROVISIONING] ERRO: Falha ao criptografar payload");
        return;
    }
    
    // Montar payload final: IV (12) + Ciphertext (variável) + Auth_Tag (16)
    uint8_t final_payload[256];
    size_t offset = 0;
    
    memcpy(final_payload + offset, iv, 12);
    offset += 12;
    
    memcpy(final_payload + offset, ciphertext, ciphertext_len);
    offset += ciphertext_len;
    
    memcpy(final_payload + offset, auth_tag, 16);
    offset += 16;
    
    // Transmitir via ESP-NOW
    if (espnowSendEncryptedPayload(final_payload, offset)) {
        g_txTimer.last_transmission = millis();
        g_txTimer.transmission_count++;
        
        Serial.printf("[PROVISIONING] Transmissão #%d enviada (%d bytes)\n", 
                     g_txTimer.transmission_count, offset);
    } else {
        Serial.println("[PROVISIONING] ERRO: Falha ao transmitir via ESP-NOW");
    }
}

// Processamento de payload recebido
void processReceivedProvisioningPayload(const uint8_t* mac_addr, const uint8_t* data, int data_len) {
    // Verificar se device já possui credenciais (descartar se sim)
    if (nvsKeyExists("wifi_ssid") && nvsKeyExists("wifi_password")) {
        Serial.println("[PROVISIONING] Device já possui credenciais - descartando payload");
        return;
    }
    
    // Validar tamanho mínimo (IV + Auth_Tag = 28 bytes)
    if (data_len < 28) {
        Serial.printf("[PROVISIONING] ERRO: Payload muito pequeno (%d bytes, min 28)\n", data_len);
        return;
    }
    
    // Extrair IV, Ciphertext, Auth_Tag
    uint8_t iv[12];
    uint8_t auth_tag[16];
    size_t ciphertext_len = data_len - 28;
    uint8_t ciphertext[200];
    
    memcpy(iv, data, 12);
    memcpy(ciphertext, data + 12, ciphertext_len);
    memcpy(auth_tag, data + 12 + ciphertext_len, 16);
    
    // Descriptografar payload
    uint8_t plaintext[200];
    size_t plaintext_len;
    
    if (!decryptPayload(ciphertext, ciphertext_len, iv, auth_tag, 
                        plaintext, &plaintext_len)) {
        Serial.println("[PROVISIONING] ERRO: Falha ao descriptografar (Auth Tag inválido)");
        return;
    }
    
    // Null-terminate plaintext
    plaintext[plaintext_len] = '\0';
    
    // Desserializar JSON
    ProvisioningPayload payload;
    if (!deserializeProvisioningPayload((const char*)plaintext, payload)) {
        Serial.println("[PROVISIONING] ERRO: Falha ao desserializar JSON");
        return;
    }
    
    // Validar timestamp (anti-replay)
    if (!rtcValidateTimestamp(payload.timestamp, PROVISIONING_TIMESTAMP_WINDOW_S)) {
        Serial.println("[PROVISIONING] ERRO: Timestamp inválido (possível replay attack)");
        return;
    }
    
    // Salvar credenciais na NVS
    if (!saveCredentialsToNVS(payload.ssid, payload.password)) {
        Serial.println("[PROVISIONING] ERRO: Falha ao salvar credenciais na NVS");
        return;
    }
    
    Serial.printf("[PROVISIONING] Credenciais recebidas de %02X:%02X:%02X:%02X:%02X:%02X\n",
                 mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
    Serial.printf("[PROVISIONING] SSID: %s\n", payload.ssid);
    Serial.printf("[PROVISIONING] Device ID: %s\n", payload.device_id);
    
    // Iniciar timer de transmissão (propagar para outros devices)
    g_txTimer.start_ms = millis();
    g_txTimer.duration_ms = PROVISIONING_TRANSMISSION_DURATION_MS;
    g_txTimer.interval_ms = PROVISIONING_TRANSMISSION_INTERVAL_MS;
    g_txTimer.last_transmission = 0;
    g_txTimer.transmission_count = 0;
    
    // Mudar estado para TRANSMITTING
    g_provState = ProvisioningState::TRANSMITTING;
    
    Serial.println("[PROVISIONING] Estado alterado para TRANSMITTING");
    Serial.println("[PROVISIONING] Reiniciando em 3 segundos para conectar ao WiFi...");
    
    delay(3000);
    ESP.restart();
}
