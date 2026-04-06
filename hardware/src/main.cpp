// Firmware ESP32 Andon v2.2.0 - ID Visual AX
// ESP-MESH auto-organizavel com limite de conexoes

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <painlessMesh.h>
#include <esp_task_wdt.h>
#include <esp_system.h>
#include <set>
#include "config.h"

enum class SystemState : uint8_t { BOOT, MESH_INIT, MQTT_CONNECTING, OPERATIONAL };

struct ButtonState { uint8_t pin; bool lastReading; unsigned long lastChangeMs; bool pressed; };
struct LEDState    { uint8_t pin; bool on; };
struct ReconnectState {
    uint8_t attempts; unsigned long backoffMs; unsigned long lastAttemptMs;
    void reset()   { attempts=0; backoffMs=INITIAL_BACKOFF_MS; lastAttemptMs=0; }
    void backoff() { unsigned long n=backoffMs*2UL; backoffMs=n>MAX_BACKOFF_MS?MAX_BACKOFF_MS:n; attempts++; }
    bool ready() const { return (millis()-lastAttemptMs)>=backoffMs; }
};

static bool timerExpired(unsigned long& last, unsigned long interval) {
    unsigned long now=millis(); if(now-last>=interval){last=now;return true;} return false;
}

static SystemState g_state=SystemState::BOOT;
static String g_mac, g_name;
static bool g_isRoot=false;
static std::set<uint32_t> g_fullNodes;
static uint8_t g_directChildren=0;
static bool g_announcedFull=false;

static ButtonState g_btnGreen ={BTN_VERDE,   HIGH,0,false};
static ButtonState g_btnYellow={BTN_AMARELO, HIGH,0,false};
static ButtonState g_btnRed   ={BTN_VERMELHO,HIGH,0,false};
static ButtonState g_btnPause ={BTN_PAUSE,   HIGH,0,false};

static LEDState g_ledRed    ={LED_VERMELHO_PIN,false};
static LEDState g_ledYellow ={LED_AMARELO_PIN, false};
static LEDState g_ledGreen  ={LED_VERDE_PIN,   false};
static LEDState g_ledOnboard={LED_ONBOARD_PIN, false};

static unsigned long g_lastHeartbeat=0,g_lastHealth=0,g_lastStatusLog=0,g_lastBlink=0;
static ReconnectState g_mqttRecon={0,INITIAL_BACKOFF_MS,0};
static painlessMesh g_mesh;
static WiFiClient g_wifiClient;
static PubSubClient g_mqtt(g_wifiClient);

static void logSerial(const String& msg){ Serial.printf("[%8lu] %s\n",millis(),msg.c_str()); }
static void logMQTT(const String& msg){
    logSerial(msg);
    if(g_isRoot&&g_mqtt.connected()) g_mqtt.publish(("andon/logs/"+g_mac).c_str(),msg.c_str(),false);
}

static void initGPIOs(){
    pinMode(BTN_VERDE,INPUT_PULLUP); pinMode(BTN_AMARELO,INPUT_PULLUP);
    pinMode(BTN_VERMELHO,INPUT_PULLUP); pinMode(BTN_PAUSE,INPUT_PULLUP);
    const uint8_t leds[]={LED_VERMELHO_PIN,LED_AMARELO_PIN,LED_VERDE_PIN,LED_ONBOARD_PIN};
    for(uint8_t p:leds){pinMode(p,OUTPUT);digitalWrite(p,LOW);}
    logSerial("GPIO: inicializados");
}

static void setLED(LEDState& led,bool on){
    if(led.on==on)return; led.on=on; digitalWrite(led.pin,on?HIGH:LOW);
}

static void initWatchdog(){
    esp_task_wdt_init(WATCHDOG_TIMEOUT_S,true); esp_task_wdt_add(NULL);
    if(esp_reset_reason()==ESP_RST_TASK_WDT) logSerial("WDT: reset por watchdog");
    logSerial("WDT: inicializado ("+String(WATCHDOG_TIMEOUT_S)+"s)");
}

static void obtainMAC(){
    g_mac=WiFi.macAddress();
    String s=g_mac.substring(g_mac.length()-5); s.replace(":","");
    g_name="ESP32-Andon-"+s;
    logSerial("MAC: "+g_mac+"  Nome: "+g_name);
}

static void announceFull(bool full){
    StaticJsonDocument<64> doc;
    doc["type"]="capacity"; doc["full"]=full; doc["id"]=String(g_mesh.getNodeId());
    String msg; serializeJson(doc,msg); g_mesh.sendBroadcast(msg);
    logSerial(full?"MESH: cheio - anunciando":"MESH: disponivel - anunciando");
}

