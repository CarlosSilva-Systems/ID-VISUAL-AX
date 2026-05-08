# Recomendações para Produção - ESP32 Andon

## Problema: WiFi Instável em Ambiente Industrial

### Causas Comuns
- **Distância do roteador**: Chão de fábrica geralmente é grande
- **Interferência**: Máquinas industriais geram ruído eletromagnético
- **Obstáculos**: Paredes de concreto, estruturas metálicas
- **Antena PCB fraca**: ESP32 DevKit tem antena integrada na placa (PCB trace antenna)

## Soluções para Produção

### 1. ESP32 com Conector de Antena Externa (RECOMENDADO)

**Modelos recomendados:**
- **ESP32-WROOM-32U**: Versão com conector U.FL/IPEX para antena externa
- **ESP32-WROVER**: Versão com mais memória e conector de antena

**Antenas externas:**
- **Antena 2.4GHz 3dBi**: Para distâncias até 50m indoor
- **Antena 2.4GHz 5dBi**: Para distâncias até 100m indoor
- **Antena 2.4GHz 9dBi**: Para distâncias maiores ou ambientes com muita interferência

**Onde comprar:**
- AliExpress: "ESP32 WROOM 32U" + "2.4GHz antenna IPEX"
- Mercado Livre: Procurar por "ESP32 antena externa"

**Custo estimado:**
- ESP32-WROOM-32U: R$ 30-50
- Antena 3dBi com cabo: R$ 10-20
- **Total: ~R$ 50-70 por unidade**

### 2. Repetidor WiFi no Chão de Fábrica

Se não quiser trocar o hardware:
- Instalar um repetidor WiFi próximo às mesas de trabalho
- Access Point dedicado para os dispositivos IoT
- Usar WiFi mesh para cobertura uniforme

**Custo estimado:**
- Repetidor WiFi básico: R$ 80-150
- Access Point profissional: R$ 300-800

### 3. Melhorias no Firmware (Já Implementadas)

✅ **Reconexão automática**: Backoff exponencial
✅ **Watchdog Timer**: Reinicia se travar
✅ **Keep-alive**: MQTT PINGREQ a cada 15s
✅ **Monitoramento de heap**: Detecta problemas de memória

### 4. Configurações Adicionais para Produção

#### A. Aumentar potência de transmissão WiFi

Adicionar no `setup()` do firmware:

```cpp
// Aumentar potência de transmissão WiFi (max: WIFI_POWER_19_5dBm)
WiFi.setTxPower(WIFI_POWER_19_5dBm);
```

#### B. Configurar WiFi para modo de economia desligado

```cpp
// Desabilitar power save para manter conexão estável
WiFi.setSleep(false);
```

#### C. Monitorar RSSI (força do sinal)

Adicionar no `handleOperational()`:

```cpp
// Monitorar força do sinal WiFi
if (checkTimer(&heapMonitorTimer)) {
    int32_t rssi = WiFi.RSSI();
    if (rssi < -80) {
        logMQTT("AVISO: Sinal WiFi fraco - RSSI: " + String(rssi) + " dBm");
    }
}
```

**Interpretação RSSI:**
- `-30 a -50 dBm`: Excelente
- `-50 a -60 dBm`: Bom
- `-60 a -70 dBm`: Aceitável
- `-70 a -80 dBm`: Fraco (pode ter desconexões)
- `< -80 dBm`: Muito fraco (desconexões frequentes)

## Recomendação Final para Produção

### Opção 1: Custo-Benefício (RECOMENDADO)
- **Hardware**: ESP32-WROOM-32U com antena externa 3dBi
- **Custo**: ~R$ 60 por dispositivo
- **Vantagens**: Resolve 90% dos problemas de sinal, fácil de instalar

### Opção 2: Infraestrutura
- **Hardware**: ESP32 atual (sem antena externa)
- **Infraestrutura**: Access Point dedicado no chão de fábrica
- **Custo**: R$ 300-800 (uma vez, serve para todos os dispositivos)
- **Vantagens**: Melhor cobertura geral, beneficia outros dispositivos WiFi

### Opção 3: Híbrida (MELHOR PARA PRODUÇÃO)
- **Hardware**: ESP32-WROOM-32U com antena externa
- **Infraestrutura**: Access Point dedicado
- **Custo**: R$ 60/dispositivo + R$ 300-800 (AP)
- **Vantagens**: Máxima confiabilidade, redundância

## Checklist para Instalação em Produção

- [ ] Testar RSSI em cada posição de instalação
- [ ] Garantir RSSI > -70 dBm em todas as mesas
- [ ] Instalar antenas externas se RSSI < -70 dBm
- [ ] Configurar IP fixo para o servidor MQTT (evitar mudanças de IP)
- [ ] Documentar MAC address de cada dispositivo
- [ ] Etiquetar cada dispositivo com número de série
- [ ] Criar procedimento de substituição de dispositivos
- [ ] Treinar equipe para vincular/desvincular dispositivos

## Próximos Passos

1. **Teste de campo**: Instalar 1-2 dispositivos em produção por 1 semana
2. **Monitorar logs**: Verificar desconexões e RSSI
3. **Decidir solução**: Baseado nos resultados do teste
4. **Escalar**: Implementar solução escolhida em todos os dispositivos

## Contato com Fornecedores

**ESP32 com antena externa:**
- AliExpress: Buscar "ESP32 WROOM 32U development board"
- Tempo de entrega: 30-60 dias

**Antenas 2.4GHz:**
- AliExpress: Buscar "2.4GHz antenna IPEX 3dBi"
- Mercado Livre: Buscar "antena 2.4ghz ipex"

**Access Points:**
- Ubiquiti UniFi AP: Profissional, gerenciamento centralizado
- TP-Link EAP: Custo-benefício, bom para pequenas instalações
