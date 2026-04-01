#pragma once

#include <Arduino.h>

// ═══════════════════════════════════════════════════════════
// OTA (Over-The-Air) Update Management
// ═══════════════════════════════════════════════════════════

/**
 * @brief Inicializa o subsistema OTA
 * 
 * Configura callbacks e subscrições MQTT necessárias para
 * receber comandos de atualização OTA do backend.
 */
void initOTA();

/**
 * @brief Processa comando de atualização OTA recebido via MQTT
 * 
 * @param payload Payload JSON contendo version, url e size
 * 
 * Formato esperado:
 * {
 *   "version": "1.2.0",
 *   "url": "http://192.168.10.55:8000/static/ota/firmware-1.2.0.bin",
 *   "size": 1234567
 * }
 * 
 * Valida a versão, inicia o download do firmware e reporta
 * progresso via MQTT no tópico andon/ota/progress/{mac}
 */
void handleOTATrigger(const char* payload);

/**
 * @brief Publica mensagem de progresso OTA via MQTT
 * 
 * @param status Status atual: "downloading", "installing", "success", "failed"
 * @param progress Porcentagem de progresso (0-100)
 * @param error Mensagem de erro (nullptr se não houver erro)
 * 
 * Publica no tópico: andon/ota/progress/{mac}
 * 
 * Formato do payload:
 * {
 *   "status": "downloading",
 *   "progress": 45,
 *   "error": null
 * }
 */
void publishOTAProgress(const char* status, int progress, const char* error);

/**
 * @brief Retorna a versão atual do firmware
 * 
 * @return String contendo a versão no formato semântico (ex: "1.2.0")
 */
const char* getFirmwareVersion();