static void updateCapacity(){
    auto nb=g_mesh.getNodeList(true);
    g_directChildren=(uint8_t)nb.size();
    bool isFull=(g_directChildren>=MESH_MAX_CHILDREN);
    if(isFull&&!g_announcedFull){g_announcedFull=true;announceFull(true);}
    else if(!isFull&&g_announcedFull){g_announcedFull=false;announceFull(false);}
}

static void onNewConnection(uint32_t nodeId){
    logSerial("MESH: novo no "+String(nodeId)+" total="+String(g_mesh.getNodeList().size()+1));
    updateCapacity();
}

static void onDroppedConnection(uint32_t nodeId){
    logSerial("MESH: no desconectado "+String(nodeId));
    g_fullNodes.erase(nodeId); updateCapacity();
}

static void onChangedConnections(){
    bool wasRoot=g_isRoot; g_isRoot=g_mesh.isRoot(); updateCapacity();
    if(g_isRoot==wasRoot)return;
    if(g_isRoot){
        logSerial("MESH: este no tornou-se RAIZ");
        if(g_state==SystemState::OPERATIONAL||g_state==SystemState::MESH_INIT){
            g_state=SystemState::MQTT_CONNECTING; g_mqttRecon.reset();
        }
    } else {
        logSerial("MESH: este no deixou de ser raiz");
        if(g_mqtt.connected())g_mqtt.disconnect();
        if(g_state==SystemState::MQTT_CONNECTING)g_state=SystemState::OPERATIONAL;
    }
}

static void onNodeTimeAdjusted(int32_t){}

static void onMeshMessage(uint32_t from,String& msg){
    StaticJsonDocument<128> doc;
    if(deserializeJson(doc,msg)!=DeserializationError::Ok)return;
    const char* type=doc["type"]|"";
    if(strcmp(type,"capacity")==0){
        uint32_t nodeId=(uint32_t)doc["id"].as<String>().toInt();
        bool full=doc["full"]|false;
        if(full){g_fullNodes.insert(nodeId);logSerial("MESH: no "+String(nodeId)+" cheio");}
        else    {g_fullNodes.erase(nodeId); logSerial("MESH: no "+String(nodeId)+" disponivel");}
        return;
    }
    if(strcmp(type,"button")==0&&g_isRoot&&g_mqtt.connected()){
        const char* mac=doc["mac"]|""; const char* color=doc["color"]|"";
        if(strlen(mac)>0&&strlen(color)>0){
            String topic="andon/button/"+String(mac)+"/"+color;
            g_mqtt.publish(topic.c_str(),"PRESSED",false);
            logSerial("MESH->MQTT: "+topic+" (no "+String(from)+")");
        }
    }
}

static void initMesh(){
    g_mesh.setDebugMsgTypes(ERROR|STARTUP);
    g_mesh.init(MESH_ID,MESH_PASSWORD,MESH_PORT,WIFI_AP_STA,MESH_CHANNEL);
    g_mesh.stationManual(WIFI_SSID,WIFI_PASSWORD);
    g_mesh.setRoot(false); g_mesh.setContainsRoot(true);
    g_mesh.onNewConnection(&onNewConnection);
    g_mesh.onDroppedConnection(&onDroppedConnection);
    g_mesh.onChangedConnections(&onChangedConnections);
    g_mesh.onNodeTimeAdjusted(&onNodeTimeAdjusted);
    g_mesh.onReceive(&onMeshMessage);
    logSerial("MESH: ID="+String(MESH_ID)+" canal="+String(MESH_CHANNEL)+" max_filhos="+String(MESH_MAX_CHILDREN));
}

static void processButton(ButtonState& btn){
    bool reading=digitalRead(btn.pin); unsigned long now=millis();
    if(reading==btn.lastReading)return;
    if((now-btn.lastChangeMs)<DEBOUNCE_MS)return;
    btn.lastReading=reading; btn.lastChangeMs=now;
    if(reading==LOW){btn.pressed=true;logSerial("BTN: GPIO "+String(btn.pin));}
}

