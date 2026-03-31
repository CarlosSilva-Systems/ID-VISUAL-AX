/**
 * Firmware ESP32 Andon - Sistema ID Visual AX
 * Versão: 1.0.0
 * Autor: Sistema ID Visual AX
 * Data: 2026-03-31
 * 
 * Descrição: Firmware para dispositivo ESP32 que atua como interface física
 * do sistema Andon, capturando eventos de botões e controlando LEDs de status
 * através de comunicação MQTT bidirecional com o backend FastAPI.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <esp_system.h>
#include "config.h"

// ═══════════════════════════════════════════════════════════
// ESTRUTURAS DE DADOS
// ═══════════════════════════════════════════════════════════

// Estados da máquina de estados
enum SystemState {
    BOOT,
    WIFI_CONNECTING,
    MQTT_CONNECTING,
    OPERATIONAL
};

// Estado de um botão com debounce e cooldown
struct ButtonState {
    uint8_t pin;
    bool lastState;
    bool currentState;
    unsigned long lastDebounceTime;
    bool pressed;
    unsigned long lastPressTime;  // Para cooldown
    unsigned long cooldownMs;     // Tempo de cooldown específico
};

// Estado de um LED
struct LEDState {
    uint8_t pin;
    bool state;
};

// Timer não-bloqueante
struct Timer {
    unsigned long interval;
    unsigned long lastTrigger;
};

// Estado de reconexão com backoff exponencial
struct ReconnectionState {
    uint8_t attemptCount;
    unsigned long backoffDelay;
    unsigned long lastAttempt;
};

// ═══════════════════════════════════════════════════════════
// VARIÁVEIS GLOBAIS
// ═══════════════════════════════════════════════════════════

// Estado do sistema
SystemState currentState = BOOT;
String macAddress;
String deviceName;

// Estado atual do Andon (sincronizado com backend)
String currentAndonColor = "GREEN";  // GREEN, YELLOW, RED
bool andonStateKnown = false;

// Botões (com cooldown específico)
ButtonState greenButton = {BTN_VERDE, HIGH, HIGH, 0, false, 0, BTN_GREEN_COOLDOWN_MS};
ButtonState yellowButton = {BTN_AMARELO, HIGH, HIGH, 0, false, 0, BTN_YELLOW_COOLDOWN_MS};
ButtonState redButton = {BTN_VERMELHO, HIGH, HIGH, 0, false, 0, BTN_RED_COOLDOWN_MS};

// LEDs
LEDState redLED = {LED_VERMELHO_PIN, LOW};
LEDState yellowLED = {LED_AMARELO_PIN, LOW};
LEDState greenLED = {LED_VERDE_PIN, LOW};
LEDState onboardLED = {LED_ONBOARD_PIN, LOW};

// Timers
Timer heartbeatTimer = {HEARTBEAT_INTERVAL_MS, 0};
Timer heapMonitorTimer = {HEAP_MONITOR_INTERVAL_MS, 0};
Timer ledBlinkTimer = {WIFI_BLINK_MS, 0};

// Reconexão
ReconnectionState wifiReconnect = {0, INITIAL_BACKOFF_MS, 0};
ReconnectionState mqttReconnect = {0, INITIAL_BACKOFF_MS, 0};

// Clientes WiFi e MQTT
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// ═══════════════════════════════════════════════════════════
// DECLARAÇÕES DE FUNÇÕES
// ═══════════════════════════════════════════════════════════

void logSerial(const String& message);
void updateBackoff(ReconnectionState* state);
void resetBackoff(ReconnectionState* state);
void handleWiFiConnecting();
void updateOnboardLED();
void handleMQTTConnecting();
void mqttCallback(char* topic, byte* payload, unsigned int length);
String createDiscoveryMessage();
void logMQTT(const String& message);
void processButton(ButtonState* btn);
void publishButtonEvent(const String& color);
bool processLEDCommand(const String& payload);
void updateLEDState(LEDState* led, bool state);
bool checkTimer(Timer* timer);
void handleOperational();
void initializeGPIOs();
void initializeWatchdog();
void obtainMACAddress();

/**
 * Atualiza o backoff exponencial após falha
 */
