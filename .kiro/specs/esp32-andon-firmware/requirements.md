# Requirements Document

## Introduction

Este documento especifica os requisitos para o firmware ESP32 do sistema Andon do ID Visual AX. O firmware será desenvolvido usando PlatformIO com Arduino Framework e será responsável por capturar acionamentos de botões físicos no chão de fábrica, indicar status visual através de LEDs e comunicar-se com o backend FastAPI via protocolo MQTT. O dispositivo funcionará como interface física para o sistema Andon, permitindo que operadores sinalizem alertas (amarelo) e paradas críticas (vermelho) diretamente da mesa de trabalho.

## Glossary

- **ESP32_Device**: Microcontrolador ESP32 com WiFi integrado, executando o firmware Andon.
- **Andon_Button**: Botão físico conectado aos GPIOs do ESP32 (verde, amarelo ou vermelho).
- **Status_LED**: LED indicador de status da mesa de trabalho (verde, amarelo ou vermelho).
- **Onboard_LED**: LED interno do ESP32 (GPIO 2) usado para indicar conectividade WiFi/MQTT.
- **MQTT_Broker**: Servidor MQTT (Mosquitto) rodando em 192.168.10.55:1883.
- **Discovery_Message**: Mensagem JSON publicada no tópico `andon/discovery` para registro automático do dispositivo.
- **Status_Message**: Mensagem de texto publicada no tópico `andon/status/{mac}` indicando "online" ou "offline".
- **Log_Message**: Mensagem de diagnóstico publicada no tópico `andon/logs/{mac}`.
- **LWT**: Last Will and Testament - mensagem MQTT enviada automaticamente pelo broker quando o dispositivo desconecta.
- **Debounce**: Técnica para filtrar ruído elétrico em botões, ignorando transições rápidas dentro de uma janela de tempo.
- **Watchdog_Timer**: Mecanismo de hardware que reinicia o ESP32 se o firmware travar ou parar de responder.
- **State_Machine**: Máquina de estados que controla o ciclo de vida do firmware (BOOT → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL).
- **Heartbeat**: Mensagem periódica enviada para indicar que o dispositivo está ativo e operacional.
- **MAC_Address**: Endereço MAC único do ESP32, usado como identificador do dispositivo.
- **QoS**: Quality of Service - nível de garantia de entrega de mensagens MQTT (0, 1 ou 2).

---

## Requirements

### Requirement 1: Configuração de Hardware e Pinagem

**User Story:** Como engenheiro de hardware, quero que o firmware configure corretamente todos os GPIOs do ESP32, para que os botões e LEDs funcionem conforme o esquema elétrico definido.

#### Acceptance Criteria

1. THE Firmware SHALL configurar GPIO 34 como entrada digital para o Andon_Button verde (sem pull-up interno, pois GPIO 34 é input-only).
2. THE Firmware SHALL configurar GPIO 35 como entrada digital para o Andon_Button amarelo (sem pull-up interno, pois GPIO 35 é input-only).
3. THE Firmware SHALL configurar GPIO 32 como entrada digital com pull-up interno para o Andon_Button vermelho.
4. THE Firmware SHALL configurar GPIO 25 como saída digital para o Status_LED vermelho.
5. THE Firmware SHALL configurar GPIO 26 como saída digital para o Status_LED amarelo.
6. THE Firmware SHALL configurar GPIO 33 como saída digital para o Status_LED verde.
7. THE Firmware SHALL configurar GPIO 2 como saída digital para o Onboard_LED (indicador WiFi/MQTT).
8. WHEN o firmware inicia (função `setup()`), THE Firmware SHALL definir o estado inicial de todos os Status_LEDs como LOW (desligados).
9. WHEN o firmware inicia, THE Firmware SHALL definir o estado inicial do Onboard_LED como LOW.

---

### Requirement 2: Máquina de Estados — Ciclo de Vida do Firmware

**User Story:** Como desenvolvedor de firmware, quero que o dispositivo siga uma máquina de estados bem definida, para que o comportamento do sistema seja previsível e depurável.

#### Acceptance Criteria

