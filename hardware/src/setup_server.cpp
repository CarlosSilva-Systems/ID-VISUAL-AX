#include "setup_server.h"
#include "nvs_storage.h"
#include "config.h"
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <esp_system.h>

static WebServer* g_server = nullptr;
static bool g_running = false;
static char g_ap_ssid[32];

// Cache do scan WiFi (feito uma vez no init para nao bloquear o loop)
static String g_scan_json = "[]";

// ─── Gera o HTML completo com dados embutidos ────────────────────────────────
static String buildHTML(const char* mac, const char* saved_name, const char* saved_location) {
    String html = F("<!DOCTYPE html><html lang='pt-BR'><head>"
        "<meta charset='UTF-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Configurar ESP32</title>"
        "<style>"
        "*{box-sizing:border-box;margin:0;padding:0}"
        "body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;"
             "min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}"
        ".card{background:#1e293b;border-radius:16px;padding:28px;width:100%;max-width:420px}"
        "h1{font-size:1.2rem;font-weight:800;color:#f8fafc;margin-bottom:4px}"
        ".sub{font-size:.8rem;color:#64748b;margin-bottom:24px}"
        "label{display:block;font-size:.75rem;font-weight:600;color:#94a3b8;margin-bottom:6px;margin-top:16px}"
        "input,select{width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;"
                     "border-radius:8px;color:#f1f5f9;font-size:.9rem;outline:none}"
        "input:focus,select:focus{border-color:#3b82f6}"
        ".btn{width:100%;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;"
             "font-size:.9rem;font-weight:700;cursor:pointer;margin-top:24px}"
        ".btn:disabled{background:#334155;cursor:not-allowed}"
        ".msg{margin-top:16px;padding:12px;border-radius:8px;font-size:.8rem;text-align:center}"
        ".ok{background:#064e3b;color:#6ee7b7}"
        ".err{background:#450a0a;color:#fca5a5}"
        "</style></head><body><div class='card'>"
        "<h1>Configurar Dispositivo</h1>"
        "<p class='sub'>MAC: ");
    html += mac;
    html += F("</p>"
        "<label>Nome do dispositivo</label>"
        "<input type='text' id='dn' placeholder='Ex: Andon Mesa 01' maxlength='32' value='");
    html += saved_name;
    html += F("'>"
        "<label>Localização</label>"
        "<input type='text' id='loc' placeholder='Ex: Linha A - Setor 3' maxlength='64' value='");
    html += saved_location;
    html += F("'>"
        "<label>Rede WiFi</label>"
        "<select id='ssid'><option value=''>-- Selecione --</option>");

    // Embutir redes escaneadas
    html += g_scan_json.length() > 2 ? "" : "";  // placeholder
    // Parse manual do JSON para gerar options
    String sj = g_scan_json;
    int pos = 0;
    while (true) {
        int s = sj.indexOf("\"ssid\":\"", pos);
        if (s < 0) break;
        s += 8;
        int e = sj.indexOf("\"", s);
        if (e < 0) break;
        String ssid = sj.substring(s, e);
        html += "<option value='" + ssid + "'>" + ssid + "</option>";
        pos = e + 1;
    }
    html += F("<option value='__manual__'>✏️ Digitar manualmente</option>"
        "</select>"
        "<div id='manual' style='display:none;margin-top:8px'>"
        "<input type='text' id='ssid_m' placeholder='Nome da rede (SSID)'>"
        "</div>"
        "<label>Senha WiFi</label>"
        "<input type='password' id='pw' placeholder='Senha da rede'>"
        "<button class='btn' id='btn' onclick='save()'>Salvar e Reiniciar</button>"
        "<div id='msg'></div>"
        "</div>"
        "<script>"
        "document.getElementById('ssid').onchange=function(){"
          "document.getElementById('manual').style.display="
          "this.value==='__manual__'?'block':'none';"
        "};"
        "function save(){"
          "var dn=document.getElementById('dn').value.trim();"
          "var loc=document.getElementById('loc').value.trim();"
          "var sel=document.getElementById('ssid').value;"
          "var ssid=sel==='__manual__'?document.getElementById('ssid_m').value.trim():sel;"
          "var pw=document.getElementById('pw').value;"
          "var msg=document.getElementById('msg');"
          "if(!dn){msg.className='msg err';msg.textContent='Nome obrigatorio';return;}"
          "if(!ssid||ssid==='-- Selecione --'){msg.className='msg err';msg.textContent='Selecione uma rede';return;}"
          "if(pw.length<8){msg.className='msg err';msg.textContent='Senha muito curta (min 8)';return;}"
          "document.getElementById('btn').disabled=true;"
          "document.getElementById('btn').textContent='Salvando...';"
          "var xhr=new XMLHttpRequest();"
          "xhr.open('POST','/configure');"
          "xhr.setRequestHeader('Content-Type','application/json');"
          "xhr.onload=function(){"
            "if(xhr.status===200){"
              "msg.className='msg ok';"
              "msg.textContent='Configurado! Reiniciando...';"
            "}else{"
              "msg.className='msg err';"
              "msg.textContent='Erro ao salvar';"
              "document.getElementById('btn').disabled=false;"
              "document.getElementById('btn').textContent='Salvar e Reiniciar';"
            "}"
          "};"
          "xhr.onerror=function(){"
            "msg.className='msg err';"
            "msg.textContent='Erro de comunicacao';"
            "document.getElementById('btn').disabled=false;"
            "document.getElementById('btn').textContent='Salvar e Reiniciar';"
          "};"
          "xhr.send(JSON.stringify({device_name:dn,location:loc,ssid:ssid,password:pw}));"
        "}"
        "</script></body></html>");
    return html;
}

