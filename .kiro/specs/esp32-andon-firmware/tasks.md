# Implementation Plan: ESP32 Andon Firmware

## Overview

Este plano implementa o firmware ESP32 Andon usando PlatformIO com Arduino Framework. A implementação seguirá uma abordagem incremental, começando pela estrutura do projeto e configuração, depois implementando a máquina de estados e módulos de conectividade, e finalmente integrando os módulos de GPIO, debounce e controle de LEDs. Cada etapa será validada antes de prosseguir para a próxima.

## Tasks

- [x] 1. Setup do projeto PlatformIO e estrutura de diretórios
  - Criar diretório `hardware/` na raiz do repositório
  - Criar estrutura: `hardware/src/`, `hardware/include/`, `hardware/test/`
  - Criar `hardware/platformio.ini` com configuração para ESP32
  - Criar `hardware/include/config.h` com todas as constantes do sistema
  - Criar `hardware/src/main.cpp` com estrutura básica (setup e loop vazios)
  - Criar `hardware/.gitignore` para excluir `.pio/` e `.vscode/`
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.8, 12.9_

- [x] 2. Implementar arquivo de configuração (config.h)
  - Definir versão do firmware (FIRMWARE_VERSION "1.0.0")
  - Definir credenciais WiFi (WIFI_SSID, WIFI_PASSWORD)
  - Definir configurações MQTT (MQTT_BROKER, MQTT_PORT, MQTT_MAX_PACKET_SIZE)
  - Definir mapeamento de GPIOs para botões (34, 35, 32)
  - Definir mapeamento de GPIOs para LEDs (25, 26, 33, 2)
  - Definir constantes de timers (DEBOUNCE_MS, HEARTBEAT_INTERVAL_MS, etc.)
  - Definir constantes de reconexão (INITIAL_BACKOFF_MS, MAX_BACKOFF_MS)
  - Definir thresholds (HEAP_WARN_THRESHOLD, WATCHDOG_TIMEOUT_S)
  - _Requirements: 12.10, 12.11, 12.12, 12.13, 12.14, 12.15, 12.16_

- [x] 3. Implementar estruturas de dados e enums
  - Criar enum SystemState (BOOT, WIFI_CONNECTING, MQTT_CONNECTING, OPERATIONAL)
  - Criar struct ButtonState com campos (pin, lastState, currentState, lastDebounceTime, pressed)
  - Criar struct LEDState com campos (pin, state)
  - Criar struct Timer com campos (interval, lastTrigger)
  - Criar struct ReconnectionState com campos (attemptCount, backoffDelay, lastAttempt)
  - Declarar variáveis globais de estado (currentState, macAddress, deviceName)
  - Declarar instâncias de ButtonState para os três botões
  - Declarar instâncias de LEDState para os quatro LEDs
  - Declarar instâncias de Timer (heartbeat, heapMonitor, ledBlink)
  - Declarar instâncias de ReconnectionState (wifiReconnect, mqttReconnect)
  - _Requirements: 2.1, 2.2_

- [x] 4. Implementar módulo de inicialização (estado BOOT)
  - [x] 4.1 Implementar função setup() com inicialização Serial
    - Inicializar Serial.begin(115200)
    - Aguardar Serial estar pronto
    - Publicar mensagem de boot com versão do firmware
    - _Requirements: 2.3, 11.2, 15.2_
  
  - [x] 4.2 Implementar configuração de GPIOs
    - Configurar GPIO 34 como INPUT (botão verde)
    - Configurar GPIO 35 como INPUT (botão amarelo)
    - Configurar GPIO 32 como INPUT_PULLUP (botão vermelho)
    - Configurar GPIOs 25, 26, 33, 2 como OUTPUT (LEDs)
    - Definir estado inicial de todos os LEDs como LOW
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_
  
  - [x] 4.3 Implementar inicialização do Watchdog Timer
    - Chamar esp_task_wdt_init(30, true)
    - Chamar esp_task_wdt_add(NULL)
    - Detectar reset por watchdog usando esp_reset_reason()
    - Publicar log se watchdog reset foi detectado
    - _Requirements: 9.1, 9.2, 9.3, 9.6_
  
  - [x] 4.4 Implementar obtenção e formatação do MAC address
    - Obter MAC usando WiFi.macAddress()
    - Formatar como string "AA:BB:CC:DD:EE:FF"
    - Extrair últimos 4 caracteres para device_name
    - Criar device_name como "ESP32-Andon-XXXX"
    - _Requirements: 5.3, 5.4_
  
  - [x] 4.5 Implementar transição para WIFI_CONNECTING
    - Definir currentState = WIFI_CONNECTING
    - Publicar log de transição via Serial
    - _Requirements: 2.4_