1. THE Firmware SHALL implementar uma State_Machine com os estados: `BOOT`, `WIFI_CONNECTING`, `MQTT_CONNECTING`, `OPERATIONAL`.
2. WHEN o firmware inicia, THE State_Machine SHALL começar no estado `BOOT`.
3. WHILE no estado `BOOT`, THE Firmware SHALL inicializar o Serial Monitor (115200 baud), configurar os GPIOs e inicializar o Watchdog_Timer com timeout de 30 segundos.
4. WHEN a inicialização do estado `BOOT` é concluída, THE State_Machine SHALL transitar para o estado `WIFI_CONNECTING`.
5. WHILE no estado `WIFI_CONNECTING`, THE Firmware SHALL tentar conectar ao WiFi usando as credenciais configuradas (SSID: "AX-CORPORATIVO").
6. WHEN a conexão WiFi é estabelecida com sucesso, THE State_Machine SHALL transitar para o estado `MQTT_CONNECTING`.
7. WHILE no estado `MQTT_CONNECTING`, THE Firmware SHALL tentar conectar ao MQTT_Broker (192.168.10.55:1883).
8. WHEN a conexão MQTT é estabelecida com sucesso, THE State_Machine SHALL transitar para o estado `OPERATIONAL`.
9. WHILE no estado `OPERATIONAL`, THE Firmware SHALL processar eventos de botões, atualizar LEDs e enviar mensagens MQTT.
10. IF a conexão WiFi ou MQTT for perdida durante o estado `OPERATIONAL`, THEN THE State_Machine SHALL retornar ao estado apropriado (`WIFI_CONNECTING` ou `MQTT_CONNECTING`) para reconexão.

---

### Requirement 3: Conexão WiFi com Reconexão Automática

**User Story:** Como operador de TI, quero que o dispositivo se conecte automaticamente ao WiFi e reconecte em caso de falha, para que o sistema seja resiliente a instabilidades de rede.

#### Acceptance Criteria

1. THE Firmware SHALL usar a biblioteca `WiFi.h` para gerenciar a conexão WiFi.
2. WHEN no estado `WIFI_CONNECTING`, THE Firmware SHALL tentar conectar ao SSID "AX-CORPORATIVO" usando `WiFi.begin()`.
3. WHILE aguardando conexão WiFi, THE Firmware SHALL piscar o Onboard_LED a cada 500ms para indicar tentativa de conexão.
4. WHEN a conexão WiFi é estabelecida (`WiFi.status() == WL_CONNECTED`), THE Firmware SHALL acender o Onboard_LED de forma contínua e publicar uma Log_Message com o IP obtido.
5. WHEN a conexão WiFi falha após 30 segundos de tentativas, THE Firmware SHALL publicar uma Log_Message de erro e tentar novamente após 5 segundos.
6. WHILE no estado `OPERATIONAL`, THE Firmware SHALL verificar o status WiFi a cada ciclo de loop usando `WiFi.status()`.
7. IF a conexão WiFi for perdida durante operação (`WiFi.status() != WL_CONNECTED`), THEN THE Firmware SHALL apagar o Onboard_LED e retornar ao estado `WIFI_CONNECTING`.
8. THE Firmware SHALL usar `millis()` para temporização não-bloqueante, evitando o uso de `delay()` no loop principal.

---

### Requirement 4: Conexão MQTT com QoS e LWT

**User Story:** Como engenheiro de backend, quero que o dispositivo se conecte ao broker MQTT com QoS 1 e configure Last Will and Testament, para que o backend detecte automaticamente desconexões inesperadas.

#### Acceptance Criteria

1. THE Firmware SHALL usar a biblioteca `PubSubClient.h` (versão 2.8 ou superior) para comunicação MQTT.
2. THE Firmware SHALL configurar o MQTT_Broker como "192.168.10.55" na porta 1883.
3. WHEN no estado `MQTT_CONNECTING`, THE Firmware SHALL configurar o LWT para publicar "offline" no tópico `andon/status/{mac}` com QoS 1 e retain flag ativado.
4. WHEN no estado `MQTT_CONNECTING`, THE Firmware SHALL tentar conectar ao MQTT_Broker usando `client.connect()` com o MAC_Address como Client ID.
5. WHEN a conexão MQTT é estabelecida com sucesso, THE Firmware SHALL publicar "online" no tópico `andon/status/{mac}` com QoS 1 e retain flag ativado.
6. WHEN a conexão MQTT é estabelecida com sucesso, THE Firmware SHALL publicar uma Discovery_Message no tópico `andon/discovery` com QoS 1.
7. WHEN a conexão MQTT falha após 10 tentativas, THE Firmware SHALL publicar uma Log_Message de erro via Serial e tentar novamente após 5 segundos.
8. WHILE no estado `OPERATIONAL`, THE Firmware SHALL verificar a conexão MQTT a cada ciclo de loop usando `client.connected()`.
9. IF a conexão MQTT for perdida durante operação, THEN THE Firmware SHALL retornar ao estado `MQTT_CONNECTING`.
10. THE Firmware SHALL chamar `client.loop()` a cada iteração do loop principal para processar mensagens MQTT.

