#include "crypto.h"
#include "config.h"
#include <esp_random.h>

// Contexto global de criptografia
static CryptoContext g_crypto;

// Inicialização do módulo de criptografia
void cryptoInit() {
    // Derivar chave AES-256 a partir da passphrase hardcoded
    deriveAESKey(PROVISIONING_PASSPHRASE, g_crypto.aes_key);
    g_crypto.key_initialized = true;
    
    // Inicializar contexto GCM
    mbedtls_gcm_init(&g_crypto.gcm_ctx);
    mbedtls_gcm_setkey(&g_crypto.gcm_ctx, 
                       MBEDTLS_CIPHER_ID_AES, 
                       g_crypto.aes_key, 
                       256);
}

// Limpeza do módulo de criptografia
void cryptoCleanup() {
    mbedtls_gcm_free(&g_crypto.gcm_ctx);
    memset(g_crypto.aes_key, 0, 32); // Zerar chave na memória
    g_crypto.key_initialized = false;
}

// Derivação de chave AES-256 a partir de string usando SHA-256
void deriveAESKey(const char* passphrase, uint8_t* key_out) {
    mbedtls_sha256_context sha256_ctx;
    mbedtls_sha256_init(&sha256_ctx);
    mbedtls_sha256_starts(&sha256_ctx, 0); // 0 = SHA-256 (não SHA-224)
    
    // Hash da passphrase
    mbedtls_sha256_update(&sha256_ctx, 
                          (const unsigned char*)passphrase, 
                          strlen(passphrase));
    
    // Finaliza e obtém hash de 32 bytes
    mbedtls_sha256_finish(&sha256_ctx, key_out);
    mbedtls_sha256_free(&sha256_ctx);
}

// Geração de IV aleatório (12 bytes)
void generateRandomIV(uint8_t* iv_out) {
    // Gera 12 bytes aleatórios usando gerador de hardware do ESP32
    for (int i = 0; i < 12; i++) {
        iv_out[i] = (uint8_t)(esp_random() & 0xFF);
    }
}

// Criptografia de payload com AES-GCM
bool encryptPayload(
    const uint8_t* plaintext, size_t plaintext_len,
    uint8_t* ciphertext_out, size_t* ciphertext_len,
    uint8_t* iv_out, uint8_t* tag_out
) {
    // Verificar se módulo foi inicializado
    if (!g_crypto.key_initialized) {
        return false;
    }
    
    // Gerar IV aleatório
    generateRandomIV(iv_out);
    
    // Criptografar com GCM
    int ret = mbedtls_gcm_crypt_and_tag(
        &g_crypto.gcm_ctx,
        MBEDTLS_GCM_ENCRYPT,
        plaintext_len,
        iv_out,                    // IV (12 bytes)
        12,                        // Tamanho do IV
        NULL,                      // Additional Data (não usado)
        0,                         // Tamanho do AD
        plaintext,                 // Plaintext
        ciphertext_out,            // Ciphertext output
        16,                        // Tamanho do tag (16 bytes)
        tag_out                    // Authentication Tag output
    );
    
    if (ret != 0) {
        return false;
    }
    
    *ciphertext_len = plaintext_len;
    
    // Validar tamanho total (IV + Ciphertext + Tag < 256 bytes)
    size_t total_size = 12 + plaintext_len + 16;
    if (total_size > 256) {
        return false;
    }
    
    return true;
}

// Descriptografia de payload com AES-GCM e validação de Auth Tag
bool decryptPayload(
    const uint8_t* ciphertext, size_t ciphertext_len,
    const uint8_t* iv, const uint8_t* tag,
    uint8_t* plaintext_out, size_t* plaintext_len
) {
    // Verificar se módulo foi inicializado
    if (!g_crypto.key_initialized) {
        return false;
    }
    
    // Descriptografar e validar Auth Tag
    int ret = mbedtls_gcm_auth_decrypt(
        &g_crypto.gcm_ctx,
        ciphertext_len,
        iv,                        // IV extraído (12 bytes)
        12,                        // Tamanho do IV
        NULL,                      // Additional Data (não usado)
        0,                         // Tamanho do AD
        tag,                       // Authentication Tag (16 bytes)
        16,                        // Tamanho do tag
        ciphertext,                // Ciphertext
        plaintext_out              // Plaintext output
    );
    
    if (ret != 0) {
        // Auth Tag inválido ou erro de descriptografia
        return false;
    }
    
    *plaintext_len = ciphertext_len;
    return true;
}