- [x] 5. Implementar módulo WiFi (estado WIFI_CONNECTING)
  - [x] 5.1 Implementar função de conexão WiFi
    - Configurar WiFi.mode(WIFI_STA)
    - Chamar WiFi.begin(WIFI_SSID, WIFI_PASSWORD)
    - Implementar verificação de status usando WiFi.status()
    - Implementar timeout de 30s por tentativa
    - _Requirements: 3.1, 3.2, 3.5, 3.8_
  
  - [x] 5.2 Implementar indicador visual de conexão WiFi
    - Piscar Onboard_LED a cada 500ms durante WIFI_CONNECTING
    - Usar millis() para temporização não-bloqueante
    - _Requirements: 3.3, 14.1, 14.5_
  
  - [x] 5.3 Implementar lógica de reconexão WiFi com backoff
    - Implementar função updateBackoff() para dobrar delay
    - Implementar função resetBackoff() para resetar após sucesso
    - Aplicar backoff exponencial (5s → 10s → 20s → 40s → 60s max)
    - _Requirements: 13.2, 16.1, 16.2, 16.3, 16.4_
  
  - [x] 5.4 Implementar transição para MQTT_CONNECTING
    - Verificar WiFi.status() == WL_CONNECTED
    - Publicar log com IP obtido (WiFi.localIP())
    - Definir currentState = MQTT_CONNECTING
    - Resetar backoff de WiFi
    - _Requirements: 2.6, 3.4, 11.3_
  
  - [x] 5.5 Implementar detecção de perda de WiFi
    - Verificar WiFi.status() a cada loop quando OPERATIONAL
    - Transitar para WIFI_CONNECTING se conexão perdida
    - Publicar log de erro
    - _Requirements: 2.10, 3.6, 3.7, 13.1_

- [x] 6. Implementar módulo MQTT (estado MQTT_CONNECTING)
  - [x] 6.1 Implementar inicialização do cliente MQTT
    - Criar instâncias WiFiClient e PubSubClient
    - Configurar mqttClient.setServer(MQTT_BROKER, MQTT_PORT)
    - Configurar mqttClient.setBufferSize(MQTT_MAX_PACKET_SIZE)
    - Configurar mqttClient.setCallback(mqttCallback)
    - _Requirements: 4.1, 4.2, 13.6_
  
  - [x] 6.2 Implementar configuração de LWT
    - Definir lwt_topic como "andon/status/{mac}"
    - Definir lwt_message como "offline"
    - Definir lwt_qos como 1, lwt_retain como true
    - Passar LWT para client.connect()
    - _Requirements: 4.3_
  
  - [x] 6.3 Implementar função de conexão MQTT
    - Chamar client.connect() com clientId e LWT
    - Implementar timeout de 10 tentativas
    - Aplicar backoff exponencial
    - _Requirements: 4.4, 4.7_
  
  - [x] 6.4 Implementar publicação de status online e discovery
    - Publicar "online" em andon/status/{mac} (QoS 1, retain)
    - Criar Discovery_Message JSON com mac_address, device_name, firmware_version
    - Publicar Discovery_Message em andon/discovery (QoS 1)
    - _Requirements: 4.5, 4.6, 5.2, 5.5, 5.6_
  
  - [x] 6.5 Implementar subscrição ao tópico de comandos LED
    - Subscrever andon/led/{mac}/command com QoS 1
    - Verificar sucesso da subscrição
    - _Requirements: 8.1_
  
  - [x] 6.6 Implementar indicador visual de conexão MQTT
    - Piscar Onboard_LED a cada 1000ms durante MQTT_CONNECTING
    - Acender Onboard_LED continuamente quando OPERATIONAL
    - _Requirements: 14.2, 14.3, 14.4_
  
  - [x] 6.7 Implementar transição para OPERATIONAL
    - Verificar client.connected() == true
    - Definir currentState = OPERATIONAL
    - Publicar log de sucesso
    - Resetar backoff de MQTT
    - _Requirements: 2.8, 4.5, 11.4_
  
  - [x] 6.8 Implementar detecção de perda de MQTT
    - Verificar client.connected() a cada loop quando OPERATIONAL
    - Transitar para MQTT_CONNECTING se conexão perdida
    - Publicar log de erro
    - _Requirements: 2.10, 4.8, 4.9_
  
  - [x] 6.9 Implementar escalação de falhas MQTT
    - Contar tentativas consecutivas de conexão MQTT
    - Após 10 falhas, chamar ESP.restart()
    - Publicar log antes de reiniciar
    - _Requirements: 13.7, 13.8, 16.5_