void updateBackoff(ReconnectionState* state) {
    state->attemptCount++;
    state->backoffDelay = min(state->backoffDelay * 2, (unsigned long)MAX_BACKOFF_MS);
}

/**
 * Reseta o backoff após sucesso
 */
void resetBackoff(ReconnectionState* state) {
    state->attemptCount = 0;
    state->backoffDelay = INITIAL_BACKOFF_MS;
}

/**
 * Atualiza o LED onboard baseado no estado atual
 */
void updateOnboardLED() {
    unsigned long now = millis();
    
    if (currentState == WIFI_CONNECTING) {
        // Piscar a cada 500ms
        if (now - ledBlinkTimer.lastTrigger >= WIFI_BLINK_MS) {
            onboardLED.state = !onboardLED.state;
            digitalWrite(LED_ONBOARD_PIN, onboardLED.state ? HIGH : LOW);
            ledBlinkTimer.lastTrigger = now;
        }
    } else if (currentState == MQTT_CONNECTING) {
        // Piscar a cada 1000ms
        if (now - ledBlinkTimer.lastTrigger >= MQTT_BLINK_MS) {
            onboardLED.state = !onboardLED.state;
            digitalWrite(LED_ONBOARD_PIN, onboardLED.state ? HIGH : LOW);
            ledBlinkTimer.lastTrigger = now;
        }
    } else if (currentState == OPERATIONAL) {
        // Aceso continuamente
        if (!onboardLED.state) {
            onboardLED.state = true;
            digitalWrite(LED_ONBOARD_PIN, HIGH);
        }
    }
}

/**
 * Gerencia a conexão WiFi com backoff exponencial
 */
void handleWiFiConnecting() {
    unsigned long now = millis();
    
    // Verificar se já está conectado
    if (WiFi.status() == WL_CONNECTED) {
        String ip = WiFi.localIP().toString();
        logSerial("WIFI: Conectado! IP: " + ip);
        
        // Transitar para MQTT_CONNECTING
        currentState = MQTT_CONNECTING;
        resetBackoff(&wifiReconnect);
        logSerial("WIFI: Transição para MQTT_CONNECTING");
        return;
    }
    
    // Verificar se é hora de tentar reconectar
    if (now - wifiReconnect.lastAttempt < wifiReconnect.backoffDelay) {
        return; // Ainda no período de backoff
    }
    
    // Tentar conectar
    if (wifiReconnect.attemptCount == 0) {
        logSerial("WIFI: Conectando a " + String(WIFI_SSID) + "...");
        WiFi.mode(WIFI_STA);
        WiFi.setTxPower(WIFI_POWER_19_5dBm);  // Máxima potência de transmissão
        WiFi.setSleep(false);  // Desabilitar power save para estabilidade
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    
    wifiReconnect.lastAttempt = now;
    
    // Verificar timeout de 30s
    if (wifiReconnect.attemptCount > 0 && (now - wifiReconnect.lastAttempt) >= WIFI_TIMEOUT_MS) {
        logSerial("WIFI: Timeout após 30s, tentando novamente em " + String(wifiReconnect.backoffDelay / 1000) + "s");
        updateBackoff(&wifiReconnect);
        WiFi.disconnect();
    }
}

/**
 * Cria mensagem JSON de discovery
 */
String createDiscoveryMessage() {
    StaticJsonDocument<256> doc;
    doc["mac_address"] = macAddress;
    doc["device_name"] = deviceName;
    doc["firmware_version"] = FIRMWARE_VERSION;
    
    String output;
    size_t size = serializeJson(doc, output);
    
    if (size == 0) {
        logSerial("ERRO: Falha ao serializar Discovery Message");
        return "";
    }
    
    return output;
}

/**
 * Publica mensagem de log via MQTT (se conectado)
 */
void logMQTT(const String& message) {
    logSerial(message); // Sempre logar no Serial
    
    if (mqttClient.connected()) {
        String topic = "andon/logs/" + macAddress;
        if (!mqttClient.publish(topic.c_str(), message.c_str(), false)) {
            Serial.println("[ERRO] Falha ao publicar log MQTT");
        }
    }
}

/**
 * Callback MQTT para mensagens recebidas
 */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    // Converter payload para String
    String payloadStr;
    for (unsigned int i = 0; i < length; i++) {
        payloadStr += (char)payload[i];
    }
    
    logSerial("MQTT: Mensagem recebida no tópico: " + String(topic));
    
    // Verificar se é comando de LED
    String ledTopic = "andon/led/" + macAddress + "/command";
    if (String(topic) == ledTopic && currentState == OPERATIONAL) {
        processLEDCommand(payloadStr);
        return;
    }
    
    // Verificar se é atualização de estado do Andon
    String stateTopic = "andon/state/" + macAddress;
    if (String(topic) == stateTopic && currentState == OPERATIONAL) {
        // Payload esperado: "GREEN", "YELLOW", ou "RED"
        payloadStr.trim();
        payloadStr.toUpperCase();
        
        if (payloadStr == "GREEN" || payloadStr == "YELLOW" || payloadStr == "RED") {
            currentAndonColor = payloadStr;
            andonStateKnown = true;
            logSerial("ANDON STATE: Atualizado para " + currentAndonColor);
        } else {
            logSerial("ERRO: Estado Andon inválido recebido: " + payloadStr);
        }
    }
}

