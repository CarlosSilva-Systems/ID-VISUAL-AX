# 01 - Visão Geral do Sistema

## 📌 O que é o Sistema Andon ESP32?

O **Sistema Andon ESP32** é um firmware embarcado para microcontroladores ESP32 que atua como interface física de um sistema Andon industrial. Ele permite que operadores de chão de fábrica sinalizem problemas ou solicitem ajuda através de botões físicos, e visualizem o status atual através de LEDs coloridos.

---

## 🎯 Objetivos do Sistema

### Objetivo Principal
Fornecer uma interface física **confiável**, **responsiva** e **resiliente** para o sistema Andon, permitindo comunicação bidirecional entre operadores de chão de fábrica e o sistema de gerenciamento.

### Objetivos Específicos

1. **Captura de Eventos**
   - Detectar pressionamento de botões (verde, amarelo, vermelho, pause)
   - Aplicar debounce para evitar múltiplos disparos
   - Enviar eventos para o backend via MQTT

2. **Indicação Visual**
   - Controlar LEDs coloridos (verde, amarelo, vermelho)
   - Refletir o estado atual da estação de trabalho
   - Fornecer feedback visual imediato ao operador

3. **Conectividade Resiliente**
   - Manter conexão WiFi estável
   - Reconectar automaticamente em caso de falha
   - Operar em rede mesh quando WiFi não está disponível

4. **Gerenciamento Remoto**
   - Atualização de firmware via OTA (Over-The-Air)
   - Monitoramento de saúde do dispositivo
   - Logs remotos para diagnóstico

---

## 🏭 Contexto de Uso

### Ambiente Industrial

O sistema é projetado para operar em ambientes industriais com as seguintes características:

- **Chão de fábrica** com múltiplas estações de trabalho
- **Operadores** que precisam sinalizar problemas rapidamente
- **Supervisores** que monitoram o status das estações
- **Rede WiFi** corporativa (pode ter instabilidades)
- **Integração** com sistema ERP (Odoo)

### Fluxo de Trabalho Típico

```
1. Operador identifica problema na linha de produção
   ↓
2. Operador pressiona botão (amarelo = alerta, vermelho = emergência)
   ↓
3. ESP32 envia evento via MQTT para o backend
   ↓
4. Backend cria chamado Andon e notifica supervisores
   ↓
5. Backend envia comando para acender LED correspondente
   ↓
6. LED acende, sinalizando visualmente o problema
   ↓
7. Supervisor atende o chamado
   ↓
8. Supervisor resolve o problema e marca como resolvido no app
   ↓
9. Backend envia comando para acender LED verde
   ↓
10. Operador confirma resolução pressionando botão verde
```

---

## 🔑 Características Principais

### 1. Arquitetura Híbrida WiFi + Mesh

O sistema utiliza uma arquitetura inovadora que combina:

- **WiFi Direto**: Conexão direta ao Access Point quando disponível
- **ESP-MESH**: Rede mesh auto-organizável quando WiFi não está disponível
- **Fallback Automático**: Transição suave entre modos

**Vantagens**:
- ✅ Maior alcance (nós mesh estendem a rede)
- ✅ Maior resiliência (continua funcionando sem WiFi direto)
- ✅ Auto-recuperação (volta para WiFi quando disponível)

### 2. Máquina de Estados Robusta

```
BOOT → WIFI_CONNECTING → MQTT_CONNECTING → OPERATIONAL
                       ↘ MESH_NODE ↗
```

- **BOOT**: Inicialização do sistema
- **WIFI_CONNECTING**: Tentando conectar ao WiFi
- **MQTT_CONNECTING**: Conectando ao broker MQTT (nó raiz)
- **OPERATIONAL**: Funcionando normalmente (nó raiz com MQTT)
- **MESH_NODE**: Operando como nó folha (sem WiFi direto)

### 3. Sistema de Debounce Não-Bloqueante

- Evita múltiplos disparos acidentais
- Não bloqueia o loop principal
- Configurável (padrão: 50ms)

### 4. Reconexão Automática com Backoff Exponencial

- Tenta reconectar automaticamente
- Aumenta intervalo entre tentativas progressivamente
- Evita sobrecarga da rede

### 5. Atualização OTA (Over-The-Air)

- Atualização remota de firmware
- Rollback automático em caso de falha
- Validação de boot bem-sucedido

### 6. Provisionamento Viral Seguro

- Configuração de credenciais WiFi via ESP-NOW
- Criptografia AES-256-GCM
- Propagação automática para outros dispositivos

### 7. Monitoramento de Saúde

- Heartbeat periódico (5 minutos)
- Monitoramento de memória heap
- Watchdog timer (60 segundos)
- Logs remotos via MQTT

---

## 🏗️ Componentes do Sistema

### Hardware

- **ESP32-WROOM-32**: Microcontrolador principal
- **Botões**: 4 botões (verde, amarelo, vermelho, pause)
- **LEDs**: 3 LEDs coloridos (verde, amarelo, vermelho)
- **LED Onboard**: Indicador de conectividade

### Software

- **Firmware ESP32**: Código C++ rodando no ESP32
- **Backend FastAPI**: Servidor Python que processa eventos
- **Broker MQTT**: Mosquitto para comunicação pub/sub
- **App Web**: Interface de gerenciamento

### Bibliotecas Principais

- **Arduino Framework**: Base do firmware
- **PubSubClient**: Cliente MQTT
- **ArduinoJson**: Serialização/desserialização JSON
- **painlessMesh**: Rede mesh auto-organizável
- **mbedTLS**: Criptografia AES-GCM

---

## 📊 Estatísticas do Sistema

### Recursos de Memória

