# Guia Rápido - Jogos de Luzes Sistema Andon

## 📐 Disposição dos Botões

```
┌─────────────────────────┐
│   🟢 VERDE   🟡 AMARELO │  ← Linha Superior
│   🔴 VERMELHO  🔵 AZUL  │  ← Linha Inferior
└─────────────────────────┘
```

---

## 🎨 ESTADOS NORMAIS

### 1️⃣ **BOOT (Inicializando)**
**O que você vê:** Luzes acendem em círculo - Verde → Amarelo → Azul → Vermelho (3 vezes)  
**Significado:** Sistema está iniciando  
**Duração:** ~5 segundos

---

### 2️⃣ **PROCURANDO WiFi**
**O que você vê:** Verde e Amarelo (linha superior) piscam alternados  
**Significado:** Tentando conectar à rede WiFi  
**Duração:** Até 15 segundos ou até conectar

---

### 3️⃣ **WiFi CONECTADO**
**O que você vê:** Verde pisca 3x rápido + TODAS as luzes acendem juntas  
**Significado:** Conectou ao WiFi com sucesso! 🎉  
**Duração:** ~2.5 segundos

---

### 4️⃣ **CONECTANDO ao Servidor**
**O que você vê:** Amarelo e Vermelho (diagonal) piscam alternados  
**Significado:** Conectado ao WiFi, tentando conectar ao servidor  
**Duração:** Até conectar ao servidor

---

### 5️⃣ **CONECTADO via MESH (Sem WiFi Direto)**
**O que você vê:** Linha inferior e superior piscam alternadas (vertical)  
**Significado:** Conectou via rede mesh (outro dispositivo faz ponte)  
**Duração:** ~3.6 segundos

---

### 6️⃣ **OPERANDO via MESH**
**O que você vê:** Azul pisca lento (1 segundo ligado/desligado)  
**Significado:** Funcionando normalmente via mesh (sem WiFi direto)  
**Duração:** Contínuo enquanto estiver neste modo

---

### 7️⃣ **PAUSADO (Botão Azul Pressionado)**
**O que você vê:** Azul pisca em ritmo cardíaco (~70 BPM)  
**Significado:** Sistema pausado pelo operador  
**Duração:** Até despausar

---

## ⚠️ ERROS E ALERTAS

### 🔴 **ERRO: WiFi Não Conectou**
**O que você vê:** Verde+Amarelo piscam 2x → Vermelho acende sozinho (2 ciclos)  
**Significado:** Não conseguiu conectar ao WiFi após 15 segundos  
**O que fazer:** Verificar se o roteador está ligado

---

### 🔴 **ERRO: Servidor Não Responde**
**O que você vê:** Amarelo e Vermelho piscam 3x rápido → Vermelho fica aceso  
**Significado:** WiFi OK, mas servidor não responde  
**O que fazer:** Verificar se o servidor está funcionando

---

### 🔴 **ERRO CRÍTICO: Integração Odoo Falhou**
**O que você vê:** Vermelho e Azul (linha inferior) piscam MUITO rápido por 5 segundos  
**Significado:** Seu acionamento foi registrado localmente mas NÃO chegou ao sistema Odoo  
**O que fazer:** Avisar supervisor imediatamente - pode precisar registrar manualmente

---

### 🔴 **AVISO: Memória Baixa**
**O que você vê:** Vermelho pisca 5x rápido → Amarelo acende  
**Significado:** Sistema com pouca memória disponível  
**O que fazer:** Normalmente se resolve sozinho, mas se repetir muito, avisar TI

---

### 🔴 **ERRO GRAVE: Sistema Travou e Reiniciou**
**O que você vê:** TODAS as luzes piscam 4x juntas → Vermelho fica aceso  
**Significado:** Sistema detectou travamento e reiniciou automaticamente  
**O que fazer:** Se acontecer frequentemente, avisar TI

---

### 🔴 **Desconectado**
**O que você vê:** Vermelho pisca 3x (acontece a cada 60 segundos)  
**Significado:** Perdeu conexão com servidor durante operação  
**O que fazer:** Aguardar reconexão automática

---

## ✅ CONFIRMAÇÕES

### ✔️ **Reset Manual (Segurou Botão Azul 5s)**
**O que você vê:** Todas piscam 3x → Azul fica aceso → Reinicia  
**Significado:** Confirmação de reset manual solicitado  
**Duração:** ~2 segundos antes de reiniciar

---

### ✔️ **Restart Remoto (Comando do Servidor)**
**O que você vê:** Verde e Azul piscam 2x → Todas acendem → Reinicia  
**Significado:** Servidor solicitou reinício do dispositivo  
**Duração:** ~1.3 segundos antes de reiniciar

---

## 🎯 DICAS RÁPIDAS

### Como identificar rapidamente:

- **Linha Superior piscando** = Tentando conectar
- **Todas piscando juntas** = Alerta máximo ou celebração
- **Vermelho presente** = Erro ou problema
- **Azul piscando lento** = Pausado ou operando via mesh
- **Piscada rápida** = Urgente/crítico
- **Piscada lenta** = Estado estável

### Cores e seus significados gerais:

- 🟢 **Verde** = OK, sucesso, normal
- 🟡 **Amarelo** = Atenção, aguardando, aviso
- 🔴 **Vermelho** = Erro, problema, falha
- 🔵 **Azul** = Controle especial, pause, mesh

---

## 📞 QUANDO CHAMAR SUPORTE

Chame o suporte de TI se:
- ❌ Vermelho pisca constantemente
- ❌ Sistema reinicia sozinho várias vezes
- ❌ Erro de integração Odoo acontece frequentemente
- ❌ Não consegue conectar ao WiFi por mais de 5 minutos
- ❌ Botões não respondem

---

**Versão do Documento:** 1.0  
**Data:** 2026-05-27  
**Sistema:** ID Visual AX - Andon ESP32
