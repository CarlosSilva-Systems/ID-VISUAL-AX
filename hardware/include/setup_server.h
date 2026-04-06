#pragma once

// ═══════════════════════════════════════════════════════════
// Setup Server — AP WiFi + HTTP para configuração inicial
//
// Quando o ESP32 está UNCONFIGURED:
//   1. Cria AP "ESP32-Setup-XXXX" (sem senha)
//   2. Serve página HTML em 192.168.4.1
//   3. Página lista redes WiFi disponíveis
//   4. Usuário define nome, localização, SSID e senha
//   5. ESP32 salva na NVS e reinicia
// ═══════════════════════════════════════════════════════════

void setupServerInit(const char* mac_suffix);
void setupServerLoop();
void setupServerStop();
bool setupServerIsRunning();