---

### Requirement 5: Publicação de Discovery Message

**User Story:** Como backend MQTT service, quero receber uma mensagem de discovery estruturada quando o dispositivo se conecta, para que eu possa registrar automaticamente o dispositivo no banco de dados.

#### Acceptance Criteria

1. THE Firmware SHALL usar a biblioteca `ArduinoJson.h` (versão 6.x) para serializar mensagens JSON.
2. WHEN a conexão MQTT é estabelecida pela primeira vez, THE Firmware SHALL construir uma Discovery_Message contendo os campos `mac_address`, `device_name` e `firmware_version`.
3. THE Firmware SHALL obter o MAC_Address usando `WiFi.macAddress()` e formatar como string hexadecimal (ex: "AA:BB:CC:DD:EE:FF").
4. THE Firmware SHALL definir o campo `device_name` como "ESP32-Andon-" concatenado com os últimos 4 caracteres do MAC_Address (ex: MAC "AA:BB:CC:DD:EE:FF" resulta em "ESP32-Andon-EEFF").
5. THE Firmware SHALL incluir o campo `firmware_version` contendo a versão definida na constante `FIRMWARE_VERSION` (ex: "1.0.0").
6. THE Firmware SHALL publicar a Discovery_Message no tópico `andon/discovery` com QoS 1.
7. THE Firmware SHALL alocar um buffer JSON de tamanho adequado (mínimo 256 bytes) para evitar truncamento.
8. IF a serialização JSON falhar, THEN THE Firmware SHALL publicar uma Log_Message de erro via Serial e via tópico `andon/logs/{mac}`.

---

### Requirement 6: Debounce de Botões com millis()

**User Story:** Como operador de chão de fábrica, quero que o sistema ignore ruídos elétricos nos botões, para que apenas pressionamentos intencionais sejam registrados.

#### Acceptance Criteria

1. THE Firmware SHALL implementar debounce de 50ms para cada Andon_Button usando `millis()`.
2. WHEN um Andon_Button é pressionado (transição HIGH → LOW), THE Firmware SHALL registrar o timestamp da transição.
3. WHEN uma transição de botão é detectada, THE Firmware SHALL ignorar novas transições do mesmo botão por 50ms.
4. WHEN o período de debounce expira e o botão ainda está pressionado, THE Firmware SHALL considerar o pressionamento como válido.
5. THE Firmware SHALL manter variáveis de estado separadas para cada botão (último estado, último timestamp de transição).
6. THE Firmware SHALL usar lógica não-bloqueante baseada em `millis()` para implementar o debounce, evitando o uso de `delay()`.

---

### Requirement 7: Processamento de Eventos de Botões

**User Story:** Como operador de chão de fábrica, quero que cada botão reporte eventos ao backend, para que o sistema possa processar a lógica de negócio e controlar os LEDs remotamente.

#### Acceptance Criteria

1. WHEN o Andon_Button verde é pressionado (após debounce), THE Firmware SHALL publicar uma mensagem no tópico `andon/button/{mac}/green` com payload "PRESSED" e QoS 1.
2. WHEN o Andon_Button amarelo é pressionado (após debounce), THE Firmware SHALL publicar uma mensagem no tópico `andon/button/{mac}/yellow` com payload "PRESSED" e QoS 1.
3. WHEN o Andon_Button vermelho é pressionado (após debounce), THE Firmware SHALL publicar uma mensagem no tópico `andon/button/{mac}/red` com payload "PRESSED" e QoS 1.
4. THE Firmware SHALL reportar apenas o evento de pressionamento do botão, sem executar qualquer lógica de controle de LEDs localmente.
5. WHEN um botão é pressionado, THE Firmware SHALL publicar uma Log_Message via Serial indicando qual botão foi acionado.
6. THE Firmware SHALL processar eventos de botões apenas quando no estado `OPERATIONAL`.
7. IF a publicação MQTT de um evento de botão falhar, THEN THE Firmware SHALL registrar o erro via Serial e tentar reenviar na próxima iteração do loop.

