#pragma once

#include <Arduino.h>
#include <mbedtls/gcm.h>
#include <mbedtls/sha256.h>

// Estrutura de contexto criptográfico
struct CryptoContext {
    uint8_t aes_key[32];              // Chave AES-256 derivada (256 bits)
    bool key_initialized;             // Flag indicando se chave foi derivada
    mbedtls_gcm_context gcm_ctx;      // Contexto mbedtls para AES-GCM
};

// Inicialização do módulo de criptografia
void cryptoInit();

// Limpeza do módulo de criptografia
void cryptoCleanup();

// Derivação de chave AES-256 a partir de string usando SHA-256
void deriveAESKey(const char* passphrase, uint8_t* key_out);

// Geração de IV aleatório (12 bytes)
void generateRandomIV(uint8_t* iv_out);

// Criptografia de payload com AES-GCM
// Retorna true se sucesso, false se erro
bool encryptPayload(
    const uint8_t* plaintext, size_t plaintext_len,
    uint8_t* ciphertext_out, size_t* ciphertext_len,
    uint8_t* iv_out, uint8_t* tag_out
);

// Descriptografia de payload com AES-GCM e validação de Auth Tag
// Retorna true se sucesso, false se Auth Tag inválido ou erro
bool decryptPayload(
    const uint8_t* ciphertext, size_t ciphertext_len,
    const uint8_t* iv, const uint8_t* tag,
    uint8_t* plaintext_out, size_t* plaintext_len
);
