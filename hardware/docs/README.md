# 📚 Documentação Completa - Firmware ESP32 Andon

## Bem-vindo!

Esta é a documentação completa do firmware ESP32 Andon v2.4.1 do Sistema ID Visual AX.

A documentação foi criada para auxiliar desenvolvedores na **manutenção**, **correção de bugs** e **implementação de novas funcionalidades**.

---

## 🚀 Início Rápido

### Novo no Projeto?

1. **[00_INDICE.md](00_INDICE.md)** - Índice completo de toda a documentação
2. **[01_VISAO_GERAL.md](01_VISAO_GERAL.md)** - Entenda o que é o sistema e para que serve
3. **[02_ARQUITETURA.md](02_ARQUITETURA.md)** - Compreenda a arquitetura e design
4. **[03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)** - Navegue pelo código fonte

### Precisa Corrigir um Bug?

1. **[14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md)** - Problemas comuns e soluções
2. **[03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)** - Encontre onde está o código relevante
3. **Serial Monitor** - Sempre verifique os logs primeiro!

### Quer Adicionar uma Funcionalidade?

1. **[02_ARQUITETURA.md](02_ARQUITETURA.md)** - Entenda os princípios de design
2. **[03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)** - Identifique onde adicionar código
3. **[15_MANUTENCAO.md](15_MANUTENCAO.md)** - Siga as boas práticas (quando criado)

---

## 📖 Documentos Disponíveis

### ✅ Documentos Criados

| Documento | Descrição | Status |
|-----------|-----------|--------|
| **[00_INDICE.md](00_INDICE.md)** | Índice completo da documentação | ✅ Completo |
| **[01_VISAO_GERAL.md](01_VISAO_GERAL.md)** | Visão geral do sistema | ✅ Completo |
| **[02_ARQUITETURA.md](02_ARQUITETURA.md)** | Arquitetura detalhada | ✅ Completo |
| **[03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)** | Estrutura do código fonte | ✅ Completo |
| **[14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md)** | Problemas comuns e soluções | ✅ Completo |

### 📝 Documentos Planejados

Os seguintes documentos estão planejados e podem ser criados conforme necessidade:

- **04_MAQUINA_ESTADOS.md** - Detalhamento da máquina de estados
- **05_REDE_MESH.md** - Sistema ESP-MESH em profundidade
- **06_MQTT.md** - Protocolo MQTT detalhado
- **07_BOTOES_LEDS.md** - Sistema de botões e LEDs
- **08_OTA.md** - Sistema OTA em detalhes
- **09_PROVISIONING.md** - Provisionamento viral
- **10_CRIPTOGRAFIA.md** - Sistema de criptografia
- **11_HARDWARE.md** - Hardware e pinout
- **12_CONFIGURACAO.md** - Configuração do ambiente
- **13_DEBUGGING.md** - Técnicas de debug
- **15_MANUTENCAO.md** - Guia de manutenção
- **16_API_INTERNA.md** - Referência de API
- **17_FLUXOGRAMAS.md** - Fluxogramas de processos
- **18_GLOSSARIO.md** - Glossário de termos

---

## 🎯 Documentação por Caso de Uso

### Estou com um problema específico

| Problema | Onde Procurar |
|----------|---------------|
| ESP32 não conecta ao WiFi | [14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md) → Problemas de Conectividade |
| Botão não responde | [14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md) → Problemas com Botões |
| LED não acende | [14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md) → Problemas com LEDs |
| ESP32 reinicia sozinho | [14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md) → Problemas de Estabilidade |
| OTA não funciona | [14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md) → Problemas com OTA |
| Mesh não conecta | [14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md) → Mesh não funciona |

### Quero entender como funciona

| Funcionalidade | Onde Procurar |
|----------------|---------------|
| Máquina de estados | [02_ARQUITETURA.md](02_ARQUITETURA.md) → Máquina de Estados |
| Rede mesh | [02_ARQUITETURA.md](02_ARQUITETURA.md) → Arquitetura de Rede Mesh |
| Protocolo MQTT | [02_ARQUITETURA.md](02_ARQUITETURA.md) → Protocolo MQTT |
| Sistema OTA | [03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md) → Módulos Auxiliares → OTA |
| Provisionamento | [03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md) → Módulos Auxiliares → Provisionamento |
| Criptografia | [03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md) → Módulos Auxiliares → Criptografia |