---

### Requirement 8: Controle de Status LEDs via MQTT

**User Story:** Como backend MQTT service, quero controlar remotamente os LEDs de status do dispositivo, para que o estado visual da mesa reflita o status do sistema Andon conforme a lógica de negócio processada no backend.

#### Acceptance Criteria

1. THE Firmware SHALL se inscrever no tópico `andon/led/{mac}/command` com QoS 1 quando a conexão MQTT é estabelecida.
2. WHEN uma mensagem é recebida no tópico `andon/led/{mac}/command`, THE Firmware SHALL extrair o payload JSON contendo os campos `red`, `yellow` e `green` (valores booleanos).
3. WHEN o campo `red` é `true`, THE Firmware SHALL acender o Status_LED vermelho (GPIO 25 HIGH).
4. WHEN o campo `red` é `false`, THE Firmware SHALL apagar o Status_LED vermelho (GPIO 25 LOW).
5. WHEN o campo `yellow` é `true`, THE Firmware SHALL acender o Status_LED amarelo (GPIO 26 HIGH).
6. WHEN o campo `yellow` é `false`, THE Firmware SHALL apagar o Status_LED amarelo (GPIO 26 LOW).
7. WHEN o campo `green` é `true`, THE Firmware SHALL acender o Status_LED verde (GPIO 33 HIGH).
8. WHEN o campo `green` é `false`, THE Firmware SHALL apagar o Status_LED verde (GPIO 33 LOW).
9. THE Firmware SHALL executar apenas os comandos de LED recebidos via MQTT, sem implementar qualquer lógica de decisão local sobre qual LED acender.
10. IF o payload JSON for inválido ou não contiver os campos esperados, THEN THE Firmware SHALL publicar uma Log_Message de erro e ignorar o comando.
11. THE Firmware SHALL processar comandos de LED apenas quando no estado `OPERATIONAL`.

---

### Requirement 9: Watchdog Timer para Resiliência

**User Story:** Como engenheiro de confiabilidade, quero que o dispositivo reinicie automaticamente se o firmware travar, para que o sistema se recupere de falhas sem intervenção manual.

#### Acceptance Criteria

1. THE Firmware SHALL usar a biblioteca `esp_task_wdt.h` para configurar o Watchdog_Timer.
2. WHEN o firmware inicia (estado `BOOT`), THE Firmware SHALL inicializar o Watchdog_Timer com timeout de 30 segundos usando `esp_task_wdt_init()`.
3. WHEN o Watchdog_Timer é inicializado, THE Firmware SHALL adicionar a task atual ao watchdog usando `esp_task_wdt_add(NULL)`.
4. WHILE no loop principal, THE Firmware SHALL resetar o Watchdog_Timer a cada iteração usando `esp_task_wdt_reset()`.
5. IF o firmware não resetar o Watchdog_Timer dentro de 30 segundos, THEN THE Watchdog_Timer SHALL reiniciar o ESP32 automaticamente.
6. WHEN o ESP32 reinicia devido ao watchdog, THE Firmware SHALL publicar uma Log_Message indicando "Watchdog reset detected" após a reconexão MQTT.

---

### Requirement 10: Heartbeat Periódico

**User Story:** Como backend MQTT service, quero receber mensagens periódicas de heartbeat dos dispositivos, para que eu possa detectar dispositivos inativos mesmo quando a conexão MQTT está estabelecida.

#### Acceptance Criteria

1. THE Firmware SHALL enviar uma mensagem de heartbeat a cada 5 minutos (300.000 ms).
2. THE Firmware SHALL usar `millis()` para rastrear o tempo decorrido desde o último heartbeat de forma não-bloqueante.
3. WHEN 5 minutos se passam desde o último heartbeat, THE Firmware SHALL publicar a string "heartbeat" no tópico `andon/status/{mac}` com QoS 1.
4. WHEN um heartbeat é enviado, THE Firmware SHALL resetar o contador de tempo de heartbeat.
5. THE Firmware SHALL enviar heartbeats apenas quando no estado `OPERATIONAL`.
6. THE Firmware SHALL publicar uma Log_Message via Serial cada vez que um heartbeat é enviado.

