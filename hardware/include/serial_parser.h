#pragma once

#include <Arduino.h>

// Processamento de linha Serial
void serialProcessLine(const char* line);

// Comando PROVISION
bool serialHandleProvision(const char* ssid, const char* password);

// Comando RESET_PROVISION
bool serialHandleResetProvision();
