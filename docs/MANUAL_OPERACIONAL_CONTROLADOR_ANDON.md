# Manual Operacional — Controlador Andon
**ID Visual AX | Versão do Firmware: 2.4.0**

---

## O que é o Controlador Andon?

O Controlador Andon é um dispositivo eletrônico instalado em cada posto de trabalho da fábrica. Ele possui **4 botões físicos** e **3 LEDs coloridos** que permitem ao operador sinalizar o status da produção em tempo real, sem precisar acessar o computador.

Todas as sinalizações feitas no controlador aparecem automaticamente no aplicativo de gestão e ficam registradas no sistema.

---

## Componentes do Controlador

```
┌─────────────────────────────────────┐
│                                     │
│   🟢 LED VERDE    (produção normal) │
│   🟡 LED AMARELO  (alerta)          │
│   🔴 LED VERMELHO (parada crítica)  │
│                                     │
│   [VERDE]  [AMARELO]  [VERMELHO]    │
│                  [PAUSE]            │
│                                     │
└─────────────────────────────────────┘
```

| Elemento | Função |
|---|---|
| LED Verde | Indica produção normal |
| LED Amarelo | Indica alerta ou falta de material |
| LED Vermelho | Indica parada crítica |
| Botão Verde | Sinaliza produção normal / resolve chamado |
| Botão Amarelo | Sinaliza falta de material ou alerta |
| Botão Vermelho | Sinaliza parada crítica |
| Botão Pause | Pausa ou retoma a produção |

---

## Guia Rápido de Uso

### Produção Normal
Pressione o **botão verde** para indicar que a produção está funcionando normalmente. O LED verde acende e o aplicativo é atualizado.

### Falta de Material / Alerta
Pressione o **botão amarelo** para solicitar suporte ou sinalizar falta de material. O LED amarelo acende e um chamado é aberto no sistema.

### Parada Crítica
Pressione o **botão vermelho** para sinalizar uma parada de emergência. O LED vermelho acende, a ordem de fabricação é pausada automaticamente no sistema e os responsáveis são notificados.

### Pausar a Produção
Pressione o **botão pause** para pausar a produção (ex: intervalo de almoço). Todos os LEDs piscam juntos lentamente (~70 BPM) indicando que está pausado.

Pressione o **botão pause novamente** para retomar. Os LEDs voltam ao estado anterior à pausa.

---

## Sequências de Luz — O que cada padrão significa

### Estados Normais de Operação

| O que você vê | Significado |
|---|---|
| 🟢 Verde fixo | Produção em andamento normalmente |
| 🟡 Amarelo fixo | Chamado de alerta ativo |
| 🔴 Vermelho fixo | Parada crítica ativa |
| 🟢🟡🔴 Todos piscando juntos (lento, ~1x/seg) | Produção **pausada** |

### Estados de Conexão (ao ligar ou após queda de rede)

| O que você vê | Significado | O que fazer |
|---|---|---|
| Onda verde→amarelo→vermelho (contínua) | Procurando a rede WiFi | Aguardar. Se persistir por mais de 30s, verificar se o roteador está ligado |
| 🔴🟡 Vermelho e amarelo alternando rápido | WiFi conectado, mas servidor offline | Aguardar. O sistema tentará reconectar automaticamente |
| 🟡 Amarelo piscando rápido (200ms) | Controlador não vinculado a nenhuma mesa | Contatar o supervisor para vincular o dispositivo no sistema |
| 🟡 Amarelo piscando lento (1s) | Sem WiFi direto, operando via rede mesh | Normal em postos distantes do roteador. Funciona normalmente |

### Sequências de Inicialização

| O que você vê | Significado |
|---|---|
| Onda verde→amarelo→vermelho (3 ciclos rápidos) | Controlador ligando normalmente |
| Verde pisca 3 vezes | Conectou ao WiFi com sucesso |
| Amarelo pisca 3 vezes | Entrou na rede mesh (sem WiFi direto) |

---

## Como Reiniciar o Controlador

### Reinício Rápido (recomendado)
**Segure o botão PAUSE por 5 segundos.**

Você verá todos os LEDs piscarem 3 vezes rapidamente como confirmação, e o controlador reiniciará automaticamente. Após reiniciar, ele executará a sequência de inicialização normal.

Use este método quando:
- Os LEDs estiverem com comportamento estranho
- O controlador não responder aos botões
- O supervisor solicitar um reinício

### Reinício por Energia
Desconecte e reconecte o cabo de alimentação do controlador. Aguarde a sequência de inicialização (onda de LEDs) antes de usar.

> ⚠️ **Atenção:** Use fonte de alimentação de **5V com no mínimo 500mA**. Fontes com menos corrente podem impedir o controlador de inicializar corretamente.

---

## O que acontece quando o servidor fica offline?

O controlador **continua funcionando** mesmo sem conexão com o servidor:

- Os botões continuam registrando os acionamentos
- Quando a conexão for restaurada, o sistema sincroniza automaticamente
- Os LEDs mostrarão a sequência vermelho/amarelo alternados enquanto aguarda reconexão

---

## Perguntas Frequentes

**O LED ficou vermelho fixo e não muda. O que fazer?**
Pressione o botão verde para resolver o chamado ativo. Se não funcionar, reinicie o controlador segurando o botão PAUSE por 5 segundos.

**O controlador está com amarelo piscando rápido. O que significa?**
O dispositivo não está vinculado a nenhuma mesa no sistema. Contate o supervisor ou o responsável pelo TI para vincular o controlador.

**Os LEDs estão piscando em onda (verde→amarelo→vermelho) há muito tempo.**
O controlador está tentando se conectar ao WiFi. Verifique se o roteador `AX-CORPORATIVO` está funcionando. Se o problema persistir por mais de 2 minutos, reinicie o controlador.

**Pressionei o botão mas nada aconteceu no aplicativo.**
Verifique se os LEDs estão mostrando vermelho/amarelo alternados (servidor offline). Aguarde a reconexão ou contate o TI.
