#include "espnow_comm.h"
#include "config.h"

// Buffers globais para recepção ESP-NOW (processamento no loop principal)
uint8_t g_espnowRxBuffer[256] = {0};
size_t g_espnowRxLen = 0;
uint8_t g_espnowRxMAC[6] = {0};
bool g_espnowRxFlag = false;

// MAC de broadcast
static const uint8_t BROADCAST_MAC[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Callback de recepção (registrado internamente)
void espnowReceiveCallback(const uint8_t* mac, const uint8_t* data, int len) {
    // Copiar dados para buffer global (processamento no loop principal)
    if (len > 0 && len <= 256) {
        memcpy(g_espnowRxBuffer, data, len);
        g_espnowRxLen = len;
        memcpy(g_espnowRxMAC, mac, 6);
        g_espnowRxFlag = true;
        
        Serial.printf("[ESP-NOW] Recebido %d bytes de %02X:%02X:%02X:%02X:%02X:%02X\n",
                     len, mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    }
}

// Callback de envio (registrado internamente)
void espnowSendCallback(const uint8_t* mac, esp_now_send_status_t status) {
    if (status == ESP_NOW_SEND_SUCCESS) {
        Serial.println("[ESP-NOW] Transmissão bem-sucedida");
    } else {
        Serial.println("[ESP-NOW] ERRO: Falha na transmissão");
    }
}

// Inicialização do ESP-NOW
bool espnowInit() {
    // Inicializar ESP-NOW
    esp_err_t result = esp_now_init();
    
    if (result != ESP_OK) {
        Serial.printf("[ESP-NOW] ERRO: Falha ao inicializar (código %d)\n", result);
        return false;
    }
    
    Serial.println("[ESP-NOW] Inicializado com sucesso");
    
    // Registrar callbacks
    esp_now_register_recv_cb(espnowReceiveCallback);
    esp_now_register_send_cb(espnowSendCallback);
    
    Serial.println("[ESP-NOW] Callbacks registrados");
    
    return true;
}

// Registro de peer de broadcast
bool espnowRegisterBroadcastPeer() {
    // Configurar peer info
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, BROADCAST_MAC, 6);
    peerInfo.channel = MESH_CHANNEL;  // Usar mesmo canal do ESP-MESH
    peerInfo.encrypt = false;         // Sem criptografia ESP-NOW (usamos AES-GCM)
    
    // Registrar peer
    esp_err_t result = esp_now_add_peer(&peerInfo);
    
    if (result != ESP_OK) {
        Serial.printf("[ESP-NOW] ERRO: Falha ao registrar peer de broadcast (código %d)\n", result);
        return false;
    }
    
    Serial.printf("[ESP-NOW] Peer de broadcast registrado (canal %d)\n", MESH_CHANNEL);
    
    return true;
}

// Transmissão de payload criptografado
bool espnowSendEncryptedPayload(const uint8_t* payload, size_t len) {
    // Validar tamanho (ESP-NOW suporta até 250 bytes)
    if (len > 250) {
        Serial.printf("[ESP-NOW] ERRO: Payload muito grande (%d bytes, max 250)\n", len);
        return false;
    }
    
    // Transmitir via broadcast
    esp_err_t result = esp_now_send(BROADCAST_MAC, payload, len);
    
    if (result != ESP_OK) {
        Serial.printf("[ESP-NOW] ERRO: Falha ao transmitir (código %d)\n", result);
        return false;
    }
    
    Serial.printf("[ESP-NOW] Transmitindo %d bytes via broadcast\n", len);
    
    return true;
}