- [x] 7. Implementar módulo de debounce de botões
  - [x] 7.1 Implementar função processButton()
    - Ler estado atual do GPIO
    - Detectar transições (HIGH → LOW ou LOW → HIGH)
    - Registrar timestamp da transição
    - Ignorar transições dentro de 50ms da última
    - Atualizar currentState após debounce válido
    - Definir flag pressed quando transição válida detectada
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  
  - [ ]* 7.2 Escrever testes unitários para debounce
    - Testar que transições rápidas são filtradas
    - Testar que pressionamentos longos são detectados
    - Testar estado independente de cada botão
    - _Requirements: 6.3, 6.4_
  
  - [ ]* 7.3 Escrever teste de propriedade para debounce filtering
    - **Property 3: Button Debounce Filtering**
    - **Validates: Requirements 6.3**

- [x] 8. Implementar módulo de eventos de botões
  - [x] 8.1 Implementar função publishButtonEvent()
    - Construir tópico "andon/button/{mac}/{color}"
    - Publicar payload "PRESSED" com QoS 1
    - Verificar sucesso da publicação
    - Publicar log via Serial indicando botão acionado
    - Resetar flag pressed do botão
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 8.2 Implementar processamento de botões no loop OPERATIONAL
    - Chamar processButton() para cada botão
    - Verificar flag pressed de cada botão
    - Chamar publishButtonEvent() se pressed == true
    - Executar apenas quando currentState == OPERATIONAL
    - _Requirements: 7.6, 8.8_
  
  - [x] 8.3 Implementar tratamento de falha de publicação
    - Verificar retorno de client.publish()
    - Publicar log de erro se falhar
    - _Requirements: 7.7, 13.1_
  
  - [ ]* 8.4 Escrever teste de propriedade para button event publishing
    - **Property 5: Button Event Publishing**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 9. Implementar módulo de controle de LEDs via MQTT
  - [x] 9.1 Implementar função mqttCallback()
    - Receber topic e payload
    - Verificar se topic corresponde a "andon/led/{mac}/command"
    - Passar payload para processLEDCommand()
    - _Requirements: 8.1_
  
  - [x] 9.2 Implementar função processLEDCommand()
    - Criar StaticJsonDocument<128> para parsing
    - Chamar deserializeJson() no payload
    - Validar que campos red, yellow, green existem
    - Extrair valores booleanos dos campos
    - Chamar updateLEDState() para cada LED
    - Retornar true se sucesso, false se erro
    - _Requirements: 8.2, 8.10, 13.5_
  
  - [x] 9.3 Implementar função updateLEDState()
    - Receber LEDState e novo estado booleano
    - Escrever HIGH ou LOW no GPIO usando digitalWrite()
    - Atualizar campo state da estrutura LEDState
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
  
  - [x] 9.4 Implementar tratamento de erros de JSON
    - Verificar DeserializationError após deserializeJson()
    - Publicar log de erro via Serial e MQTT se JSON inválido
    - Descartar payload sem modificar estado dos LEDs
    - _Requirements: 8.10, 13.5_
  
  - [x] 9.5 Implementar restrição de estado OPERATIONAL
    - Processar comandos LED apenas quando currentState == OPERATIONAL
    - Ignorar comandos recebidos em outros estados
    - _Requirements: 8.11_
  
  - [ ]* 9.6 Escrever testes unitários para parsing de LED commands
    - Testar JSON válido com todos os campos
    - Testar JSON inválido (malformado)
    - Testar JSON com campos faltando
    - _Requirements: 8.2, 8.10_
  
  - [ ]* 9.7 Escrever teste de propriedade para LED state synchronization
    - **Property 6: LED State Synchronization**
    - **Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.7, 8.8**
  
  - [ ]* 9.8 Escrever teste de propriedade para invalid JSON rejection
    - **Property 7: Invalid JSON Rejection**
    - **Validates: Requirements 8.10, 13.5**

