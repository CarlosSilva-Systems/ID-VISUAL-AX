# Documentação Completa - Firmware ESP32 Andon v2.4.1

## 📚 Índice Geral da Documentação

Esta documentação foi criada para auxiliar desenvolvedores na manutenção, correção de bugs e implementação de novas funcionalidades no sistema Andon ESP32.

---

## 📖 Documentos Disponíveis

### 1. Visão Geral do Sistema
- **[01_VISAO_GERAL.md](01_VISAO_GERAL.md)** - Introdução ao sistema, objetivos e contexto de uso

### 2. Arquitetura e Design
- **[02_ARQUITETURA.md](02_ARQUITETURA.md)** - Arquitetura completa do sistema, máquina de estados e fluxos de dados
- **[03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)** - Organização do código fonte, módulos e dependências

### 3. Funcionalidades Principais
- **[04_MAQUINA_ESTADOS.md](04_MAQUINA_ESTADOS.md)** - Detalhamento da máquina de estados e transições
- **[05_REDE_MESH.md](05_REDE_MESH.md)** - Sistema ESP-MESH, topologia e comunicação entre nós
- **[06_MQTT.md](06_MQTT.md)** - Protocolo MQTT, tópicos, payloads e integração com backend
- **[07_BOTOES_LEDS.md](07_BOTOES_LEDS.md)** - Sistema de botões com debounce e controle de LEDs

### 4. Funcionalidades Avançadas
- **[08_OTA.md](08_OTA.md)** - Sistema de atualização Over-The-Air (OTA)
- **[09_PROVISIONING.md](09_PROVISIONING.md)** - Provisionamento viral seguro via ESP-NOW
- **[10_CRIPTOGRAFIA.md](10_CRIPTOGRAFIA.md)** - Sistema de criptografia AES-GCM

### 5. Hardware e Configuração
- **[11_HARDWARE.md](11_HARDWARE.md)** - Pinout, esquemático e lista de materiais
- **[12_CONFIGURACAO.md](12_CONFIGURACAO.md)** - Configuração do ambiente, compilação e upload

### 6. Manutenção e Troubleshooting
- **[13_DEBUGGING.md](13_DEBUGGING.md)** - Técnicas de debug, logs e ferramentas
- **[14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md)** - Problemas comuns e soluções
- **[15_MANUTENCAO.md](15_MANUTENCAO.md)** - Guia de manutenção e boas práticas

### 7. Referência Técnica
- **[16_API_INTERNA.md](16_API_INTERNA.md)** - Referência completa de funções e estruturas
- **[17_FLUXOGRAMAS.md](17_FLUXOGRAMAS.md)** - Fluxogramas detalhados de processos críticos
- **[18_GLOSSARIO.md](18_GLOSSARIO.md)** - Glossário de termos técnicos

---

## 🚀 Início Rápido

### Para Desenvolvedores Novos no Projeto

1. Leia **[01_VISAO_GERAL.md](01_VISAO_GERAL.md)** para entender o contexto
2. Estude **[02_ARQUITETURA.md](02_ARQUITETURA.md)** para compreender o design
3. Configure o ambiente com **[12_CONFIGURACAO.md](12_CONFIGURACAO.md)**
4. Explore **[03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)** para navegar no código

### Para Correção de Bugs

1. Identifique o módulo afetado em **[03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)**
2. Consulte **[14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md)** para problemas conhecidos
3. Use **[13_DEBUGGING.md](13_DEBUGGING.md)** para técnicas de diagnóstico
4. Consulte **[16_API_INTERNA.md](16_API_INTERNA.md)** para detalhes de implementação

### Para Adicionar Funcionalidades

1. Entenda a arquitetura em **[02_ARQUITETURA.md](02_ARQUITETURA.md)**
2. Identifique o módulo relevante em **[03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)**
3. Siga as boas práticas em **[15_MANUTENCAO.md](15_MANUTENCAO.md)**
4. Consulte **[16_API_INTERNA.md](16_API_INTERNA.md)** para APIs disponíveis

---

## 📋 Convenções Usadas

### Ícones e Símbolos

- ✅ Funcionalidade implementada ou ação recomendada
- ❌ Funcionalidade não implementada ou ação não recomendada
- ⚠️ Aviso importante ou ponto de atenção
- 🔧 Configuração necessária
- 🐛 Bug conhecido ou problema
- 💡 Dica ou sugestão
- 📝 Nota importante
- 🚀 Melhoria futura ou otimização

### Formatação de Código

```cpp
// Código C++ do firmware
void exemplo() {
    Serial.println("Exemplo");
}
```

```json
// Payloads JSON do MQTT
{
    "campo": "valor"
}
```

```bash
# Comandos de terminal
pio run --target upload
```

---

## 🔄 Histórico de Versões

| Versão | Data | Mudanças Principais |
|--------|------|---------------------|
| 2.4.1 | 2026-05-07 | Documentação completa criada |
| 2.4.0 | 2026-04-07 | Arquitetura WiFi + ESP-MESH |
| 2.3.0 | - | Sistema OTA implementado |
| 2.2.0 | - | Provisionamento viral seguro |
| 2.0.0 | - | Refatoração completa da arquitetura |
| 1.0.0 | - | Versão inicial |

---

## 👥 Contribuindo

Ao modificar o código:

1. **Atualize a documentação** relevante
2. **Adicione comentários** no código para explicar lógica complexa
3. **Teste completamente** antes de fazer commit
4. **Siga as convenções** de código existentes
5. **Documente bugs conhecidos** em [14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md)

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Consulte **[14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md)**
2. Verifique os logs do Serial Monitor
3. Consulte a equipe de desenvolvimento

---

## 📄 Licença

Este firmware faz parte do sistema ID Visual AX.
Propriedade da empresa AX.

---

**Última atualização**: 2026-05-07  
**Versão do firmware**: 2.4.1  
**Autor da documentação**: Equipe de Desenvolvimento AX
