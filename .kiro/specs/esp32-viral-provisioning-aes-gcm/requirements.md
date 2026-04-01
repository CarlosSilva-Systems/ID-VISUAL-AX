# Requirements Document

## Introduction

Este documento especifica os requisitos para implementar um sistema de **Viral Provisioning Seguro** no firmware ESP32 Andon do ID Visual AX. O sistema permitirá que credenciais WiFi sejam distribuídas automaticamente entre múltiplos dispositivos ESP32 através de propagação em cascata usando o protocolo ESP-NOW com criptografia AES-GCM. Um "Paciente Zero" (device configurado manualmente) receberá credenciais WiFi e as transmitirá de forma criptografada para devices próximos, que por sua vez se tornarão transmissores temporários, criando uma onda de provisionamento que se propaga pela fábrica. Este sistema elimina a necessidade de programar individualmente cada device com credenciais hardcoded, reduzindo drasticamente o tempo de implantação em ambientes de produção com dezenas ou centenas de dispositivos.

## Glossary

- **Viral_Provisioning**: Sistema de distribuição automática de credenciais WiFi através de propagação em cascata entre dispositivos ESP32.
- **Patient_Zero**: Primeiro dispositivo ESP32 configurado manualmente que inicia a propagação de credenciais.
- **Provisioning_Receiver**: Dispositivo ESP32 não-configurado que recebe credenciais via ESP-NOW e se torna um novo transmissor.
- **ESP_NOW**: Protocolo de comunicação peer-to-peer de baixa latência do ESP32, operando na camada MAC sem necessidade de conexão WiFi.
- **AES_GCM**: Advanced Encryption Standard em modo Galois/Counter Mode - algoritmo de criptografia autenticada que fornece confidencialidade e integridade.
- **Provisioning_Payload**: Estrutura de dados contendo SSID, password, timestamp Unix e device_id antes da criptografia.
- **Encrypted_Payload**: Payload criptografado contendo IV (12 bytes) + Ciphertext + Auth_Tag (16 bytes).
- **Auth_Tag**: Tag de autenticação de 16 bytes gerada pelo AES-GCM para validar integridade e autenticidade da mensagem.
- **IV**: Initialization Vector - valor aleatório de 12 bytes usado para garantir que a mesma mensagem criptografada duas vezes produza ciphertexts diferentes.
- **Hardcoded_Key**: Chave secreta AES-256 (32 bytes) embutida no firmware, derivada da string "ChaveSecretaAndon2026".
- **Transmission_Window**: Janela de tempo de 10 minutos durante a qual um device transmite credenciais via ESP-NOW após ser configurado.
- **Timestamp_Validation**: Mecanismo de proteção contra replay attacks que valida se o timestamp do payload está dentro de ±5 minutos do RTC interno.
- **NVS**: Non-Volatile Storage - memória flash do ESP32 usada para persistir credenciais WiFi entre reinicializações.
- **Provisioning_LED_Pattern**: Padrão de piscar específico do LED onboard (3 piscadas rápidas a cada 2 segundos) indicando que o device está transmitindo credenciais.
- **Serial_Provisioning**: Método de configuração manual do Patient_Zero via comandos Serial Monitor.
- **BLE_Provisioning**: Método alternativo de configuração via Bluetooth Low Energy (opcional, fora do escopo inicial).
- **Web_Portal_Provisioning**: Método alternativo via Access Point WiFi e portal web (opcional, fora do escopo inicial).
- **Broadcast_MAC**: Endereço MAC de broadcast (FF:FF:FF:FF:FF:FF) usado para transmitir payloads ESP-NOW para todos os devices próximos.
- **Provisioning_State**: Estado do device no ciclo de provisionamento: `UNCONFIGURED`, `TRANSMITTING`, `OPERATIONAL`.
- **RTC**: Real-Time Clock - relógio interno do ESP32 sincronizado via NTP após conexão WiFi.

---

## Requirements

### Requirement 1: Estrutura de Dados do Provisioning Payload

**User Story:** Como desenvolvedor de firmware, quero uma estrutura de dados bem definida para o payload de provisionamento, para que as credenciais WiFi sejam transmitidas de forma consistente e validável.

#### Acceptance Criteria