- [x] 10. Checkpoint - Validar módulos básicos
  - Compilar o projeto com `pio run`
  - Verificar que não há erros de compilação
  - Verificar que todas as bibliotecas foram resolvidas
  - Perguntar ao usuário se há dúvidas ou ajustes necessários

- [x] 11. Implementar módulo de serialização JSON
  - [x] 11.1 Implementar função createDiscoveryMessage()
    - Criar StaticJsonDocument<256>
    - Adicionar campo mac_address
    - Adicionar campo device_name
    - Adicionar campo firmware_version
    - Serializar para string usando serializeJson()
    - Retornar string JSON
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 11.2 Implementar validação de buffer JSON
    - Verificar tamanho do buffer (256 bytes para discovery)
    - Verificar retorno de serializeJson() para detectar overflow
    - Publicar log de erro se overflow detectado
    - _Requirements: 5.7, 5.8_
  
  - [ ]* 11.3 Escrever testes unitários para discovery message
    - Testar formato correto do JSON
    - Testar todos os campos presentes
    - Testar formatação do device_name
    - _Requirements: 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 11.4 Escrever teste de propriedade para device name formatting
    - **Property 2: Device Name Formatting**
    - **Validates: Requirements 5.4**

- [x] 12. Implementar módulo de timers não-bloqueantes
  - [x] 12.1 Implementar função checkTimer()
    - Receber referência para Timer
    - Calcular tempo decorrido usando millis()
    - Retornar true se interval expirou
    - Atualizar lastTrigger se expirou
    - _Requirements: 3.8, 6.6_
  
  - [x] 12.2 Implementar timer de heartbeat
    - Usar checkTimer() com heartbeatTimer (300000ms)
    - Publicar "heartbeat" em andon/status/{mac} quando expirar
    - Incluir heap livre no log de heartbeat
    - Executar apenas quando OPERATIONAL
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 17.3_
  
  - [x] 12.3 Implementar timer de monitoramento de heap
    - Usar checkTimer() com heapMonitorTimer (30000ms)
    - Chamar ESP.getFreeHeap() quando expirar
    - Publicar warning se heap < HEAP_WARN_THRESHOLD
    - _Requirements: 17.1, 17.2_
  
  - [x] 12.4 Implementar timer de piscada do LED onboard
    - Ajustar ledBlinkTimer.interval baseado no estado (500ms ou 1000ms)
    - Alternar estado do Onboard_LED quando timer expirar
    - _Requirements: 14.1, 14.2, 14.5_
  
  - [ ]* 12.5 Escrever teste de propriedade para heartbeat periodicity
    - **Property 10: Heartbeat Periodicity**
    - **Validates: Requirements 10.1, 10.4**
  
  - [ ]* 12.6 Escrever teste de propriedade para heap monitoring periodicity
    - **Property 17: Heap Monitoring Periodicity**
    - **Validates: Requirements 17.1**

- [x] 13. Implementar módulo de logging
  - [x] 13.1 Implementar função logSerial()
    - Receber mensagem como String
    - Formatar com timestamp (millis())
    - Publicar via Serial.println()
    - _Requirements: 11.7, 11.8_
  
  - [x] 13.2 Implementar função logMQTT()
    - Receber mensagem como String
    - Publicar em andon/logs/{mac} com QoS 1
    - Chamar também logSerial() para duplicar no Serial
    - Executar apenas se MQTT conectado
    - _Requirements: 11.1, 11.7, 11.8_
  
  - [x] 13.3 Implementar logging de erros de rede
    - Publicar log quando WiFi falha (com status code)
    - Publicar log quando MQTT falha (com error code)
    - Publicar log quando publish MQTT falha
    - _Requirements: 11.5, 13.1_
  
  - [ ]* 13.4 Escrever teste de propriedade para serial logging consistency
    - **Property 11: Serial Logging Consistency**
    - **Validates: Requirements 11.7, 11.8**
  
  - [ ]* 13.5 Escrever teste de propriedade para network error logging
    - **Property 12: Network Error Logging**
    - **Validates: Requirements 13.1**