---

### Requirement 11: Logging de Diagnóstico

**User Story:** Como engenheiro de firmware, quero que o dispositivo publique logs de diagnóstico via MQTT e Serial, para que eu possa depurar problemas remotamente sem acesso físico ao hardware.

#### Acceptance Criteria

1. THE Firmware SHALL publicar Log_Messages no tópico `andon/logs/{mac}` com QoS 1.
2. WHEN o firmware inicia, THE Firmware SHALL publicar uma Log_Message contendo "Firmware version: {version}, MAC: {mac}".
3. WHEN a conexão WiFi é estabelecida, THE Firmware SHALL publicar uma Log_Message contendo "WiFi connected, IP: {ip}".
4. WHEN a conexão MQTT é estabelecida, THE Firmware SHALL publicar uma Log_Message contendo "MQTT connected to broker".
5. WHEN um erro de conexão WiFi ou MQTT ocorre, THE Firmware SHALL publicar uma Log_Message descritiva do erro.
6. WHEN um comando de LED inválido é recebido, THE Firmware SHALL publicar uma Log_Message contendo "Invalid LED command received".
7. THE Firmware SHALL também enviar todas as Log_Messages para o Serial Monitor para depuração local.
8. THE Firmware SHALL incluir timestamp relativo (millis()) em cada Log_Message enviada via Serial.

---

### Requirement 12: Configuração PlatformIO

**User Story:** Como desenvolvedor de firmware, quero que o projeto PlatformIO esteja configurado corretamente com todas as dependências, para que o firmware compile e seja carregado no ESP32 sem erros.

#### Acceptance Criteria

1. THE Project SHALL conter um arquivo `platformio.ini` na raiz do diretório do firmware.
2. THE `platformio.ini` SHALL especificar `platform = espressif32`.
3. THE `platformio.ini` SHALL especificar `board = esp32dev`.
4. THE `platformio.ini` SHALL especificar `framework = arduino`.
5. THE `platformio.ini` SHALL especificar `monitor_speed = 115200` para o Serial Monitor.
6. THE `platformio.ini` SHALL especificar `upload_speed = 921600` para upload rápido.
7. THE `platformio.ini` SHALL incluir as dependências: `lib_deps = knolleary/PubSubClient@^2.8, bblanchon/ArduinoJson@^6.21.0`.
8. THE Project SHALL conter um arquivo `src/main.cpp` com as funções `setup()` e `loop()`.
9. THE Project SHALL conter um arquivo `include/config.h` com todas as constantes de configuração.
10. THE `include/config.h` SHALL definir `FIRMWARE_VERSION "1.0.0"`.
11. THE `include/config.h` SHALL definir as credenciais WiFi (SSID, PASSWORD).
12. THE `include/config.h` SHALL definir as configurações do MQTT_Broker (IP, PORT).
13. THE `include/config.h` SHALL definir todos os mapeamentos de GPIOs para botões e LEDs.
14. THE `include/config.h` SHALL definir todos os valores de timers (DEBOUNCE_MS, WIFI_TIMEOUT_MS, MQTT_TIMEOUT_MS, HEARTBEAT_INTERVAL_MS).
15. THE `include/config.h` SHALL definir `MQTT_MAX_PACKET_SIZE 512`.
16. THE `include/config.h` SHALL definir `HEAP_WARN_THRESHOLD 10240`.
17. THE Project SHALL conter um arquivo `README.md` com instruções de compilação, upload e monitoramento.

---

### Requirement 13: Tratamento de Erros e Resiliência

**User Story:** Como engenheiro de confiabilidade, quero que o firmware trate graciosamente todos os erros de rede e hardware, para que o dispositivo continue operacional mesmo em condições adversas.

#### Acceptance Criteria