1. THE Firmware SHALL definir uma estrutura `ProvisioningPayload` contendo os campos: `ssid` (string, máximo 32 bytes), `password` (string, máximo 64 bytes), `timestamp` (uint32_t Unix timestamp), `device_id` (string, máximo 20 bytes).
2. THE Firmware SHALL serializar o `ProvisioningPayload` em formato JSON antes da criptografia.
3. WHEN o payload JSON serializado exceder 200 bytes, THE Firmware SHALL retornar um erro de validação e abortar a transmissão.
4. THE Firmware SHALL incluir o `device_id` do transmissor no payload para rastreabilidade e auditoria.
5. THE Firmware SHALL incluir o timestamp Unix atual (obtido do RTC interno) no payload antes da criptografia.

---

### Requirement 2: Criptografia AES-GCM do Payload

**User Story:** Como engenheiro de segurança, quero que as credenciais WiFi sejam criptografadas com AES-GCM, para que sejam protegidas contra sniffing passivo e ataques de modificação.

#### Acceptance Criteria

1. THE Firmware SHALL usar a biblioteca `mbedtls` (incluída no ESP-IDF) para implementar criptografia AES-GCM.
2. THE Firmware SHALL derivar uma chave AES-256 (32 bytes) a partir da string "ChaveSecretaAndon2026" usando SHA-256.
3. WHEN criptografando um payload, THE Firmware SHALL gerar um IV aleatório de 12 bytes usando `esp_random()`.
4. THE Firmware SHALL criptografar o payload JSON usando AES-GCM com a chave hardcoded e o IV gerado.
5. THE Firmware SHALL gerar um Auth_Tag de 16 bytes durante a criptografia AES-GCM.
6. THE Firmware SHALL construir o Encrypted_Payload concatenando: `[IV (12 bytes)] + [Ciphertext] + [Auth_Tag (16 bytes)]`.
7. WHEN o Encrypted_Payload exceder 256 bytes, THE Firmware SHALL retornar um erro e abortar a transmissão.
8. THE Firmware SHALL armazenar a chave AES-256 derivada em memória RAM (não em NVS) para evitar extração trivial.

---

### Requirement 3: Descriptografia e Validação do Payload

**User Story:** Como desenvolvedor de firmware, quero que o receptor valide a integridade e autenticidade do payload recebido, para que apenas mensagens legítimas sejam aceitas.

#### Acceptance Criteria

1. WHEN um Encrypted_Payload é recebido via ESP-NOW, THE Firmware SHALL extrair o IV (primeiros 12 bytes), Ciphertext (bytes intermediários) e Auth_Tag (últimos 16 bytes).
2. THE Firmware SHALL descriptografar o Ciphertext usando AES-GCM com a chave hardcoded e o IV extraído.
3. THE Firmware SHALL validar o Auth_Tag durante a descriptografia usando `mbedtls_gcm_auth_decrypt()`.
4. IF o Auth_Tag for inválido, THEN THE Firmware SHALL descartar a mensagem, publicar uma Log_Message "PROVISIONING: Auth_Tag inválido - possível ataque" e NÃO processar o payload.
5. WHEN a descriptografia é bem-sucedida, THE Firmware SHALL desserializar o JSON resultante em uma estrutura `ProvisioningPayload`.
6. IF a desserialização JSON falhar, THEN THE Firmware SHALL descartar a mensagem e publicar uma Log_Message "PROVISIONING: JSON inválido após descriptografia".
7. THE Firmware SHALL validar que os campos `ssid`, `password`, `timestamp` e `device_id` estão presentes e não vazios.
8. IF qualquer campo obrigatório estiver ausente ou vazio, THEN THE Firmware SHALL descartar a mensagem e publicar uma Log_Message "PROVISIONING: Payload incompleto".

---

### Requirement 4: Proteção contra Replay Attacks via Timestamp

**User Story:** Como engenheiro de segurança, quero que mensagens antigas sejam rejeitadas automaticamente, para que atacantes não possam reutilizar payloads capturados anteriormente.

#### Acceptance Criteria

1. WHEN um payload descriptografado é validado, THE Firmware SHALL extrair o campo `timestamp` (Unix timestamp em segundos).
2. THE Firmware SHALL obter o timestamp atual do RTC interno usando `time(NULL)`.
3. THE Firmware SHALL calcular a diferença absoluta entre o timestamp do payload e o timestamp atual.
4. IF a diferença absoluta for maior que 300 segundos (5 minutos), THEN THE Firmware SHALL descartar a mensagem e publicar uma Log_Message "PROVISIONING: Timestamp fora da janela (±5min) - possível replay attack".
5. IF o RTC interno não estiver sincronizado (timestamp atual < 1000000000), THEN THE Firmware SHALL aceitar o payload SEM validação de timestamp e publicar uma Log_Message "PROVISIONING: RTC não sincronizado - timestamp não validado".
6. WHEN o payload passa na validação de timestamp, THE Firmware SHALL processar as credenciais WiFi normalmente.

