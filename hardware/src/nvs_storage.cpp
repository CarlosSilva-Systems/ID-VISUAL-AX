#include "nvs_storage.h"
#include "config.h"

// Objeto global Preferences (wrapper do NVS)
static Preferences g_prefs;
static bool g_initialized = false;

// Inicialização do módulo NVS
bool nvsInit() {
    if (g_initialized) {
        return true;
    }
    
    // Abrir namespace "provisioning" em modo read-write
    if (!g_prefs.begin(NVS_NAMESPACE, false)) {
        return false;
    }
    
    g_initialized = true;
    return true;
}

// Salvamento de string na NVS
bool nvsSaveString(const char* key, const char* value) {
    if (!g_initialized && !nvsInit()) {
        return false;
    }
    
    // Salvar string na NVS
    size_t written = g_prefs.putString(key, value);
    
    // putString retorna o número de bytes escritos (0 = falha)
    return (written > 0);
}

// Leitura de string da NVS
bool nvsLoadString(const char* key, char* value, size_t max_len) {
    if (!g_initialized && !nvsInit()) {
        return false;
    }
    
    // Carregar string da NVS
    String loaded = g_prefs.getString(key, "");
    
    // Verificar se chave existe (string vazia = não existe)
    if (loaded.length() == 0) {
        return false;
    }
    
    // Copiar para buffer de saída (com limite de tamanho)
    strncpy(value, loaded.c_str(), max_len - 1);
    value[max_len - 1] = '\0'; // Garantir null-termination
    
    return true;
}

// Verificação de existência de chave
bool nvsKeyExists(const char* key) {
    if (!g_initialized && !nvsInit()) {
        return false;
    }
    
    // Verificar se chave existe usando isKey()
    return g_prefs.isKey(key);
}

// Limpeza de namespace
bool nvsClearNamespace() {
    if (!g_initialized && !nvsInit()) {
        return false;
    }
    
    // Limpar todas as chaves do namespace "provisioning"
    bool success = g_prefs.clear();
    
    return success;
}
