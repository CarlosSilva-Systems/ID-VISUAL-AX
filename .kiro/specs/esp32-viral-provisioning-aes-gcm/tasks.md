# Implementation Plan: ESP32 Viral Provisioning Seguro com AES-GCM

## Overview

Este plano de implementação detalha as tarefas necessárias para adicionar o sistema de Viral Provisioning Seguro ao firmware ESP32 Andon existente. O sistema permitirá distribuição automática de credenciais WiFi através de propagação em cascata usando ESP-NOW com criptografia AES-GCM. A implementação será incremental, com validação contínua através de testes unitários e property-based tests.

## Tasks

- [x] 1. Configuração inicial do projeto
  - Verificar que mbedtls está disponível no ESP-IDF (já incluído por padrão)
  - Adicionar constantes de configuração ao `hardware/include/config.h`
  - Criar estrutura de diretórios para novos módulos
  - _Requirements: 2.1, 15.1_

- [x] 2. Implementar módulo de criptografia (Crypto)
  - [x] 2.1 Criar arquivos `hardware/include/crypto.h` e `hardware/src/crypto.cpp`
    - Definir estruturas `CryptoContext` e funções de interface
    - _Requirements: 2.1, 2.2_
  
  - [x] 2.2 Implementar derivação de chave AES-256 via SHA-256
    - Função `deriveAESKey()` usando `mbedtls_sha256`
    - Derivar chave a partir de "ChaveSecretaAndon2026"
    - _Requirements: 2.2_
  
  - [x] 2.3 Implementar geração de IV aleatório
    - Função `generateRandomIV()` usando `esp_random()`
    - Gerar 12 bytes aleatórios
    - _Requirements: 2.3_
  
  - [x] 2.4 Implementar criptografia AES-GCM
    - Função `encryptPayload()` usando `mbedtls_gcm_crypt_and_tag()`
    - Retornar IV + Ciphertext + Auth_Tag
    - Validar tamanho máximo de 256 bytes
    - _Requirements: 2.4, 2.5, 2.6, 2.7_
  
  - [x] 2.5 Implementar descriptografia e validação de Auth Tag
    - Função `decryptPayload()` usando `mbedtls_gcm_auth_decrypt()`
    - Validar Auth_Tag automaticamente
    - Retornar false se Auth_Tag inválido
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [ ]* 2.6 Escrever testes unitários do módulo crypto
    - Testar derivação de chave (determinismo)
    - Testar geração de IV (unicidade)
    - Testar criptografia/descriptografia round-trip
    - Testar detecção de tampering (Auth Tag inválido)
    - Testar validação de tamanho de payload
    - _Requirements: 2.1-2.7, 3.1-3.4_

- [x] 3. Implementar módulo de NVS Storage
  - [x] 3.1 Criar arquivos `hardware/include/nvs_storage.h` e `hardware/src/nvs_storage.cpp`
    - Definir funções de interface para NVS
    - _Requirements: 9.1, 9.2_
  
  - [x] 3.2 Implementar funções de save/load/clear
    - `nvsSaveString()`: salvar string na NVS
    - `nvsLoadString()`: carregar string da NVS
    - `nvsClearNamespace()`: limpar namespace "provisioning"
    - `nvsKeyExists()`: verificar existência de chave
    - Usar biblioteca `Preferences.h` (wrapper do NVS)
    - _Requirements: 9.3, 9.4, 9.5_
  
  - [ ]* 3.3 Escrever testes unitários do módulo NVS
    - Testar save/load round-trip
    - Testar clear namespace
    - Testar verificação de existência de chave
    - Testar comportamento com chaves inexistentes
    - _Requirements: 9.3-9.6_

- [x] 4. Implementar módulo de RTC Sync
  - [x] 4.1 Criar arquivos `hardware/include/rtc_sync.h` e `hardware/src/rtc_sync.cpp`
    - Definir estrutura `RTCState` e funções de interface
    - _Requirements: 10.1, 10.2_
  
  - [x] 4.2 Implementar sincronização NTP
    - Função `rtcSyncNTP()` usando `configTime()`
    - Configurar servidor "pool.ntp.org" com timezone UTC-3
    - Timeout de 10 segundos
    - Atualizar flag `rtc_synced`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [x] 4.3 Implementar validação de timestamp (anti-replay)
    - Função `rtcValidateTimestamp()` com janela de ±300 segundos
    - Graceful degradation se RTC não sincronizado
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ]* 4.4 Escrever testes unitários do módulo RTC
    - Testar validação de timestamp dentro da janela
    - Testar rejeição de timestamp fora da janela
    - Testar graceful degradation (RTC não sincronizado)
    - _Requirements: 4.1-4.5, 10.1-10.5_