---

### Requirement 5: Configuração Manual do Patient Zero via Serial

**User Story:** Como técnico de campo, quero configurar o primeiro device (Patient Zero) via Serial Monitor, para que eu possa iniciar a propagação de credenciais sem necessidade de reprogramar o firmware.

#### Acceptance Criteria

1. THE Firmware SHALL implementar um comando Serial `PROVISION <ssid> <password>` para configurar credenciais WiFi manualmente.
2. WHEN o comando `PROVISION` é recebido via Serial, THE Firmware SHALL validar que o SSID tem entre 1 e 32 caracteres e a senha tem entre 8 e 64 caracteres.
3. IF a validação falhar, THEN THE Firmware SHALL publicar uma Log_Message "PROVISIONING: SSID ou senha inválidos" e ignorar o comando.
4. WHEN a validação é bem-sucedida, THE Firmware SHALL salvar as credenciais na NVS usando as chaves `wifi_ssid` e `wifi_password`.
5. THE Firmware SHALL publicar uma Log_Message "PROVISIONING: Credenciais salvas - reiniciando em 3s".
6. THE Firmware SHALL aguardar 3 segundos e então chamar `ESP.restart()` para reiniciar o device.
7. WHEN o device reinicia com credenciais salvas na NVS, THE Firmware SHALL transitar para o estado `TRANSMITTING` e iniciar a transmissão via ESP-NOW.

---

### Requirement 6: Transmissão de Credenciais via ESP-NOW

**User Story:** Como desenvolvedor de firmware, quero que o device transmita credenciais criptografadas via ESP-NOW, para que devices próximos possam recebê-las sem necessidade de conexão WiFi prévia.

#### Acceptance Criteria

1. THE Firmware SHALL inicializar o protocolo ESP-NOW usando `esp_now_init()` durante o estado `BOOT`.
2. THE Firmware SHALL registrar um peer de broadcast com MAC address `FF:FF:FF:FF:FF:FF` usando `esp_now_add_peer()`.
3. WHEN o device entra no estado `TRANSMITTING`, THE Firmware SHALL iniciar um timer de 10 minutos (600.000 ms).
4. WHILE no estado `TRANSMITTING`, THE Firmware SHALL transmitir o Encrypted_Payload via ESP-NOW a cada 30 segundos usando `esp_now_send()`.
5. WHEN cada transmissão é enviada, THE Firmware SHALL publicar uma Log_Message "PROVISIONING: Broadcast enviado (tentativa X/20)".
6. WHEN o timer de 10 minutos expira, THE Firmware SHALL transitar para o estado `OPERATIONAL` e parar de transmitir credenciais.
7. THE Firmware SHALL publicar uma Log_Message "PROVISIONING: Janela de transmissão encerrada - entrando em modo operacional".
8. WHILE no estado `TRANSMITTING`, THE Firmware SHALL continuar processando eventos de botões e comandos MQTT normalmente (operação dual).

---

### Requirement 7: Recepção e Processamento de Credenciais

**User Story:** Como desenvolvedor de firmware, quero que devices não-configurados recebam e processem credenciais via ESP-NOW, para que se conectem automaticamente ao WiFi e se tornem novos transmissores.

#### Acceptance Criteria

1. THE Firmware SHALL registrar um callback ESP-NOW usando `esp_now_register_recv_cb()` para processar mensagens recebidas.
2. WHEN uma mensagem ESP-NOW é recebida, THE Firmware SHALL verificar se o device está no estado `UNCONFIGURED` (sem credenciais salvas na NVS).
3. IF o device já possui credenciais na NVS, THEN THE Firmware SHALL descartar a mensagem silenciosamente (sem log).
4. WHEN o device está no estado `UNCONFIGURED`, THE Firmware SHALL descriptografar e validar o payload conforme Requirement 3 e 4.
5. WHEN o payload é válido, THE Firmware SHALL salvar as credenciais na NVS usando as chaves `wifi_ssid` e `wifi_password`.
6. THE Firmware SHALL publicar uma Log_Message "PROVISIONING: Credenciais recebidas de device_id=<id> - conectando ao WiFi".
7. THE Firmware SHALL tentar conectar ao WiFi usando as credenciais recebidas.
8. WHEN a conexão WiFi é estabelecida com sucesso, THE Firmware SHALL transitar para o estado `TRANSMITTING` e iniciar a transmissão via ESP-NOW por 10 minutos.
9. IF a conexão WiFi falhar após 30 segundos, THEN THE Firmware SHALL publicar uma Log_Message "PROVISIONING: Falha ao conectar - credenciais inválidas?" e retornar ao estado `UNCONFIGURED`.