- [x] 14. Implementar loop principal (função loop())
  - [x] 14.1 Implementar reset do watchdog
    - Chamar esp_task_wdt_reset() no início de cada iteração
    - _Requirements: 9.4_
  
  - [x] 14.2 Implementar chamada de client.loop()
    - Chamar mqttClient.loop() para processar mensagens MQTT
    - _Requirements: 4.10_
  
  - [x] 14.3 Implementar switch-case baseado em currentState
    - Case BOOT: chamar função de inicialização
    - Case WIFI_CONNECTING: chamar função de conexão WiFi
    - Case MQTT_CONNECTING: chamar função de conexão MQTT
    - Case OPERATIONAL: chamar função de operação normal
    - _Requirements: 2.1, 2.9_
  
  - [x] 14.4 Implementar função operationalLoop()
    - Processar botões (chamar processButton para cada um)
    - Verificar flags pressed e publicar eventos
    - Verificar timers (heartbeat, heap monitor)
    - Verificar status WiFi e MQTT
    - Atualizar LED onboard
    - _Requirements: 2.9, 7.6, 8.11, 10.5_
  
  - [ ]* 14.5 Escrever teste de propriedade para watchdog reset frequency
    - **Property 9: Watchdog Reset Frequency**
    - **Validates: Requirements 9.4**
  
  - [ ]* 14.6 Escrever teste de propriedade para operational state restriction
    - **Property 8: Operational State Restriction**
    - **Validates: Requirements 7.6, 8.11, 10.5**

- [x] 15. Checkpoint - Validar integração completa
  - Compilar o projeto completo
  - Verificar tamanho do binário (deve caber na flash do ESP32)
  - Verificar uso de RAM estática
  - Perguntar ao usuário se há dúvidas antes do upload

- [ ] 16. Implementar testes de propriedades adicionais
  - [ ]* 16.1 Escrever teste de propriedade para connection loss recovery
    - **Property 1: Connection Loss Recovery**
    - **Validates: Requirements 2.10, 3.7, 4.9**
  
  - [ ]* 16.2 Escrever teste de propriedade para valid button press detection
    - **Property 4: Valid Button Press Detection**
    - **Validates: Requirements 6.4**
  
  - [ ]* 16.3 Escrever teste de propriedade para exponential backoff growth
    - **Property 13: Exponential Backoff Growth**
    - **Validates: Requirements 13.2, 16.2, 16.3**
  
  - [ ]* 16.4 Escrever teste de propriedade para backoff reset on success
    - **Property 14: Backoff Reset on Success**
    - **Validates: Requirements 16.4**
  
  - [ ]* 16.5 Escrever teste de propriedade para MQTT message size limit
    - **Property 15: MQTT Message Size Limit**
    - **Validates: Requirements 13.6**
  
  - [ ]* 16.6 Escrever teste de propriedade para LED blink pattern state mapping
    - **Property 16: LED Blink Pattern State Mapping**
    - **Validates: Requirements 14.4**
  
  - [ ]* 16.7 Escrever teste de propriedade para heartbeat heap reporting
    - **Property 18: Heartbeat Heap Reporting**
    - **Validates: Requirements 17.3**

- [x] 17. Criar documentação do projeto
  - [x] 17.1 Criar hardware/README.md
    - Seção de visão geral do projeto
    - Instruções de instalação do PlatformIO
    - Instruções de compilação (`pio run`)
    - Instruções de upload (`pio run --target upload`)
    - Instruções de monitoramento Serial (`pio device monitor`)
    - Mapa de GPIOs (botões e LEDs)
    - Seção de troubleshooting comum
    - Instruções de atualização de versão
    - _Requirements: 12.17, 15.5, 15.6_
  
  - [x] 17.2 Adicionar comentários de cabeçalho no main.cpp
    - Incluir versão do firmware
    - Incluir autor e data
    - Incluir descrição breve do sistema
    - _Requirements: 15.4_
  
  - [x] 17.3 Documentar processo de testes
    - Adicionar seção no README sobre execução de testes
    - Documentar comandos de teste unitário
    - Documentar comandos de teste de propriedades
    - Documentar setup de HIL testing

- [x] 18. Checkpoint final - Validação completa
  - Compilar projeto final
  - Verificar que todos os requisitos foram cobertos
  - Verificar que não há warnings de compilação
  - Perguntar ao usuário se deseja fazer upload no hardware para teste

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- Cada task referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Testes de propriedades validam propriedades universais de corretude
- Testes unitários validam exemplos específicos e casos extremos
- O firmware usa C++ com Arduino Framework via PlatformIO
- Toda a implementação será feita no diretório `hardware/` na raiz do repositório
- A linguagem de implementação é C++ (Arduino Framework)