- **Flash**: ~1.2 MB (firmware compilado)
- **RAM**: ~40 KB (heap livre em operação)
- **Partições OTA**: 2x 1.5 MB (para rollback)

### Performance

- **Latência de botão**: < 100ms (incluindo debounce)
- **Latência MQTT**: < 200ms (rede local)
- **Heartbeat**: A cada 5 minutos
- **Watchdog**: 60 segundos

### Conectividade

- **WiFi**: 2.4 GHz (802.11 b/g/n)
- **Alcance WiFi**: ~50m (ambiente aberto)
- **Alcance Mesh**: ~100m por hop
- **Máximo de hops**: Ilimitado (limitado por latência)
- **Máximo de filhos por nó**: 4

---

## 🎨 Estados Visuais dos LEDs

### Estados Andon (Operação Normal)

| Estado | Verde | Amarelo | Vermelho | Significado |
|--------|-------|---------|----------|-------------|
| GREEN | ✅ Aceso | ❌ Apagado | ❌ Apagado | Tudo OK |
| YELLOW | ❌ Apagado | ✅ Aceso | ❌ Apagado | Alerta ativo |
| RED | ❌ Apagado | ❌ Apagado | ✅ Aceso | Emergência ativa |
| GRAY | 💓 Piscando | 💓 Piscando | 💓 Piscando | Pausado (70 BPM) |
| UNASSIGNED | ❌ Apagado | 💓 Piscando rápido | ❌ Apagado | Não vinculado |

### Estados de Conectividade

| Estado | Padrão | Significado |
|--------|--------|-------------|
| WIFI_CONNECTING | 🌊 Onda verde→amarelo→vermelho | Procurando WiFi |
| MQTT_CONNECTING | 🔄 Vermelho/amarelo alternados | Conectando ao broker |
| MESH_NODE | 💛 Amarelo piscando lento (1s) | Operando via mesh |
| ODOO_ERROR | 🚨 Todos vermelhos piscando rápido | Erro de integração Odoo |

### LED Onboard (Azul)

| Estado | Padrão | Significado |
|--------|--------|-------------|
| WIFI_CONNECTING | Pisca 500ms | Tentando conectar WiFi |
| MQTT_CONNECTING | Pisca 1000ms | Tentando conectar MQTT |
| MESH_NODE | Duplo pulso a cada 2s | Operando como nó folha |
| OPERATIONAL | Aceso fixo | Funcionando normalmente |

---

## 🔐 Segurança

### Criptografia

- **AES-256-GCM**: Criptografia de payloads de provisionamento
- **SHA-256**: Derivação de chaves
- **IV Aleatório**: Gerado por hardware (ESP32 RNG)
- **Authentication Tag**: Validação de integridade

### Proteções

- **Anti-Replay**: Validação de timestamp (janela de ±5 minutos)
- **Watchdog Timer**: Reinicia em caso de travamento
- **Rollback OTA**: Reverte firmware em caso de falha
- **LWT (Last Will and Testament)**: Detecta desconexão inesperada

---

## 📈 Escalabilidade

### Capacidade

- **Dispositivos por rede**: Ilimitado (limitado pelo broker MQTT)
- **Dispositivos por mesh**: ~50 (recomendado)
- **Filhos diretos por nó**: 4 (configurável)
- **Profundidade da mesh**: Ilimitada (limitado por latência)

### Performance em Escala

- **Latência adicional por hop**: ~50-100ms
- **Throughput da mesh**: ~1 Mbps (compartilhado)
- **Overhead de mesh**: ~10% (mensagens de controle)

---

## 🔄 Ciclo de Vida do Dispositivo

### 1. Fabricação
- Flash do firmware via USB
- Teste de hardware (botões e LEDs)
- Configuração inicial (opcional)

### 2. Implantação
- Instalação física na estação de trabalho
- Provisionamento de credenciais WiFi
- Vinculação a uma mesa no backend

### 3. Operação
- Funcionamento normal
- Monitoramento remoto
- Atualizações OTA quando necessário

### 4. Manutenção
- Diagnóstico remoto via logs
- Atualização de firmware
- Substituição de hardware (se necessário)

### 5. Desativação
- Desvinculação no backend
- Remoção física
- Reutilização ou descarte

---

## 🎓 Conceitos Importantes

### Andon
Sistema de alertas visuais usado em manufatura lean para sinalizar problemas na linha de produção. Originado no Sistema Toyota de Produção.

### MQTT (Message Queuing Telemetry Transport)
Protocolo de mensagens pub/sub leve, ideal para IoT. Permite comunicação assíncrona entre dispositivos e servidores.

### ESP-MESH
Protocolo de rede mesh proprietário da Espressif para ESP32. Permite criar redes auto-organizáveis sem necessidade de roteador central.

### OTA (Over-The-Air)
Atualização de firmware remotamente, sem necessidade de conexão física (USB).

### Debounce
Técnica para filtrar ruído elétrico em botões mecânicos, evitando múltiplos disparos.

### Watchdog Timer
Temporizador que reinicia o sistema se não for resetado periodicamente, protegendo contra travamentos.

---

## 📚 Próximos Passos

Para entender melhor o sistema, recomendamos ler na seguinte ordem:

1. **[02_ARQUITETURA.md](02_ARQUITETURA.md)** - Arquitetura detalhada
2. **[03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)** - Organização do código
3. **[04_MAQUINA_ESTADOS.md](04_MAQUINA_ESTADOS.md)** - Máquina de estados
4. **[12_CONFIGURACAO.md](12_CONFIGURACAO.md)** - Configuração do ambiente

---

**Próximo**: [02_ARQUITETURA.md](02_ARQUITETURA.md) - Arquitetura do Sistema