---

### Requirement 8: Indicador Visual de Provisionamento (LED Onboard)

**User Story:** Como técnico de campo, quero identificar visualmente quais devices estão transmitindo credenciais, para que eu possa auditar o progresso da propagação em tempo real.

#### Acceptance Criteria

1. WHILE no estado `TRANSMITTING`, THE Firmware SHALL piscar o LED onboard (GPIO 2) com o padrão: 3 piscadas rápidas (100ms ON, 100ms OFF) seguidas de 1,4s OFF (ciclo total de 2s).
2. WHILE no estado `UNCONFIGURED`, THE Firmware SHALL piscar o LED onboard lentamente (1s ON, 1s OFF) para indicar que está aguardando credenciais.
3. WHILE no estado `OPERATIONAL`, THE Firmware SHALL manter o LED onboard aceso continuamente (conforme comportamento atual do firmware).
4. THE Firmware SHALL implementar o controle do LED usando `millis()` para temporização não-bloqueante.
5. THE Firmware SHALL NÃO usar `delay()` para controlar o LED, garantindo que o loop principal continue responsivo.

---

### Requirement 9: Persistência de Credenciais na NVS

**User Story:** Como desenvolvedor de firmware, quero que as credenciais WiFi sejam persistidas na NVS, para que o device mantenha a configuração após reinicializações e quedas de energia.

#### Acceptance Criteria

1. THE Firmware SHALL usar a biblioteca `Preferences.h` (wrapper do NVS) para armazenar credenciais WiFi.
2. THE Firmware SHALL criar um namespace NVS chamado `provisioning` para armazenar as credenciais.
3. WHEN credenciais são salvas, THE Firmware SHALL usar as chaves `wifi_ssid` (string) e `wifi_password` (string) no namespace `provisioning`.
4. WHEN o firmware inicia (função `setup()`), THE Firmware SHALL verificar se existem credenciais salvas na NVS.
5. IF credenciais existem na NVS, THEN THE Firmware SHALL carregá-las e usá-las para conexão WiFi (sobrescrevendo as credenciais hardcoded de `config.h`).
6. IF credenciais NÃO existem na NVS, THEN THE Firmware SHALL usar as credenciais hardcoded de `config.h` como fallback.
7. THE Firmware SHALL publicar uma Log_Message "PROVISIONING: Credenciais carregadas da NVS" ou "PROVISIONING: Usando credenciais hardcoded (fallback)".

---

### Requirement 10: Sincronização de RTC via NTP

**User Story:** Como engenheiro de segurança, quero que o RTC interno seja sincronizado via NTP após conexão WiFi, para que a validação de timestamp funcione corretamente.

#### Acceptance Criteria

1. WHEN a conexão WiFi é estabelecida com sucesso, THE Firmware SHALL iniciar a sincronização NTP usando `configTime()`.
2. THE Firmware SHALL configurar o servidor NTP como `pool.ntp.org` com timezone `UTC-3` (horário de Brasília).
3. THE Firmware SHALL aguardar até 10 segundos pela sincronização NTP usando `time(NULL)` em loop não-bloqueante.
4. WHEN a sincronização NTP é bem-sucedida (timestamp > 1000000000), THE Firmware SHALL publicar uma Log_Message "PROVISIONING: RTC sincronizado via NTP - timestamp=<valor>".
5. IF a sincronização NTP falhar após 10 segundos, THEN THE Firmware SHALL publicar uma Log_Message "PROVISIONING: Falha ao sincronizar NTP - validação de timestamp desabilitada" e continuar operação normal.
6. THE Firmware SHALL armazenar um flag booleano `rtc_synced` em memória RAM indicando se o RTC foi sincronizado com sucesso.

---

### Requirement 11: Comando Serial para Reset de Credenciais

**User Story:** Como técnico de campo, quero resetar as credenciais salvas na NVS via Serial Monitor, para que eu possa reconfigurar um device sem necessidade de reflash do firmware.

#### Acceptance Criteria