- [x] 5. Implementar módulo de ESP-NOW Communication
  - [x] 5.1 Criar arquivos `hardware/include/espnow_comm.h` e `hardware/src/espnow_comm.cpp`
    - Definir funções de interface e buffers globais
    - _Requirements: 6.1, 6.2_
  
  - [x] 5.2 Implementar inicialização ESP-NOW
    - Função `espnowInit()` usando `esp_now_init()`
    - Configurar canal WiFi (mesmo canal do ESP-MESH)
    - Tratamento de erro se inicialização falhar
    - _Requirements: 6.1, 15.1, 15.2_
  
  - [x] 5.3 Implementar registro de peer de broadcast
    - Função `espnowRegisterBroadcastPeer()`
    - Registrar MAC FF:FF:FF:FF:FF:FF
    - Configurar canal e criptografia (false)
    - _Requirements: 6.2_
  
  - [x] 5.4 Implementar callbacks de send/receive
    - `espnowReceiveCallback()`: copiar dados para buffer global
    - `espnowSendCallback()`: log de confirmação de envio
    - Callbacks não-bloqueantes (processamento no loop principal)
    - _Requirements: 6.3, 7.1, 7.2_
  
  - [x] 5.5 Implementar transmissão de payload criptografado
    - Função `espnowSendEncryptedPayload()`
    - Usar `esp_now_send()` com broadcast MAC
    - Tratamento de erro se transmissão falhar
    - _Requirements: 6.3, 6.4, 14.4_
  
  - [ ]* 5.6 Escrever testes unitários do módulo ESP-NOW
    - Testar inicialização (mock de esp_now_init)
    - Testar registro de peer de broadcast
    - Testar callbacks (mock de recepção)
    - _Requirements: 6.1-6.4, 7.1-7.2_

- [x] 6. Implementar módulo de Serial Parser
  - [x] 6.1 Criar arquivos `hardware/include/serial_parser.h` e `hardware/src/serial_parser.cpp`
    - Definir funções de interface para comandos Serial
    - _Requirements: 5.1_
  
  - [x] 6.2 Implementar parser de comandos Serial
    - Função `serialProcessLine()` para processar linha recebida
    - Parsing de comando e argumentos
    - _Requirements: 5.1_
  
  - [x] 6.3 Implementar comando PROVISION
    - Função `serialHandleProvision(ssid, password)`
    - Validar SSID (1-32 chars) e senha (8-64 chars)
    - Salvar credenciais na NVS
    - Aguardar 3s e reiniciar device
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  
  - [x] 6.4 Implementar comando RESET_PROVISION
    - Função `serialHandleResetProvision()`
    - Limpar namespace "provisioning" da NVS
    - Aguardar 3s e reiniciar device
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [ ]* 6.5 Escrever testes unitários do módulo Serial Parser
    - Testar comando PROVISION com argumentos válidos
    - Testar validação de SSID (tamanho mínimo/máximo)
    - Testar validação de senha (tamanho mínimo/máximo)
    - Testar comando RESET_PROVISION
    - _Requirements: 5.1-5.6, 11.1-11.5_

- [ ] 7. Checkpoint - Validar módulos isolados
  - Compilar firmware com novos módulos
  - Executar testes unitários de todos os módulos
  - Verificar que não há memory leaks
  - Perguntar ao usuário se há dúvidas ou ajustes necessários

- [x] 8. Implementar módulo de Provisioning (Lógica Principal)
  - [x] 8.1 Criar arquivos `hardware/include/provisioning.h` e `hardware/src/provisioning.cpp`
    - Definir estruturas `ProvisioningPayload`, `EncryptedPayload`, `TransmissionTimer`
    - Definir enum `ProvisioningState`
    - _Requirements: 1.1_
  
  - [x] 8.2 Implementar serialização/desserialização JSON
    - Função `serializeProvisioningPayload()` usando ArduinoJson
    - Função `deserializeProvisioningPayload()` usando ArduinoJson
    - Validar campos obrigatórios (ssid, password, timestamp, device_id)
    - Validar tamanho máximo de 200 bytes
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 3.5, 3.6, 3.7, 3.8, 16.1-16.6_
  
  - [x] 8.3 Implementar lógica de transmissão
    - Função `transmitProvisioningPayload()`
    - Criar payload com credenciais atuais
    - Serializar para JSON
    - Criptografar com AES-GCM
    - Transmitir via ESP-NOW
    - Timer de 10 minutos (600.000 ms)
    - Intervalo de 30 segundos entre transmissões
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7_
  
  - [x] 8.4 Implementar lógica de recepção e validação
    - Função `processReceivedProvisioningPayload()`
    - Verificar se device já possui credenciais (descartar se sim)
    - Extrair IV, Ciphertext, Auth_Tag
    - Descriptografar e validar Auth_Tag
    - Desserializar JSON
    - Validar campos obrigatórios
    - Validar timestamp (anti-replay)
    - Salvar credenciais na NVS
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_
  
  - [ ]* 8.5 Escrever testes unitários do módulo Provisioning
    - Testar serialização/desserialização JSON round-trip
    - Testar validação de campos obrigatórios
    - Testar validação de tamanho de JSON
    - Testar lógica de transmissão (mock de ESP-NOW)
    - Testar lógica de recepção (mock de callbacks)
    - _Requirements: 1.1-1.5, 6.3-6.7, 7.1-7.9, 16.1-16.6_