static void publishButton(const char* color){
    if(g_isRoot&&g_mqtt.connected()){
        String topic="andon/button/"+g_mac+"/"+color;
        g_mqtt.publish(topic.c_str(),"PRESSED",false)
            ?logSerial("BTN: -> "+topic):logSerial("ERRO: falha "+String(color));
        return;
    }
    auto nb=g_mesh.getNodeList(true);
    bool hasAvail=false;
    for(uint32_t n:nb){if(g_fullNodes.find(n)==g_fullNodes.end()){hasAvail=true;break;}}
    if(!hasAvail&&!nb.empty())logSerial("AVISO: todos vizinhos cheios - broadcast forcado");
    StaticJsonDocument<128> doc;
    doc["type"]="button"; doc["mac"]=g_mac; doc["color"]=color;
    String msg; serializeJson(doc,msg); g_mesh.sendBroadcast(msg);
    logSerial("BTN: '"+String(color)+"' via mesh");
}

static bool processLEDCommand(const String& payload){
    StaticJsonDocument<128> doc;
    if(deserializeJson(doc,payload)!=DeserializationError::Ok){logMQTT("LED: JSON invalido");return false;}
    if(!doc.containsKey("red")||!doc.containsKey("yellow")||!doc.containsKey("green")){logMQTT("LED: campos ausentes");return false;}
    setLED(g_ledRed,doc["red"].as<bool>());
    setLED(g_ledYellow,doc["yellow"].as<bool>());
    setLED(g_ledGreen,doc["green"].as<bool>());
    logSerial("LED: r="+String(g_ledRed.on)+" y="+String(g_ledYellow.on)+" g="+String(g_ledGreen.on));
    return true;
}

static void mqttCallback(char* topic,byte* payload,unsigned int length){
    String t(topic),p; p.reserve(length);
    for(unsigned int i=0;i<length;i++)p+=(char)payload[i];
    if(t=="andon/led/"+g_mac+"/command"){processLEDCommand(p);return;}
    if(t=="andon/state/"+g_mac){p.trim();p.toUpperCase();logSerial("ANDON STATE: "+p);}
}

static void onMQTTConnected(){
    logSerial("MQTT: conectado");
    g_mqtt.publish(("andon/status/"+g_mac).c_str(),"online",true);
    StaticJsonDocument<256> doc;
    doc["mac_address"]=g_mac; doc["device_name"]=g_name;
    doc["firmware_version"]=FIRMWARE_VERSION;
    doc["mesh_node_id"]=String(g_mesh.getNodeId());
    doc["mesh_node_count"]=(int)(g_mesh.getNodeList().size()+1);
    doc["mesh_children"]=g_directChildren; doc["is_root"]=g_isRoot;
    String disc; serializeJson(doc,disc);
    g_mqtt.publish("andon/discovery",disc.c_str(),false);
    logSerial("MQTT: discovery -> "+disc);
    g_mqtt.subscribe(("andon/led/"+g_mac+"/command").c_str(),1);
    g_mqtt.subscribe(("andon/state/"+g_mac).c_str(),1);
    g_mqtt.publish(("andon/state/request/"+g_mac).c_str(),"REQUEST",false);
    g_state=SystemState::OPERATIONAL; g_mqttRecon.reset();
    logSerial("MQTT: -> OPERATIONAL");
}

static void handleMQTTConnecting(){
    if(!g_isRoot)return;
    if(g_mqtt.connected()){onMQTTConnected();return;}
    if(!g_mqttRecon.ready())return;
    if(g_mqttRecon.attempts>=MQTT_MAX_RETRIES){logSerial("MQTT: max tentativas - reiniciando");delay(500);ESP.restart();}
    if(g_mqttRecon.attempts==0)logSerial("MQTT: conectando a "+String(MQTT_BROKER)+":"+String(MQTT_PORT));
    String lwt="andon/status/"+g_mac;
    bool ok=g_mqtt.connect(g_name.c_str(),lwt.c_str(),1,true,"offline");
    g_mqttRecon.lastAttemptMs=millis();
    if(!ok){logSerial("MQTT: falha rc="+String(g_mqtt.state())+" retry "+String(g_mqttRecon.backoffMs/1000)+"s");g_mqttRecon.backoff();}
}