1. WHEN uma operação de rede (WiFi ou MQTT) falha, THE Firmware SHALL registrar o erro via Serial e Log_Message.
2. WHEN uma operação de rede falha, THE Firmware SHALL implementar backoff exponencial com limite máximo de 60 segundos entre tentativas.
3. WHEN a memória heap disponível cai abaixo de 10KB, THE Firmware SHALL publicar uma Log_Message de aviso e liberar buffers não essenciais.
4. WHEN uma exceção ou panic ocorre, THE Firmware SHALL permitir que o Watchdog_Timer reinicie o dispositivo.
5. THE Firmware SHALL validar todos os payloads JSON recebidos antes de processar, descartando mensagens malformadas.
6. THE Firmware SHALL limitar o tamanho máximo de mensagens MQTT recebidas para 512 bytes para evitar buffer overflow.
7. IF o MQTT_Broker estiver inacessível por mais de 5 minutos, THEN THE Firmware SHALL reiniciar a conexão WiFi como tentativa de recuperação.
8. IF o MQTT_Broker estiver inacessível por mais de 5 minutos (10 tentativas consecutivas com backoff), THEN THE Firmware SHALL reiniciar o ESP32 usando `ESP.restart()`.

---

### Requirement 14: Indicadores Visuais de Estado

**User Story:** Como operador de chão de fábrica, quero que o LED onboard indique visualmente o estado de conectividade do dispositivo, para que eu possa diagnosticar problemas sem acesso ao Serial Monitor.

#### Acceptance Criteria

1. WHILE no estado `WIFI_CONNECTING`, THE Onboard_LED SHALL piscar a cada 500ms (padrão rápido).
2. WHILE no estado `MQTT_CONNECTING`, THE Onboard_LED SHALL piscar a cada 1000ms (padrão lento).
3. WHILE no estado `OPERATIONAL`, THE Onboard_LED SHALL permanecer aceso continuamente (não pisca).
4. WHEN a conexão WiFi ou MQTT é perdida, THE Onboard_LED SHALL retornar ao padrão de piscada correspondente ao estado de reconexão.
5. THE Firmware SHALL usar `millis()` para implementar os padrões de piscada de forma não-bloqueante.

---

### Requirement 15: Versionamento e Identificação de Firmware

**User Story:** Como engenheiro de manutenção, quero que cada dispositivo reporte sua versão de firmware, para que eu possa rastrear quais dispositivos precisam de atualização.

#### Acceptance Criteria

1. THE Firmware SHALL definir a constante `FIRMWARE_VERSION` no arquivo `include/config.h` no formato semântico (ex: "1.0.0").
2. WHEN o firmware inicia, THE Firmware SHALL publicar a versão via Serial e via Log_Message MQTT.
3. THE Discovery_Message SHALL incluir o campo `firmware_version` contendo a versão do firmware.
4. THE Firmware SHALL incluir a versão, autor e data no comentário de cabeçalho do arquivo `src/main.cpp`.
5. THE README.md SHALL documentar onde alterar a versão (`include/config.h`) antes de cada release.
6. THE README.md SHALL documentar o processo de atualização de versão antes de cada release.

---

### Requirement 16: Tratamento de Reconexão com Backoff Exponencial

**User Story:** Como engenheiro de confiabilidade, quero que o dispositivo implemente backoff exponencial nas tentativas de reconexão, para que não sobrecarregue a rede em caso de falhas prolongadas.

#### Acceptance Criteria

1. WHEN uma conexão WiFi ou MQTT falha, THE Firmware SHALL aguardar um intervalo inicial de 5 segundos antes de tentar novamente.
2. WHEN uma tentativa de reconexão falha, THE Firmware SHALL dobrar o intervalo de espera (5s → 10s → 20s → 40s).
3. THE Firmware SHALL limitar o intervalo máximo de backoff a 60 segundos.
4. WHEN a conexão é estabelecida com sucesso, THE Firmware SHALL resetar o contador de backoff para o valor inicial (5 segundos).
5. WHEN 10 tentativas consecutivas de conexão MQTT falham, THE Firmware SHALL reiniciar o ESP32 usando `ESP.restart()`.

---

### Requirement 17: Monitoramento de Memória Heap

**User Story:** Como engenheiro de firmware, quero que o dispositivo monitore a memória heap disponível, para que eu possa detectar vazamentos de memória antes que causem crashes.

#### Acceptance Criteria

1. THE Firmware SHALL verificar a memória heap disponível usando `ESP.getFreeHeap()` a cada 30 segundos.
2. WHEN a memória heap disponível cai abaixo de 10KB (10240 bytes), THE Firmware SHALL publicar uma Log_Message contendo "WARNING: low heap {N} bytes".
3. THE Firmware SHALL incluir a quantidade de heap livre em cada Log_Message de heartbeat.