1. THE Firmware SHALL implementar um comando Serial `RESET_PROVISION` para apagar credenciais da NVS.
2. WHEN o comando `RESET_PROVISION` é recebido via Serial, THE Firmware SHALL apagar as chaves `wifi_ssid` e `wifi_password` do namespace `provisioning` usando `Preferences.clear()`.
3. THE Firmware SHALL publicar uma Log_Message "PROVISIONING: Credenciais apagadas da NVS - reiniciando em 3s".
4. THE Firmware SHALL aguardar 3 segundos e então chamar `ESP.restart()` para reiniciar o device.
5. WHEN o device reinicia sem credenciais na NVS, THE Firmware SHALL transitar para o estado `UNCONFIGURED` e aguardar recepção de credenciais via ESP-NOW.

---

### Requirement 12: Integração com Máquina de Estados Existente

**User Story:** Como desenvolvedor de firmware, quero que o sistema de Viral Provisioning se integre à máquina de estados existente do firmware Andon, para que não haja conflitos com a lógica de WiFi/MQTT/MESH atual.

#### Acceptance Criteria

1. THE Firmware SHALL adicionar três novos estados à State_Machine: `UNCONFIGURED`, `TRANSMITTING`, `OPERATIONAL` (renomeando o estado atual `OPERATIONAL` se necessário).
2. WHEN o firmware inicia sem credenciais na NVS, THE State_Machine SHALL começar no estado `UNCONFIGURED` (ao invés de `BOOT`).
3. WHEN o firmware inicia com credenciais na NVS, THE State_Machine SHALL seguir o fluxo normal: `BOOT` → `WIFI_CONNECTING` → `MQTT_CONNECTING` → `OPERATIONAL`.
4. WHEN credenciais são recebidas via ESP-NOW no estado `UNCONFIGURED`, THE State_Machine SHALL transitar para `WIFI_CONNECTING`.
5. WHEN a conexão WiFi é estabelecida após receber credenciais, THE State_Machine SHALL transitar para `TRANSMITTING` (ao invés de `MQTT_CONNECTING`).
6. WHEN o timer de 10 minutos expira no estado `TRANSMITTING`, THE State_Machine SHALL transitar para `MQTT_CONNECTING` e seguir o fluxo normal.
7. THE Firmware SHALL manter compatibilidade total com o comportamento atual de botões, LEDs e MQTT durante todos os estados.

---

### Requirement 13: Logs de Auditoria e Diagnóstico

**User Story:** Como engenheiro de suporte, quero logs detalhados de todas as operações de provisionamento, para que eu possa diagnosticar problemas de propagação e segurança.

#### Acceptance Criteria

1. THE Firmware SHALL publicar uma Log_Message via Serial e MQTT (se conectado) para cada evento de provisionamento.
2. WHEN credenciais são configuradas manualmente via Serial, THE Firmware SHALL publicar "PROVISIONING: Configuração manual - SSID=<ssid>".
3. WHEN um payload criptografado é transmitido via ESP-NOW, THE Firmware SHALL publicar "PROVISIONING: Broadcast enviado - tentativa X/20".
4. WHEN um payload é recebido via ESP-NOW, THE Firmware SHALL publicar "PROVISIONING: Payload recebido de MAC=<mac>".
5. WHEN a validação de Auth_Tag falha, THE Firmware SHALL publicar "PROVISIONING: Auth_Tag inválido - possível ataque de MAC=<mac>".
6. WHEN a validação de timestamp falha, THE Firmware SHALL publicar "PROVISIONING: Timestamp fora da janela - possível replay attack de MAC=<mac>".
7. WHEN o device entra no estado `TRANSMITTING`, THE Firmware SHALL publicar "PROVISIONING: Iniciando transmissão por 10 minutos".
8. WHEN o device entra no estado `OPERATIONAL` após transmissão, THE Firmware SHALL publicar "PROVISIONING: Janela encerrada - modo operacional".

---

### Requirement 14: Tratamento de Erros e Resiliência

**User Story:** Como desenvolvedor de firmware, quero que o sistema de provisionamento seja resiliente a falhas de rede e erros de criptografia, para que o device não trave ou entre em estado inconsistente.

#### Acceptance Criteria

