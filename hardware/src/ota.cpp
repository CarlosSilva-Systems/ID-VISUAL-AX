#include "ota.h"
#include "config.h"
#include <ArduinoJson.h>
#include <HTTPUpdate.h>
#include <WiFi.h>
#include <PubSubClient.h>

// Referência ao cliente MQTT global (definido em main.cpp)
extern PubSubClient g_mqtt;
extern String g_mac;

// ═══════════════════════════════════════════════════════════
// Implementação OTA
// ═══════════════════════════════════════════════════════════

void initOTA() {
    Serial.println("[OTA] Subsistema OTA inicializado");
    Serial.printf("[OTA] Versão atual do firmware: %s\n", FIRMWARE_VERSION);
}

const char* getFirmwareVersion() {
    return FIRMWARE_VERSION;
}

void publishOTAProgress(const char* status, int progress, const char* error) {
    JsonDocument doc;
    doc["status"] = status;
    doc["progress"] = progress;
    doc["error"] = error;
    
    char buffer[256];
    serializeJson(doc, buffer);
    
    String topic = "andon/ota/progress/" + g_mac;
    
    if (g_mqtt.connected()) {
        bool published = g_mqtt.publish(topic.c_str(), buffer, false);
        if (published) {
            Serial.printf("[OTA] Progresso publicado: %s - %d%%\n", status, progress);
        } else {
            Serial.printf("[OTA] ERRO: Falha ao publicar progresso\n");
        }
    } else {
        Serial.printf("[OTA] AVISO: MQTT desconectado, não foi possível publicar progresso\n");
    }
}

void handleOTATrigger(const char* payload) {
    Serial.println("[OTA] ========================================");
    Serial.println("[OTA] Comando de atualização OTA recebido");
    Serial.println("[OTA] ========================================");
    
    // Desserializar payload JSON
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);
    
    if (error) {
        Serial.printf("[OTA] ERRO: Falha ao parsear JSON - %s\n", error.c_str());
        publishOTAProgress("failed", 0, "JSON inválido");
        return;
    }
    
    // Extrair campos obrigatórios
    if (!doc.containsKey("version") || !doc.containsKey("url") || !doc.containsKey("size")) {
        Serial.println("[OTA] ERRO: Campos obrigatórios ausentes no payload");
        publishOTAProgress("failed", 0, "Campos obrigatórios ausentes");
        return;
    }
    
    const char* version = doc["version"];
    const char* url = doc["url"];
    int size = doc["size"];
    
    Serial.printf("[OTA] Versão alvo: %s\n", version);
    Serial.printf("[OTA] URL: %s\n", url);
    Serial.printf("[OTA] Tamanho: %d bytes\n", size);
    
    // Validar que não estamos já na versão solicitada
    if (strcmp(version, FIRMWARE_VERSION) == 0) {
        Serial.printf("[OTA] Já estou na versão %s - ignorando comando\n", version);
        publishOTAProgress("success", 100, nullptr);
        return;
    }
    
    Serial.printf("[OTA] Versão atual: %s -> Nova versão: %s\n", FIRMWARE_VERSION, version);
    Serial.println("[OTA] Iniciando processo de atualização...");
    
    // Publicar progresso inicial
    publishOTAProgress("downloading", 0, nullptr);
    
    // Configurar HTTPUpdate
    HTTPUpdate httpUpdate;
    httpUpdate.setLedPin(LED_ONBOARD_PIN, LOW);
    
    // Configurar callback de progresso
    int lastReportedProgress = -1;
    httpUpdate.onProgress([&lastReportedProgress](int current, int total) {
        if (total == 0) return;
        
        int progress = (current * 100) / total;
        
        // Reportar a cada 10% de progresso
        if (progress / 10 != lastReportedProgress / 10) {
            publishOTAProgress("downloading", progress, nullptr);
            lastReportedProgress = progress;
            Serial.printf("[OTA] Download: %d%% (%d / %d bytes)\n", progress, current, total);
        }
    });
    
    Serial.println("[OTA] Iniciando download do firmware...");
    
    // Iniciar atualização
    t_httpUpdate_return ret = httpUpdate.update(url);
    
    switch (ret) {
        case HTTP_UPDATE_FAILED:
            Serial.printf("[OTA] ERRO: Atualização falhou - %s\n", httpUpdate.getLastErrorString().c_str());
            publishOTAProgress("failed", 0, httpUpdate.getLastErrorString().c_str());
            break;
            
        case HTTP_UPDATE_NO_UPDATES:
            Serial.println("[OTA] Nenhuma atualização disponível");
            publishOTAProgress("failed", 0, "Nenhuma atualização disponível");
            break;
            
        case HTTP_UPDATE_OK:
            Serial.println("[OTA] ========================================");
            Serial.println("[OTA] Atualização concluída com sucesso!");
            Serial.println("[OTA] Reiniciando em 3 segundos...");
            Serial.println("[OTA] ========================================");
            publishOTAProgress("success", 100, nullptr);
            delay(3000);
            ESP.restart();
            break;
    }
}