### Quero modificar o código

| Modificação | Onde Procurar |
|-------------|---------------|
| Adicionar novo botão | [03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md) → Pontos de Entrada |
| Adicionar novo LED | [03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md) → Pontos de Entrada |
| Adicionar tópico MQTT | [03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md) → Pontos de Entrada |
| Mudar configuração | [03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md) → config.h |
| Adicionar novo estado | [02_ARQUITETURA.md](02_ARQUITETURA.md) → Máquina de Estados |

---

## 📊 Estatísticas do Projeto

### Código Fonte

- **Total de linhas**: ~2250 (sem comentários)
- **Arquivos .cpp**: 9
- **Arquivos .h**: 9
- **Tamanho compilado**: ~1.2 MB

### Funcionalidades

- ✅ Máquina de estados robusta (5 estados)
- ✅ Rede híbrida WiFi + ESP-MESH
- ✅ Comunicação MQTT bidirecional
- ✅ Sistema de debounce não-bloqueante
- ✅ Atualização OTA com rollback
- ✅ Provisionamento viral seguro
- ✅ Criptografia AES-256-GCM
- ✅ Watchdog timer
- ✅ Monitoramento de saúde

### Bibliotecas Externas

- Arduino Framework
- PubSubClient (MQTT)
- ArduinoJson (JSON)
- painlessMesh (ESP-MESH)
- mbedTLS (Criptografia)
- HTTPUpdate (OTA)

---

## 🔧 Ferramentas Úteis

### Desenvolvimento

- **PlatformIO**: IDE e build system
- **VS Code**: Editor recomendado
- **Serial Monitor**: Debug via porta serial

### Rede e MQTT

- **MQTT Explorer**: Visualizar tópicos MQTT
- **Mosquitto CLI**: Testar pub/sub MQTT
- **WiFi Analyzer**: Analisar espectro WiFi

### Hardware

- **Multímetro**: Testar conexões
- **Osciloscópio**: Debug de sinais (avançado)
- **Analisador lógico**: Debug de protocolos (avançado)

---

## 📞 Suporte

### Recursos Disponíveis

1. **Esta documentação** - Primeira fonte de informação
2. **Serial Monitor** - Logs detalhados do firmware
3. **MQTT Explorer** - Monitorar comunicação MQTT
4. **Equipe de desenvolvimento** - Para problemas não resolvidos

### Antes de Pedir Ajuda

✅ Leia a documentação relevante  
✅ Verifique [14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md)  
✅ Colete logs do Serial Monitor  
✅ Tente reproduzir o problema  
✅ Documente os passos tentados  

---

## 🤝 Contribuindo

Ao modificar o código ou documentação:

1. **Mantenha a documentação atualizada**
2. **Adicione comentários no código**
3. **Teste completamente**
4. **Siga as convenções existentes**
5. **Documente bugs conhecidos**

---

## 📄 Licença

Este firmware faz parte do sistema ID Visual AX.  
Propriedade da empresa AX.

---

## 📅 Informações da Documentação

- **Versão do Firmware**: 2.4.1
- **Data da Documentação**: 2026-05-07
- **Autor**: Equipe de Desenvolvimento AX
- **Status**: Documentação base completa, documentos adicionais conforme necessidade

---

## 🎓 Próximos Passos

### Se você é novo:
1. Leia [01_VISAO_GERAL.md](01_VISAO_GERAL.md)
2. Estude [02_ARQUITETURA.md](02_ARQUITETURA.md)
3. Explore [03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)

### Se precisa corrigir algo:
1. Consulte [14_TROUBLESHOOTING.md](14_TROUBLESHOOTING.md)
2. Verifique os logs do Serial Monitor
3. Identifique o módulo em [03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)

### Se vai adicionar funcionalidade:
1. Entenda os princípios em [02_ARQUITETURA.md](02_ARQUITETURA.md)
2. Localize o ponto de entrada em [03_ESTRUTURA_CODIGO.md](03_ESTRUTURA_CODIGO.md)
3. Siga as convenções de código existentes

---

**Boa sorte e bom desenvolvimento! 🚀**