/**
 * Gerencia a conexão MQTT com backoff exponencial
 */
void handleMQTTConnecting() {
    unsigned long now = millis();
    
    // Verificar se WiFi ainda está conectado
    if (WiFi.status() != WL_CONNECTED) {
        logSerial("MQTT: WiFi perdido, retornando para WIFI_CONNECTING");
        currentState = WIFI_CONNECTING;
        return;
    }
    
    // Verificar se já está conectado
    if (mqttClient.connected()) {
        logSerial("MQTT: Conectado ao broker!");
        
        // Publicar status online
        String statusTopic = "andon/status/" + macAddress;
        if (mqttClient.publish(statusTopic.c_str(), "online", true)) {
            logSerial("MQTT: Status 'online' publicado");
        }
        
        // Publicar discovery message
        String discoveryMsg = createDiscoveryMessage();
        if (!discoveryMsg.isEmpty()) {
            if (mqttClient.publish("andon/discovery", discoveryMsg.c_str(), false)) {
                logSerial("MQTT: Discovery publicado: " + discoveryMsg);
            }
        }
        
        // Subscrever ao tópico de comandos LED
        String ledTopic = "andon/led/" + macAddress + "/command";
        if (mqttClient.subscribe(ledTopic.c_str(), 1)) {
            logSerial("MQTT: Subscrito em " + ledTopic);
        }
        
        // Subscrever ao tópico de estado do Andon
        String stateTopic = "andon/state/" + macAddress;
        if (mqttClient.subscribe(stateTopic.c_str(), 1)) {
            logSerial("MQTT: Subscrito em " + stateTopic);
        }
        
        // Solicitar estado atual do Andon
        String requestTopic = "andon/state/request/" + macAddress;
        if (mqttClient.publish(requestTopic.c_str(), "REQUEST", false)) {
            logSerial("MQTT: Solicitação de estado enviada");
        }
        
        // Transitar para OPERATIONAL
        currentState = OPERATIONAL;
        resetBackoff(&mqttReconnect);
        logSerial("MQTT: Transição para OPERATIONAL");
        return;
    }
    
    // Verificar se é hora de tentar reconectar
    if (now - mqttReconnect.lastAttempt < mqttReconnect.backoffDelay) {
        return; // Ainda no período de backoff
    }
    
    // Verificar limite de tentativas
    if (mqttReconnect.attemptCount >= MQTT_MAX_RETRIES) {
        logSerial("MQTT: 10 tentativas falhadas, reiniciando ESP32...");
        delay(1000);
        ESP.restart();
    }
    
    // Tentar conectar
    if (mqttReconnect.attemptCount == 0) {
        logSerial("MQTT: Conectando ao broker " + String(MQTT_BROKER) + ":" + String(MQTT_PORT) + "...");
    }
    
    // Configurar LWT
    String lwtTopic = "andon/status/" + macAddress;
    String clientId = deviceName;
    
    bool connected = mqttClient.connect(
        clientId.c_str(),
        lwtTopic.c_str(),
        1,              // QoS
        true,           // retain
        "offline"       // LWT message
    );
    
    mqttReconnect.lastAttempt = now;
    
    if (!connected) {
        int rc = mqttClient.state();
        logSerial("MQTT: Falha na conexão, rc=" + String(rc) + ", tentando novamente em " + String(mqttReconnect.backoffDelay / 1000) + "s");
        updateBackoff(&mqttReconnect);
    }
}

