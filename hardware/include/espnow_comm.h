#pragma once

#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>

// Buffers globais para recepção ESP-NOW (processamento no loop principal)
extern uint8_t g_espnowRxBuffer[256];
extern size_t g_espnowRxLen;
extern uint8_t g_espnowRxMAC[6];
extern bool g_espnowRxFlag;

// Inicialização do ESP-NOW
bool espnowInit();

// Registro de peer de broadcast
bool espnowRegisterBroadcastPeer();

// Transmissão de payload criptografado
bool espnowSendEncryptedPayload(const uint8_t* payload, size_t len);

// Callback de recepção (registrado internamente)
void espnowReceiveCallback(const uint8_t* mac, const uint8_t* data, int len);

// Callback de envio (registrado internamente)
void espnowSendCallback(const uint8_t* mac, esp_now_send_status_t status);