// ─── Handlers HTTP ──────────────────────────────────────────────────────────

static void handleRoot() {
    char mac[18];
    uint8_t m[6];
    esp_read_mac(m, ESP_MAC_WIFI_STA);
    snprintf(mac, sizeof(mac), "%02X:%02X:%02X:%02X:%02X:%02X",
             m[0], m[1], m[2], m[3], m[4], m[5]);

    char saved_name[33] = "";
    char saved_location[65] = "";
    nvsLoadString("device_name", saved_name, sizeof(saved_name));
    nvsLoadString("location", saved_location, sizeof(saved_location));

    String html = buildHTML(mac, saved_name, saved_location);
    g_server->send(200, "text/html; charset=utf-8", html);
}

static void handleConfigure() {
    if (!g_server->hasArg("plain")) {
        g_server->send(400, "application/json", "{\"ok\":false}");
        return;
    }

    String body = g_server->arg("plain");

    // Extrai campo de um JSON simples
    auto extract = [&](const char* key) -> String {
        String k = String("\"") + key + "\":\"";
        int s = body.indexOf(k);
        if (s < 0) return "";
        s += k.length();
        int e = body.indexOf("\"", s);
        return (e < 0) ? "" : body.substring(s, e);
    };

    String device_name = extract("device_name");
    String location    = extract("location");
    String ssid        = extract("ssid");
    String password    = extract("password");

    if (device_name.length() == 0 || ssid.length() == 0 || password.length() < 8) {
        g_server->send(400, "application/json", "{\"ok\":false,\"error\":\"dados invalidos\"}");
        return;
    }

    nvsSaveString("wifi_ssid",     ssid.c_str());
    nvsSaveString("wifi_password", password.c_str());
    nvsSaveString("device_name",   device_name.c_str());
    nvsSaveString("location",      location.c_str());

    g_server->send(200, "application/json", "{\"ok\":true}");
    Serial.println("[SETUP] Configuracao salva. Reiniciando em 2s...");
    delay(2000);
    ESP.restart();
}

// ─── API pública ─────────────────────────────────────────────────────────────

void setupServerInit(const char* mac_suffix) {
    // Scan WiFi ANTES de criar o AP (mais confiável)
    Serial.println("[SETUP] Escaneando redes WiFi...");
    WiFi.mode(WIFI_STA);
    int n = WiFi.scanNetworks(false, false, false, 500);
    g_scan_json = "[";
    for (int i = 0; i < n && i < 15; i++) {
        if (i > 0) g_scan_json += ",";
        String ssid = WiFi.SSID(i);
        ssid.replace("\"", "\\\"");
        ssid.replace("'", "\\'");
        g_scan_json += "{\"ssid\":\"" + ssid + "\",\"rssi\":" + String(WiFi.RSSI(i)) + "}";
    }
    g_scan_json += "]";
    WiFi.scanDelete();
    Serial.printf("[SETUP] %d redes encontradas\n", n);

    // Criar AP
    snprintf(g_ap_ssid, sizeof(g_ap_ssid), "ESP32-Setup-%s", mac_suffix);
    WiFi.mode(WIFI_AP);
    WiFi.softAP(g_ap_ssid);
    delay(500);  // Aguardar AP estabilizar

    IPAddress ip = WiFi.softAPIP();
    Serial.printf("[SETUP] AP: %s  Acesse: http://%s\n", g_ap_ssid, ip.toString().c_str());

    // Servidor HTTP
    g_server = new WebServer(80);
    g_server->on("/",          HTTP_GET,  handleRoot);
    g_server->on("/configure", HTTP_POST, handleConfigure);
    g_server->onNotFound([]() { g_server->sendHeader("Location", "/"); g_server->send(302); });
    g_server->begin();

    g_running = true;
    Serial.println("[SETUP] Servidor HTTP pronto");
}

void setupServerLoop() {
    if (g_server && g_running) {
        g_server->handleClient();
    }
}

void setupServerStop() {
    if (g_server) {
        g_server->stop();
        delete g_server;
        g_server = nullptr;
    }
    WiFi.softAPdisconnect(true);
    g_running = false;
}

bool setupServerIsRunning() {
    return g_running;
}