static void handleOperational(){
    if(g_isRoot&&!g_mqtt.connected()){
        logSerial("MQTT: conexao perdida - reconectando");
        g_state=SystemState::MQTT_CONNECTING; g_mqttRecon.reset(); return;
    }
    processButton(g_btnGreen); processButton(g_btnYellow);
    processButton(g_btnRed);   processButton(g_btnPause);
    if(g_btnGreen.pressed) {publishButton("green"); g_btnGreen.pressed=false;}
    if(g_btnYellow.pressed){publishButton("yellow");g_btnYellow.pressed=false;}
    if(g_btnRed.pressed)   {publishButton("red");   g_btnRed.pressed=false;}
    if(g_btnPause.pressed) {publishButton("pause"); g_btnPause.pressed=false;}

    if(g_isRoot&&g_mqtt.connected()&&timerExpired(g_lastHeartbeat,HEARTBEAT_INTERVAL_MS)){
        StaticJsonDocument<128> hb;
        hb["heap"]=ESP.getFreeHeap(); hb["rssi"]=WiFi.RSSI();
        hb["mesh_nodes"]=(int)(g_mesh.getNodeList().size()+1);
        hb["mesh_children"]=g_directChildren; hb["is_root"]=g_isRoot;
        String s; serializeJson(hb,s);
        g_mqtt.publish(("andon/status/"+g_mac).c_str(),s.c_str(),false);
        logSerial("HEARTBEAT: "+s);
    }
    if(timerExpired(g_lastHealth,HEAP_MONITOR_INTERVAL_MS)){
        uint32_t heap=ESP.getFreeHeap();
        if(heap<HEAP_WARN_THRESHOLD)logMQTT("AVISO: heap baixo "+String(heap)+" bytes");
        if(g_isRoot&&WiFi.RSSI()<RSSI_WARN_THRESHOLD)logMQTT("AVISO: sinal fraco RSSI="+String(WiFi.RSSI())+" dBm");
    }
    if(timerExpired(g_lastStatusLog,STATUS_LOG_INTERVAL_MS)){
        logSerial("STATUS: nos="+String(g_mesh.getNodeList().size()+1)
                  +" filhos="+String(g_directChildren)+"/"+String(MESH_MAX_CHILDREN)
                  +" cheios="+String(g_fullNodes.size())
                  +" raiz="+String(g_isRoot)
                  +" heap="+String(ESP.getFreeHeap())
                  +" RSSI="+String(WiFi.RSSI()));
    }
}

static void updateOnboardLED(){
    switch(g_state){
        case SystemState::MESH_INIT:
            if(timerExpired(g_lastBlink,WIFI_BLINK_MS/2))setLED(g_ledOnboard,!g_ledOnboard.on); break;
        case SystemState::MQTT_CONNECTING:
            if(g_isRoot&&timerExpired(g_lastBlink,MQTT_BLINK_MS))setLED(g_ledOnboard,!g_ledOnboard.on);
            else if(!g_isRoot)setLED(g_ledOnboard,true); break;
        case SystemState::OPERATIONAL: setLED(g_ledOnboard,true); break;
        default: break;
    }
}

void setup(){
    Serial.begin(115200);
    for(uint32_t t=millis();!Serial&&(millis()-t)<3000;){}
    Serial.println("\n=================================================");
    Serial.println("  Firmware ESP32 Andon v2.2.0 - ID Visual AX");
    Serial.println("=================================================\n");
    pinMode(LED_ONBOARD_PIN,OUTPUT);
    for(int i=0;i<3;i++){digitalWrite(LED_ONBOARD_PIN,HIGH);delay(150);digitalWrite(LED_ONBOARD_PIN,LOW);delay(150);}
    initGPIOs(); initWatchdog(); initMesh(); obtainMAC();
    g_mqtt.setServer(MQTT_BROKER,MQTT_PORT);
    g_mqtt.setBufferSize(MQTT_BUFFER_SIZE);
    g_mqtt.setKeepAlive(MQTT_KEEPALIVE_S);
    g_mqtt.setCallback(mqttCallback);
    logSerial("MQTT: cliente configurado");
    g_state=SystemState::MESH_INIT;
    logSerial("BOOT: -> MESH_INIT");
}

void loop(){
    esp_task_wdt_reset();
    g_mesh.update();
    if(g_isRoot&&g_mqtt.connected())g_mqtt.loop();
    updateOnboardLED();
    switch(g_state){
        case SystemState::BOOT: break;
        case SystemState::MESH_INIT:
            if(g_isRoot){g_state=SystemState::MQTT_CONNECTING;logSerial("MESH: raiz -> MQTT_CONNECTING");}
            else if(g_mesh.getNodeList().size()>0){g_state=SystemState::OPERATIONAL;logSerial("MESH: nao-raiz -> OPERATIONAL");}
            break;
        case SystemState::MQTT_CONNECTING: handleMQTTConnecting(); break;
        case SystemState::OPERATIONAL:     handleOperational();     break;
    }
}