1. WHEN uma operação de criptografia AES-GCM falha, THE Firmware SHALL publicar uma Log_Message "PROVISIONING: Erro de criptografia - código=<erro>" e abortar a transmissão.
2. WHEN uma operação de descriptografia AES-GCM falha, THE Firmware SHALL descartar a mensagem silenciosamente e continuar escutando.
3. WHEN a inicialização do ESP-NOW falha (`esp_now_init()` retorna erro), THE Firmware SHALL publicar uma Log_Message "PROVISIONING: Falha ao inicializar ESP-NOW - código=<erro>" e desabilitar o sistema de provisionamento.
4. WHEN a transmissão ESP-NOW falha (`esp_now_send()` retorna erro), THE Firmware SHALL publicar uma Log_Message "PROVISIONING: Falha ao enviar broadcast - tentativa X/20" e tentar novamente no próximo ciclo de 30s.
5. WHEN o device está no estado `TRANSMITTING` e perde a conexão WiFi, THE Firmware SHALL continuar transmitindo via ESP-NOW até o timer de 10 minutos expirar.
6. THE Firmware SHALL garantir que o Watchdog_Timer seja resetado durante operações de criptografia/descriptografia para evitar resets indesejados.

---

### Requirement 15: Compatibilidade com ESP-MESH Existente

**User Story:** Como arquiteto de sistemas, quero que o Viral Provisioning coexista com o sistema ESP-MESH atual, para que ambos os protocolos funcionem simultaneamente sem interferência.

#### Acceptance Criteria

1. THE Firmware SHALL inicializar o ESP-NOW ANTES de inicializar o ESP-MESH para evitar conflitos de canal WiFi.
2. THE Firmware SHALL configurar o ESP-NOW para usar o mesmo canal WiFi que o ESP-MESH (canal 6, definido em `MESH_CHANNEL`).
3. WHEN o device está no estado `TRANSMITTING`, THE Firmware SHALL manter a conexão ESP-MESH ativa e continuar roteando mensagens normalmente.
4. THE Firmware SHALL garantir que callbacks ESP-NOW e ESP-MESH sejam processados sem bloqueio mútuo.
5. WHEN o device transita para o estado `OPERATIONAL`, THE Firmware SHALL manter o ESP-NOW inicializado mas parar de transmitir broadcasts (apenas escutar).
6. THE Firmware SHALL publicar uma Log_Message "PROVISIONING: ESP-NOW e ESP-MESH coexistindo no canal <canal>".

---

## Parser and Serializer Requirements

### Requirement 16: Serialização e Desserialização JSON do Payload

**User Story:** Como desenvolvedor de firmware, quero serializar e desserializar o payload de provisionamento em JSON, para que a estrutura de dados seja legível e extensível.

#### Acceptance Criteria

1. THE Firmware SHALL usar a biblioteca `ArduinoJson` (versão 6.x ou superior) para serialização e desserialização JSON.
2. WHEN serializando um `ProvisioningPayload`, THE Firmware SHALL criar um documento JSON com os campos: `ssid`, `password`, `timestamp`, `device_id`.
3. THE Firmware SHALL validar que o JSON serializado não excede 200 bytes antes da criptografia.
4. WHEN desserializando um JSON descriptografado, THE Firmware SHALL usar `deserializeJson()` e verificar se o retorno é `DeserializationError::Ok`.
5. IF a desserialização falhar, THEN THE Firmware SHALL descartar a mensagem e publicar uma Log_Message "PROVISIONING: JSON inválido".
6. THE Pretty_Printer SHALL formatar o `ProvisioningPayload` de volta para JSON válido para logs de auditoria.
7. FOR ALL valid `ProvisioningPayload` objects, serializar → desserializar → serializar SHALL produzir JSON equivalente (round-trip property).

---

## Security Requirements Summary

Este sistema implementa múltiplas camadas de segurança:

1. **Confidencialidade**: AES-GCM com chave de 256 bits protege credenciais contra sniffing passivo
2. **Integridade**: Auth Tag de 16 bytes garante que mensagens não foram modificadas
3. **Autenticidade**: Auth Tag também valida que a mensagem foi criada por quem possui a chave
4. **Proteção contra Replay**: Validação de timestamp com janela de ±5 minutos
5. **Janela de Ataque Limitada**: Transmissão por apenas 10 minutos reduz superfície de ataque
6. **Auditoria**: Logs detalhados de todas as operações de provisionamento

**Riscos Residuais Aceitáveis:**
- Extração de firmware por atacante com acesso físico → Mitigado por controle de acesso ao chão de fábrica
- Comprometimento de todos os devices simultaneamente → Improvável e fora do escopo
- Ataque de negação de serviço (DoS) via flooding ESP-NOW → Não é o foco deste sistema