/**
 * Processa um botão com debounce não-bloqueante e cooldown
 */
void processButton(ButtonState* btn) {
    unsigned long now = millis();
    bool reading = digitalRead(btn->pin);
    
    // Detectar transição
    if (reading != btn->lastState) {
        btn->lastDebounceTime = now;
        logSerial("BUTTON DEBUG: GPIO " + String(btn->pin) + " transição detectada: " + String(btn->lastState) + " → " + String(reading));
    }
    
    // Verificar se passou o tempo de debounce
    if ((now - btn->lastDebounceTime) > DEBOUNCE_MS) {
        // Se o estado mudou após o debounce
        if (reading != btn->currentState) {
            btn->currentState = reading;
            logSerial("BUTTON DEBUG: GPIO " + String(btn->pin) + " estado confirmado após debounce: " + String(btn->currentState));
            
            // Detectar pressionamento (HIGH → LOW)
            if (btn->currentState == LOW) {
                // Verificar cooldown
                if (now - btn->lastPressTime >= btn->cooldownMs) {
                    btn->pressed = true;
                    btn->lastPressTime = now;
                    logSerial("BUTTON DEBUG: GPIO " + String(btn->pin) + " PRESSIONADO!");
                } else {
                    unsigned long remainingCooldown = (btn->cooldownMs - (now - btn->lastPressTime)) / 1000;
                    logSerial("BUTTON DEBUG: GPIO " + String(btn->pin) + " em cooldown, aguarde " + String(remainingCooldown) + "s");
                }
            }
        }
    }
    
    btn->lastState = reading;
}

/**
 * Publica evento de botão via MQTT com validação de estado
 */
void publishButtonEvent(const String& color) {
    // Validar ação baseada no estado atual do Andon
    bool actionValid = false;
    String reason = "";
    
    if (color == "green") {
        // Botão verde só funciona se houver chamado ativo (YELLOW ou RED)
        if (currentAndonColor == "YELLOW" || currentAndonColor == "RED") {
            actionValid = true;
        } else {
            reason = "Mesa já está verde (sem chamados ativos)";
        }
    } else if (color == "yellow") {
        // Botão amarelo só funciona se não houver chamado vermelho ativo
        if (currentAndonColor != "RED") {
            actionValid = true;
        } else {
            reason = "Não pode criar chamado amarelo enquanto há chamado vermelho ativo";
        }
    } else if (color == "red") {
        // Botão vermelho sempre pode ser acionado (emergência)
        actionValid = true;
    }
    
    // Se não conhecemos o estado ainda, permitir ação mas avisar
    if (!andonStateKnown) {
        logSerial("AVISO: Estado do Andon desconhecido, permitindo ação de " + color);
        actionValid = true;
    }
    
    if (!actionValid) {
        logSerial("BUTTON: " + color + " BLOQUEADO - " + reason);
        return;
    }
    
    // Publicar evento
    String topic = "andon/button/" + macAddress + "/" + color;
    
    if (mqttClient.publish(topic.c_str(), "PRESSED", false)) {
        logSerial("BUTTON: " + color + " pressionado → publicado " + topic);
        
        // Atualizar estado local previsto (será confirmado pelo backend)
        if (color == "green") {
            currentAndonColor = "GREEN";
        } else if (color == "yellow") {
            currentAndonColor = "YELLOW";
        } else if (color == "red") {
            currentAndonColor = "RED";
        }
    } else {
        logSerial("ERRO: Falha ao publicar evento de botão " + color);
    }
}

/**
 * Atualiza o estado de um LED
 */
void updateLEDState(LEDState* led, bool state) {
    led->state = state;
    digitalWrite(led->pin, state ? HIGH : LOW);
}

/**
 * Processa comando de LED recebido via MQTT
 */
