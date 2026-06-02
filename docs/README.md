# Documentação — ID Visual AX

Índice da documentação técnica do projeto.

---

## Estrutura

```
docs/
├── architecture/   — Como o sistema funciona internamente
├── guides/         — Guias de setup, deploy e operação
├── hardware/       — Firmware ESP32 e controladores Andon
├── operations/     — Segurança, auditoria e produção
└── archive/        — Histórico de trabalho (não é referência)
```

---

## Architecture

| Documento | Descrição |
|---|---|
| [ANDON_SYSTEM_REFERENCE.md](architecture/ANDON_SYSTEM_REFERENCE.md) | Referência completa do sistema Andon: hardware, MQTT, modelos, regras de negócio, API |
| [ANDON_PAUSE_SYNC_FLOW.md](architecture/ANDON_PAUSE_SYNC_FLOW.md) | Fluxo bidirecional de pausa/retomada entre ESP32, backend e Odoo |
| [DATABASE_PROTECTION_SYSTEM.md](architecture/DATABASE_PROTECTION_SYSTEM.md) | Sistema de proteção do banco de produção (4 camadas) |
| [MPR_ANALYTICS.md](architecture/MPR_ANALYTICS.md) | Módulo de analytics MPR: modelos, endpoints, frontend |
| [IMPRESSAO_ZEBRA.md](architecture/IMPRESSAO_ZEBRA.md) | Integração de impressão de etiquetas Zebra ZPL |
| [ANALISE_ARQUITETURA_PERSISTENCIA.md](architecture/ANALISE_ARQUITETURA_PERSISTENCIA.md) | Análise técnica de duplicação de dados e débito arquitetural identificado |

---

## Guides

| Documento | Descrição |
|---|---|
| [DEPLOYMENT.md](guides/DEPLOYMENT.md) | Deploy com Docker Compose, Nginx, SSL, backup e rollback |
| [MIGRATION_GUIDE.md](guides/MIGRATION_GUIDE.md) | Guia de migração da v1 para v2 (variáveis de ambiente, banco ativo) |
| [TESTING_GUIDE.md](guides/TESTING_GUIDE.md) | Cenários de teste para autenticação, seleção de banco e polling |
| [MQTT_BROKER_SETUP.md](guides/MQTT_BROKER_SETUP.md) | Instalação e configuração do broker Mosquitto |
| [ODOO_WEBHOOK_SETUP.md](guides/ODOO_WEBHOOK_SETUP.md) | Configuração de webhooks no Odoo 19 para sincronização Andon |
| [OTA_TROUBLESHOOTING.md](guides/OTA_TROUBLESHOOTING.md) | Troubleshooting do sistema OTA de firmware |
| [TROUBLESHOOTING_LABELS.md](guides/TROUBLESHOOTING_LABELS.md) | Troubleshooting do fluxo de etiquetas |
| [ODOO_PERFORMANCE_OPTIMIZATION.md](guides/ODOO_PERFORMANCE_OPTIMIZATION.md) | Otimizações de performance na integração Odoo |
| [LABEL_WORKFLOW_IMPROVEMENTS.md](guides/LABEL_WORKFLOW_IMPROVEMENTS.md) | Melhorias no fluxo de etiquetas |

---

## Hardware

| Documento | Descrição |
|---|---|
| [MANUAL_OPERACIONAL_CONTROLADOR_ANDON.md](hardware/MANUAL_OPERACIONAL_CONTROLADOR_ANDON.md) | Manual do operador — como usar o controlador físico |
| [MANUAL_TECNICO_CONTROLADOR_ANDON.md](hardware/MANUAL_TECNICO_CONTROLADOR_ANDON.md) | Manual técnico — máquina de estados, MQTT, LEDs, diagnóstico |

> Para documentação técnica completa do firmware, veja [`hardware/docs/`](../hardware/docs/) e o [`hardware/README.md`](../hardware/README.md).

---

## Operations

| Documento | Descrição |
|---|---|
| [SECURITY_CHECKLIST.md](operations/SECURITY_CHECKLIST.md) | Checklist OWASP para seleção dinâmica de banco — status APROVADO |
| [SECURITY_PRODUCTION_GUIDE.md](operations/SECURITY_PRODUCTION_GUIDE.md) | Guia de segurança para ambiente de produção |
| [PRE_PRODUCTION_AUDIT.md](operations/PRE_PRODUCTION_AUDIT.md) | Auditoria pré-go-live |

---

## Archive

A pasta `archive/` contém documentos históricos: relatórios de atividades, summaries de correções, instruções pontuais e análises de trabalho. Não são referência ativa — estão preservados para contexto histórico.
