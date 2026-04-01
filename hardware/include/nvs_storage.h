#pragma once

#include <Arduino.h>
#include <Preferences.h>

// Inicialização do módulo NVS
bool nvsInit();

// Salvamento de string na NVS
bool nvsSaveString(const char* key, const char* value);

// Leitura de string da NVS
bool nvsLoadString(const char* key, char* value, size_t max_len);

// Verificação de existência de chave
bool nvsKeyExists(const char* key);

// Limpeza de namespace
bool nvsClearNamespace();