bool processLEDCommand(const String& payload) {
    StaticJsonDocument<128> doc;
    DeserializationError error = deserializeJson(doc, payload);
    
    if (error) {
        logMQTT("ERRO: JSON inválido no comando LED: " + String(error.c_str()));
        return false;
    }
    
    // Validar campos
    if (!doc.containsKey("red") || !doc.containsKey("yellow") || !doc.containsKey("green")) {
        logMQTT("ERRO: Comando LED sem campos obrigatórios");
        return false;
    }
    
    // Atualizar LEDs
    bool red = doc["red"];
    bool yellow = doc["yellow"];
    bool green = doc["green"];
    
    updateLEDState(&redLED, red);
    updateLEDState(&yellowLED, yellow);
    updateLEDState(&greenLED, green);
    
    logSerial("LED: Comando aplicado - red=" + String(red) + " yellow=" + String(yellow) + " green=" + String(green));
    return true;
}

/**
 * Verifica se um timer expirou
 */
bool checkTimer(Timer* timer) {
    unsigned long now = millis();
    if (now - timer->lastTrigger >= timer->interval) {
        timer->lastTrigger = now;
        return true;
    }
    return false;
}

/**
 * Gerencia o estado OPERATIONAL
 */
void handleOperational() {
    static unsigned long lastStateLog = 0;
    unsigned long now = millis();
    
    // Log periódico do estado (a cada 10 segundos)
    if (now - lastStateLog >= 10000) {
        logSerial("OPERATIONAL: Sistema ativo, aguardando eventos de botões...");
        logSerial("OPERATIONAL: Botões - Verde(GPIO" + String(BTN_VERDE) + ") Amarelo(GPIO" + String(BTN_AMARELO) + ") Vermelho(GPIO" + String(BTN_VERMELHO) + ")");
        lastStateLog = now;
    }
    
    // Verificar conexões
    if (WiFi.status() != WL_CONNECTED) {
        logSerial("OPERATIONAL: WiFi perdido, retornando para WIFI_CONNECTING");
        currentState = WIFI_CONNECTING;
        return;
    }
    
    if (!mqttClient.connected()) {
        logSerial("OPERATIONAL: MQTT perdido, retornando para MQTT_CONNECTING");
        currentState = MQTT_CONNECTING;
        return;
    }
    
    // Processar botões
    processButton(&greenButton);
    processButton(&yellowButton);
    processButton(&redButton);
    
    // Verificar e publicar eventos de botões
    if (greenButton.pressed) {
        publishButtonEvent("green");
        greenButton.pressed = false;
    }
    if (yellowButton.pressed) {
        publishButtonEvent("yellow");
        yellowButton.pressed = false;
    }
    if (redButton.pressed) {
        publishButtonEvent("red");
        redButton.pressed = false;
    }
    
    // Heartbeat a cada 5 minutos
    if (checkTimer(&heartbeatTimer)) {
        uint32_t freeHeap = ESP.getFreeHeap();
        String statusTopic = "andon/status/" + macAddress;
        mqttClient.publish(statusTopic.c_str(), "heartbeat", false);
        logSerial("HEARTBEAT: operacional, heap livre: " + String(freeHeap) + " bytes");
    }
    
    // Monitoramento de heap e WiFi a cada 30s
    if (checkTimer(&heapMonitorTimer)) {
        uint32_t freeHeap = ESP.getFreeHeap();
        if (freeHeap < HEAP_WARN_THRESHOLD) {
            logMQTT("AVISO: Heap baixo - " + String(freeHeap) + " bytes");
        }
        
        // Monitorar força do sinal WiFi
        int32_t rssi = WiFi.RSSI();
        if (rssi < -80) {
            logMQTT("AVISO: Sinal WiFi fraco - RSSI: " + String(rssi) + " dBm");
        }
    }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════

/**
 * Publica mensagem de log no Serial Monitor com timestamp
 */
void logSerial(const String& message) {
    unsigned long timestamp = millis();
    Serial.print("[");
    Serial.print(timestamp);
    Serial.print("] ");
    Serial.println(message);
}

/**
 * Inicializa todos os GPIOs (botões e LEDs)
 */
void initializeGPIOs() {
    // Configurar botões com pull-up interno
    pinMode(BTN_VERDE, INPUT_PULLUP);    // GPIO 12
    pinMode(BTN_AMARELO, INPUT_PULLUP);  // GPIO 13
    pinMode(BTN_VERMELHO, INPUT_PULLUP); // GPIO 32
    
    // Configurar LEDs
    pinMode(LED_VERMELHO_PIN, OUTPUT);
    pinMode(LED_AMARELO_PIN, OUTPUT);
    pinMode(LED_VERDE_PIN, OUTPUT);
    pinMode(LED_ONBOARD_PIN, OUTPUT);
    
    // Definir estado inicial (todos apagados)
    digitalWrite(LED_VERMELHO_PIN, LOW);
    digitalWrite(LED_AMARELO_PIN, LOW);
    digitalWrite(LED_VERDE_PIN, LOW);
    digitalWrite(LED_ONBOARD_PIN, LOW);
    
    logSerial("GPIOs inicializados");
}

/**
 * Inicializa o Watchdog Timer
 */
void initializeWatchdog() {
    esp_task_wdt_init(WATCHDOG_TIMEOUT_S, true);
    esp_task_wdt_add(NULL);
    
    // Detectar se houve reset por watchdog
    esp_reset_reason_t reason = esp_reset_reason();
    if (reason == ESP_RST_TASK_WDT) {
        logSerial("AVISO: Watchdog reset detectado");
    }
    
    logSerial("Watchdog Timer inicializado (30s timeout)");
}

/**
 * Obtém e formata o MAC address do ESP32
 */
void obtainMACAddress() {
    macAddress = WiFi.macAddress();
    
    // Extrair últimos 4 caracteres (sem ':')
    String macSuffix = macAddress.substring(macAddress.length() - 5);
    macSuffix.replace(":", "");
    
    // Criar device name
    deviceName = "ESP32-Andon-" + macSuffix;
    
    logSerial("MAC Address: " + macAddress);
    logSerial("Device Name: " + deviceName);
}

// ═══════════════════════════════════════════════════════════
// IMPLEMENTAÇÃO - SETUP
// ═══════════════════════════════════════════════════════════

void setup() {
    // Inicializar Serial Monitor
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {
        ; // Aguardar Serial estar pronto (timeout 3s)
    }
    
    // Mensagem de boot
    Serial.println();
    Serial.println("═══════════════════════════════════════════════════════");
    Serial.println("  Firmware ESP32 Andon - Sistema ID Visual AX");
    Serial.println("  Versão: " + String(FIRMWARE_VERSION));
    Serial.println("═══════════════════════════════════════════════════════");
    Serial.println();
    
    logSerial("BOOT: Iniciando firmware ID Visual AX v" + String(FIRMWARE_VERSION));
    
    // Piscar LED onboard 3x para sinalizar boot
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_ONBOARD_PIN, HIGH);
        delay(200);
        digitalWrite(LED_ONBOARD_PIN, LOW);
        delay(200);
    }
    
    // Inicializar componentes
    initializeGPIOs();
    initializeWatchdog();
    obtainMACAddress();
    
    // Configurar cliente MQTT
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setBufferSize(MQTT_BUFFER_SIZE);
    mqttClient.setCallback(mqttCallback);
    logSerial("MQTT: Cliente configurado");
    
    // Transitar para WIFI_CONNECTING
    currentState = WIFI_CONNECTING;
    logSerial("BOOT: Transição para WIFI_CONNECTING");
}

// ═══════════════════════════════════════════════════════════
// IMPLEMENTAÇÃO - LOOP
// ═══════════════════════════════════════════════════════════

void loop() {
    // Reset do watchdog a cada iteração
    esp_task_wdt_reset();
    
    // Chamar client.loop() para processar mensagens MQTT
    if (mqttClient.connected()) {
        mqttClient.loop();
    }
    
    // Atualizar LED onboard
    updateOnboardLED();
    
    // Máquina de estados
    switch (currentState) {
        case BOOT:
            // Já tratado no setup()
            break;
            
        case WIFI_CONNECTING:
            handleWiFiConnecting();
            break;
            
        case MQTT_CONNECTING:
            handleMQTTConnecting();
            break;
            
        case OPERATIONAL:
            handleOperational();
            break;
    }
}