- [x] 9. Integrar com máquina de estados existente
  - [x] 9.1 Adicionar novos estados à enum `SystemState`
    - Adicionar `UNCONFIGURED`, `TRANSMITTING`
    - Renomear estado atual se necessário
    - _Requirements: 12.1_
  
  - [x] 9.2 Implementar transições de estado
    - BOOT → UNCONFIGURED (sem credenciais na NVS)
    - BOOT → WIFI_CONNECTING (com credenciais na NVS)
    - UNCONFIGURED → WIFI_CONNECTING (credenciais recebidas)
    - WIFI_CONNECTING → MESH_INIT (WiFi conectado)
    - MESH_INIT → TRANSMITTING (credenciais vieram de provisioning)
    - MESH_INIT → MQTT_CONNECTING (credenciais hardcoded)
    - TRANSMITTING → MQTT_CONNECTING (timer 10 min expirou)
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6_
  
  - [x] 9.3 Atualizar função `setup()`
    - Inicializar ESP-NOW ANTES de ESP-MESH
    - Verificar credenciais na NVS
    - Carregar credenciais da NVS se existirem
    - Definir estado inicial (UNCONFIGURED ou WIFI_CONNECTING)
    - _Requirements: 9.4, 9.5, 9.6, 9.7, 15.1_
  
  - [x] 9.4 Atualizar função `loop()`
    - Adicionar processamento de estado UNCONFIGURED
    - Adicionar processamento de estado TRANSMITTING
    - Processar payloads ESP-NOW recebidos (flag global)
    - Manter operação dual (botões + MQTT) durante TRANSMITTING
    - _Requirements: 6.8, 12.7, 14.6_
  
  - [ ]* 9.5 Escrever testes de integração da máquina de estados
    - Testar transição completa: BOOT → UNCONFIGURED → WIFI_CONNECTING → TRANSMITTING → OPERATIONAL
    - Testar fallback para credenciais hardcoded
    - Testar operação dual durante TRANSMITTING
    - _Requirements: 12.1-12.7_

- [x] 10. Implementar indicadores visuais (LED onboard)
  - [x] 10.1 Implementar padrão de LED para UNCONFIGURED
    - Piscar lento: 1s ON, 1s OFF
    - Função `updateLEDUnconfigured()` não-bloqueante
    - _Requirements: 8.2_
  
  - [x] 10.2 Implementar padrão de LED para TRANSMITTING
    - 3 piscadas rápidas (100ms ON/OFF) + 1,4s OFF (ciclo de 2s)
    - Função `updateLEDTransmitting()` não-bloqueante
    - _Requirements: 8.1, 8.4, 8.5_
  
  - [x] 10.3 Atualizar função `updateOnboardLED()`
    - Adicionar cases para UNCONFIGURED e TRANSMITTING
    - Manter padrões existentes para outros estados
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 11. Garantir compatibilidade com ESP-MESH
  - [ ] 11.1 Ajustar ordem de inicialização
    - Garantir que ESP-NOW é inicializado ANTES de ESP-MESH
    - Adicionar logs de confirmação
    - _Requirements: 15.1_
  
  - [ ] 11.2 Configurar canal WiFi consistente
    - Configurar ESP-NOW para usar canal 6 (MESH_CHANNEL)
    - Validar que ambos protocolos usam mesmo canal
    - _Requirements: 15.2, 15.3_
  
  - [ ] 11.3 Testar coexistência durante TRANSMITTING
    - Verificar que ESP-MESH continua roteando mensagens
    - Verificar que botões e MQTT funcionam normalmente
    - Verificar que callbacks não bloqueiam mutuamente
    - _Requirements: 15.3, 15.4_
  
  - [ ]* 11.4 Escrever testes de integração ESP-NOW + ESP-MESH
    - Testar inicialização na ordem correta
    - Testar coexistência de protocolos
    - Testar operação dual durante TRANSMITTING
    - _Requirements: 15.1-15.6_

