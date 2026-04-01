#include "serial_parser.h"
#include "nvs_storage.h"
#include "config.h"
#include <esp_system.h>

// Comando PROVISION
bool serialHandleProvision(const char* ssid, const char* password) {
    // Validar SSID (1-32 caracteres)
    size_t ssid_len = strlen(ssid);
    if (ssid_len < 1 || ssid_len > 32) {
        Serial.printf("[PROVISION] ERRO: SSID inválido (tamanho=%d, esperado 1-32)\n", ssid_len);
        return false;
    }
    
    // Validar senha (8-64 caracteres)
    size_t password_len = strlen(password);
    if (password_len < 8 || password_len > 64) {
        Serial.printf("[PROVISION] ERRO: Senha inválida (tamanho=%d, esperado 8-64)\n", password_len);
        return false;
    }
    
    // Salvar credenciais na NVS
    if (!nvsSaveString("wifi_ssid", ssid)) {
        Serial.println("[PROVISION] ERRO: Falha ao salvar SSID na NVS");
        return false;
    }
    
    if (!nvsSaveString("wifi_password", password)) {
        Serial.println("[PROVISION] ERRO: Falha ao salvar senha na NVS");
        return false;
    }
    
    Serial.println("[PROVISION] Credenciais salvas com sucesso");
    Serial.printf("[PROVISION] SSID: %s\n", ssid);
    Serial.println("[PROVISION] Reiniciando em 3 segundos...");
    
    // Aguardar 3 segundos e reiniciar
    delay(3000);
    ESP.restart();
    
    return true;
}

// Comando RESET_PROVISION
bool serialHandleResetProvision() {
    Serial.println("[RESET_PROVISION] Limpando credenciais...");
    
    // Limpar namespace "provisioning" da NVS
    if (!nvsClearNamespace()) {
        Serial.println("[RESET_PROVISION] ERRO: Falha ao limpar NVS");
        return false;
    }
    
    Serial.println("[RESET_PROVISION] Credenciais removidas com sucesso");
    Serial.println("[RESET_PROVISION] Reiniciando em 3 segundos...");
    
    // Aguardar 3 segundos e reiniciar
    delay(3000);
    ESP.restart();
    
    return true;
}

// Processamento de linha Serial
void serialProcessLine(const char* line) {
    // Copiar linha para buffer mutável
    char buffer[256];
    strncpy(buffer, line, sizeof(buffer) - 1);
    buffer[sizeof(buffer) - 1] = '\0';
    
    // Remover whitespace no início e fim
    char* start = buffer;
    while (*start == ' ' || *start == '\t' || *start == '\r' || *start == '\n') {
        start++;
    }
    
    char* end = start + strlen(start) - 1;
    while (end > start && (*end == ' ' || *end == '\t' || *end == '\r' || *end == '\n')) {
        *end = '\0';
        end--;
    }
    
    // Ignorar linhas vazias
    if (strlen(start) == 0) {
        return;
    }
    
    // Parsing de comando e argumentos
    char* cmd = strtok(start, " ");
    if (cmd == NULL) {
        return;
    }
    
    // Comando PROVISION <ssid> <password>
    if (strcmp(cmd, "PROVISION") == 0) {
        char* ssid = strtok(NULL, " ");
        char* password = strtok(NULL, " ");
        
        if (ssid == NULL || password == NULL) {
            Serial.println("[PROVISION] ERRO: Uso: PROVISION <ssid> <password>");
            return;
        }
        
        serialHandleProvision(ssid, password);
        return;
    }
    
    // Comando RESET_PROVISION
    if (strcmp(cmd, "RESET_PROVISION") == 0) {
        serialHandleResetProvision();
        return;
    }
    
    // Comando desconhecido
    Serial.printf("[SERIAL] Comando desconhecido: %s\n", cmd);
}
