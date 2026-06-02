# Documentação — Firmware ESP32 Andon

**Versão do firmware:** 2.5.0  
**Empresa:** AX Automação  
**Última atualização:** 2026-06-02

---

## Para Começar

Se você é novo no projeto, leia nesta ordem:

1. `01_VISAO_GERAL.md` — o que é o sistema, para que serve, fluxo de trabalho
2. `02_ARQUITETURA.md` — máquina de estados, mesh, MQTT, princípios de design
3. `03_ESTRUTURA_CODIGO.md` — organização dos arquivos, módulos, como navegar no código
4. `GUIA_COMPILACAO.md` — como compilar, subir para o ESP32 e monitorar

Para consulta diária, use o `GUIA_RAPIDO.md`.

---

## Índice dos Documentos

### Fundamentais (leia primeiro)

| Arquivo | Conteúdo |
|---------|----------|
| `01_VISAO_GERAL.md` | O que é o sistema, contexto industrial, fluxo de trabalho |
| `02_ARQUITETURA.md` | Máquina de estados, rede mesh, protocolo MQTT, fluxos de dados |
| `03_ESTRUTURA_CODIGO.md` | Organização dos arquivos, todos os módulos explicados |
| `GUIA_RAPIDO.md` | Referência rápida: pinout, estados, tópicos MQTT, comandos |

### Hardware

| Arquivo | Conteúdo |
|---------|----------|
| `PINOUT.md` | Mapeamento completo de GPIOs, esquema de ligação, troubleshooting de hardware |
| `GUIA_LED_VISUAL.md` | Referência visual de todos os jogos de luzes para operadores e devs |
| `PRODUCAO.md` | Recomendações de antena, infraestrutura WiFi e checklist para instalação |

### Funcionalidades Específicas

| Arquivo | Conteúdo |
|---------|----------|
| `LOGICA_BOTOES.md` | Validação de ações por estado Andon, cooldown, sincronização com Odoo |
| `LOGICA_PAUSE_BOTOES.md` | Intertravamento de botões, lógica de pause (GRAY), botão azul |
| `INSTRUCOES_ATUALIZACAO_OTA.md` | Como compilar, fazer upload e monitorar uma atualização OTA |

### Referência e Suporte

| Arquivo | Conteúdo |
|---------|----------|
| `14_TROUBLESHOOTING.md` | Problemas comuns e soluções: WiFi, MQTT, mesh, botões, LEDs, OTA |
| `GUIA_COMPILACAO.md` | Instalação do PlatformIO, compilação, upload e configuração inicial |

---

## Histórico de Versões do Firmware

| Versão | Data | Mudanças Principais |
|--------|------|---------------------|
| 2.5.0 | 2026-05 | Botão azul com LED retroiluminado, estado UNASSIGNED, provisioning viral |
| 2.4.0 | 2026-04 | Arquitetura WiFi direto + fallback ESP-MESH |
| 2.3.0 | — | Sistema OTA implementado |
| 2.2.0 | — | Provisionamento viral seguro via ESP-NOW |
| 2.0.0 | — | Refatoração completa da arquitetura |
| 1.0.0 | — | Versão inicial |

---

## Convenções Usadas nesta Documentação

- ✅ Funcionalidade implementada / ação recomendada
- ❌ Não implementado / ação não recomendada
- ⚠️ Ponto de atenção importante
- 💡 Dica ou sugestão

```cpp
// Trechos de código C++ do firmware
```

```bash
# Comandos de terminal
```

```json
// Payloads JSON do MQTT
```