- [ ] 12. Checkpoint - Validar integração completa
  - Compilar firmware completo
  - Executar todos os testes unitários
  - Executar testes de integração
  - Testar em hardware real (se disponível)
  - Perguntar ao usuário se há problemas ou ajustes necessários

- [ ] 13. Implementar logging de auditoria
  - [ ] 13.1 Adicionar logs para eventos de provisionamento
    - Log de configuração manual via Serial
    - Log de transmissão de broadcast
    - Log de recepção de payload
    - Log de erros de validação (Auth_Tag, timestamp)
    - Log de transições de estado
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_
  
  - [ ] 13.2 Garantir logs via Serial e MQTT
    - Usar função `logMQTT()` existente
    - Publicar logs no tópico `andon/logs/<mac>`
    - _Requirements: 13.1-13.8_

- [ ] 14. Implementar tratamento de erros e resiliência
  - [ ] 14.1 Adicionar tratamento de erro para criptografia
    - Verificar retorno de `encryptPayload()` e `decryptPayload()`
    - Log de erro com código de erro mbedtls
    - Abortar transmissão se criptografia falhar
    - _Requirements: 14.1, 14.2_
  
  - [ ] 14.2 Adicionar tratamento de erro para ESP-NOW
    - Verificar retorno de `esp_now_init()` e `esp_now_send()`
    - Log de erro com código de erro ESP-IDF
    - Desabilitar provisionamento se inicialização falhar
    - Retry de transmissão se envio falhar
    - _Requirements: 14.3, 14.4_
  
  - [ ] 14.3 Adicionar tratamento de perda de WiFi durante TRANSMITTING
    - Continuar transmitindo via ESP-NOW mesmo sem WiFi
    - Tentar reconectar após timer de 10 min expirar
    - _Requirements: 14.5_
  
  - [ ] 14.4 Garantir reset de Watchdog durante operações pesadas
    - Adicionar `esp_task_wdt_reset()` antes/depois de criptografia
    - Adicionar `esp_task_wdt_reset()` antes/depois de descriptografia
    - _Requirements: 14.6_

- [ ] 15. Atualizar arquivo de configuração
  - [ ] 15.1 Adicionar constantes ao `hardware/include/config.h`
    - `PROVISIONING_PASSPHRASE` (chave hardcoded)
    - `PROVISIONING_TRANSMISSION_DURATION_MS` (600.000 ms)
    - `PROVISIONING_TRANSMISSION_INTERVAL_MS` (30.000 ms)
    - `PROVISIONING_TIMESTAMP_WINDOW_S` (300 s)
    - `NTP_SERVER` ("pool.ntp.org")
    - `NTP_TIMEOUT_MS` (10.000 ms)
    - _Requirements: 2.2, 4.4, 6.4, 6.6, 10.1, 10.2_

- [ ] 16. Checkpoint final - Validação completa
  - Compilar firmware final
  - Executar todos os testes unitários
  - Executar todos os testes de integração
  - Verificar cobertura de código (>= 85%)
  - Verificar memory leaks (Valgrind ou similar)
  - Testar em hardware real com múltiplos devices
  - Perguntar ao usuário se está pronto para deploy

- [ ] 17. Documentação e entrega
  - [ ] 17.1 Atualizar README.md do hardware
    - Adicionar seção sobre Viral Provisioning
    - Documentar comandos Serial (PROVISION, RESET_PROVISION)
    - Documentar padrões de LED
    - Documentar fluxo de provisionamento
  
  - [ ] 17.2 Criar guia de troubleshooting
    - Problemas comuns e soluções
    - Como verificar logs de provisionamento
    - Como resetar credenciais
    - Como diagnosticar falhas de propagação
  
  - [ ] 17.3 Documentar arquitetura de segurança
    - Camadas de segurança implementadas
    - Riscos residuais e mitigações
    - Recomendações de deployment

## Notes

- Tasks marcadas com `*` são opcionais (testes) e podem ser puladas para MVP mais rápido
- Cada task referencia requirements específicos para rastreabilidade
- Checkpoints garantem validação incremental e oportunidade para feedback
- Property tests validam propriedades universais de correção
- Unit tests validam casos específicos e edge cases
- Testes de integração validam fluxo completo end-to-end
- Implementação usa C++ para ESP32 com bibliotecas Arduino/ESP-IDF
- Compatibilidade total com firmware ESP32 Andon existente é mantida
