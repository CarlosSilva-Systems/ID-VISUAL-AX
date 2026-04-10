# Requirements Document

## Introduction

Auditoria completa de UI/UX do frontend do sistema **ID Visual AX** — plataforma de gestão de operações de manufatura integrada ao Odoo ERP. O sistema é construído em React 18 + TypeScript + Tailwind CSS v4 + MUI v7 + Vite 6 e possui 13 páginas/componentes principais.

O objetivo desta feature é elevar a interface ao padrão **enterprise**: responsividade Mobile First em todos os breakpoints, design system coeso e sem inconsistências, experiência de usuário fluída com feedback adequado em todas as interações, e acessibilidade mínima garantida. A auditoria cobre Layout, Dashboard, Login, AndonGrid, Configurações, AndonPendências, AndonTV, DevicesPage, VisaoProducao, Solicitacoes, ActiveBatch e os componentes base (`ui.tsx` / `theme.css`).

---

## Glossary

- **Design_System**: Conjunto de tokens CSS, componentes base e regras visuais que garantem consistência em toda a interface.
- **Token_CSS**: Variável CSS definida em `theme.css` que representa um valor de design (cor, raio, sombra, tipografia).
- **Breakpoint**: Ponto de quebra de layout responsivo. Os breakpoints do projeto são: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px).
- **Skeleton_Loader**: Placeholder animado que representa a estrutura do conteúdo enquanto os dados são carregados.
- **Empty_State**: Estado visual exibido quando uma lista ou seção não possui dados.
- **Confirmation_Modal**: Modal de confirmação de ação destrutiva ou irreversível, substituindo `window.confirm()`.
- **Focus_Ring**: Indicador visual de foco acessível exibido ao navegar por teclado (`focus-visible`).
- **Sidebar**: Painel de navegação lateral colapsável presente no `Layout.tsx`.
- **Topbar**: Barra de navegação superior presente no `Layout.tsx`.
- **AndonGrid**: Grade de workcenters com status em tempo real (`AndonGrid.tsx`).
- **AndonTV**: Modo de exibição em tela grande para TV de fábrica (`AndonTV.tsx`).
- **ActiveBatch**: Página de lote ativo com matriz de tarefas (`ActiveBatch/index.tsx`).
- **KPICard**: Componente de card de indicador-chave de performance definido em `ui.tsx`.
- **StatCard**: Variante de card de estatística usada no Dashboard.
- **WCAG**: Web Content Accessibility Guidelines — padrão de acessibilidade web.
- **aria-label**: Atributo HTML que fornece rótulo acessível para elementos interativos sem texto visível.

---

## Requirements

---

### Requirement 1: Design System — Tokens e Consistência Visual

**User Story:** Como desenvolvedor e designer, quero que todos os valores visuais (cores, raios, sombras, tipografia) sejam definidos como tokens CSS centralizados, para que qualquer alteração de tema seja propagada automaticamente e a interface seja visualmente coesa.

#### Acceptance Criteria

1. THE Design_System SHALL definir tokens CSS para todas as sombras utilizadas na interface, com no mínimo três níveis semânticos: `--shadow-sm`, `--shadow-md`, `--shadow-lg`.
2. THE Design_System SHALL definir tokens CSS para border-radius com no mínimo três níveis semânticos: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`.
3. WHEN um componente necessitar de uma cor de status (sucesso, erro, alerta, informação), THE Design_System SHALL fornecer o Token_CSS correspondente em vez de um valor hexadecimal hardcoded.
4. THE Design_System SHALL definir uma escala tipográfica com no mínimo seis tamanhos nomeados semanticamente (ex: `--text-xs`, `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-2xl`), eliminando tamanhos arbitrários como `text-[9px]`, `text-[10px]`, `text-[11px]`.
5. WHEN um componente utilizar cor de fundo, borda ou texto, THE Design_System SHALL garantir que o valor seja referenciado via Token_CSS ou classe Tailwind semântica, não via valor hexadecimal inline como `bg-[#E53935]` ou `bg-[#F8F9FA]`.
6. THE Design_System SHALL garantir que todos os componentes base em `ui.tsx` (Button, Badge, Card, KPICard, Input, Tooltip) utilizem exclusivamente tokens do Design_System para seus valores visuais.

---

### Requirement 2: Responsividade Mobile First — Layout Global

**User Story:** Como operador de fábrica que acessa o sistema via tablet ou smartphone, quero que todas as páginas sejam utilizáveis em qualquer tamanho de tela, para que eu possa operar o sistema sem precisar de um computador desktop.

#### Acceptance Criteria

1. THE Sidebar SHALL exibir animação de entrada e saída suave (transição CSS de no mínimo 200ms) ao ser aberta e fechada em dispositivos móveis.
2. WHEN o Sidebar estiver aberto em dispositivos móveis, THE Sidebar SHALL fechar ao detectar um gesto de swipe para a esquerda com deslocamento mínimo de 50px.
3. THE Topbar SHALL exibir um botão de busca acessível em dispositivos móveis (breakpoint `sm` e abaixo), substituindo o campo de busca oculto com `hidden md:block`.
4. THE Layout SHALL aplicar padding responsivo com breakpoints intermediários: `p-3` em `sm`, `p-4` em `md`, `p-6` em `lg`, `p-8` em `xl`, eliminando o salto direto de `p-4` para `p-8`.
5. THE Dashboard SHALL aplicar padding responsivo no container principal, substituindo `p-8 max-w-7xl mx-auto` por uma escala que inicie em `p-3` no mobile.
6. THE ActiveBatch SHALL aplicar padding responsivo no container `px-8 pb-8`, iniciando em `px-3 pb-3` no mobile.
7. THE AndonGrid SHALL definir breakpoints de grid responsivos completos: `grid-cols-1` em `sm`, `grid-cols-2` em `md`, `grid-cols-3` em `lg`, `grid-cols-4` em `xl`.
8. WHEN a largura da tela for inferior a 768px, THE Solicitacoes SHALL ocultar colunas não essenciais da tabela e exibir uma visualização em cards empilhados.

---

### Requirement 3: Componentes Base — Button, Input e Formulários

**User Story:** Como usuário do sistema, quero que todos os botões e campos de formulário tenham estados visuais claros (hover, focus, active, disabled), para que eu saiba exatamente o que está acontecendo ao interagir com a interface.

#### Acceptance Criteria

1. THE Button SHALL exibir um Focus_Ring visível (`focus-visible:ring-2 focus-visible:ring-offset-2`) em todos os seus variantes (primary, secondary, tertiary, destructive, ghost).
2. THE Input SHALL exibir um Focus_Ring visível (`focus-visible:ring-2`) e borda colorida ao receber foco via teclado.
3. WHEN um formulário for submetido com campos obrigatórios vazios, THE Input SHALL exibir estado de erro visual inline (borda vermelha + mensagem de erro abaixo do campo) sem depender exclusivamente de toast.
4. THE Button SHALL manter proporções e legibilidade em todos os tamanhos de tela, sem truncamento de texto em breakpoints menores.
5. WHEN o Button estiver no estado `disabled`, THE Button SHALL exibir `cursor-not-allowed` e opacidade reduzida, sem responder a eventos de clique.

---

### Requirement 4: Remoção de Código de Debug e Limpeza de Configurações

**User Story:** Como administrador do sistema, quero que a interface de Configurações não exiba informações de debug internas, para que a aplicação tenha aparência profissional e não exponha detalhes de implementação ao usuário final.

#### Acceptance Criteria

1. THE Configuracoes SHALL remover completamente o bloco de debug hardcoded `<div className="bg-yellow-100 border border-yellow-300 p-2 rounded text-xs"><strong>Debug:</strong> Aba ativa = {activeTab}...` antes de qualquer release.
2. THE Configuracoes SHALL remover todos os `console.log` de debug relacionados à navegação de abas (ex: `console.log('Clicou na aba:', tab.id)`).
3. WHEN o código for compilado para produção, THE Design_System SHALL garantir que nenhum bloco de debug visual seja renderizado no bundle final.

---

### Requirement 5: Confirmações Destrutivas — Substituição de `window.confirm()`

**User Story:** Como usuário do sistema, quero que ações destrutivas (deletar, resetar, reiniciar) sejam confirmadas por um modal de design consistente com o restante da interface, para que eu tenha clareza sobre o impacto da ação e não execute operações acidentalmente.

#### Acceptance Criteria

1. WHEN o usuário acionar uma ação destrutiva ou irreversível, THE Confirmation_Modal SHALL ser exibido no lugar de `window.confirm()` nativo do navegador.
2. THE Confirmation_Modal SHALL exibir: título descritivo da ação, descrição do impacto, botão de cancelamento e botão de confirmação com cor semântica (vermelho para destrutivo, verde para finalização).
3. THE Confirmation_Modal SHALL ser acessível via teclado: foco inicial no botão de cancelamento, navegação por Tab entre os botões, fechamento via tecla Escape.
4. WHEN o usuário pressionar Escape ou clicar fora do Confirmation_Modal, THE Confirmation_Modal SHALL fechar sem executar a ação.
5. THE Configuracoes SHALL substituir o `window.confirm()` da ação "Resetar Banco de Dados" por um Confirmation_Modal.
6. THE DevicesPage SHALL substituir os `window.confirm()` das ações "Reiniciar ESP32" e "Remover Dispositivo" por Confirmation_Modal.
7. THE ActiveBatch SHALL substituir o `confirm()` da ação "Finalizar Lote" por um Confirmation_Modal.

---

### Requirement 6: Estados de Carregamento — Skeleton Loaders

**User Story:** Como usuário do sistema, quero ver placeholders animados enquanto os dados são carregados, para que a interface não pareça quebrada e eu entenda que o sistema está trabalhando.

#### Acceptance Criteria

1. WHEN os dados de uma lista ou tabela estiverem sendo carregados, THE Dashboard SHALL exibir Skeleton_Loaders com a mesma estrutura visual das linhas reais, em vez de um spinner centralizado isolado.
2. WHEN os workcenters estiverem sendo carregados, THE AndonGrid SHALL exibir Skeleton_Loaders com a mesma estrutura dos cards de workcenter.
3. WHEN os dispositivos estiverem sendo carregados, THE DevicesPage SHALL exibir Skeleton_Loaders com a mesma estrutura das linhas da tabela.
4. THE Skeleton_Loader SHALL utilizar animação de shimmer (gradiente animado da esquerda para a direita) com duração entre 1.2s e 1.8s.
5. WHEN os dados forem carregados com sucesso, THE Skeleton_Loader SHALL ser substituído pelo conteúdo real com transição de opacidade de no mínimo 150ms.

---

### Requirement 7: Empty States — Estados Vazios com CTA

**User Story:** Como usuário do sistema, quero que listas e seções vazias exibam mensagens claras e ações sugeridas, para que eu saiba o que fazer quando não há dados disponíveis.

#### Acceptance Criteria

1. WHEN a fila de produção do Dashboard estiver vazia após o carregamento, THE Dashboard SHALL exibir um Empty_State com ícone ilustrativo, título descritivo e subtítulo explicativo.
2. WHEN a lista de dispositivos IoT estiver vazia, THE DevicesPage SHALL exibir um Empty_State com ícone, título "Nenhum dispositivo cadastrado" e instrução sobre como adicionar dispositivos.
3. WHEN a lista de pendências de justificativa estiver vazia, THE AndonPendenciasPage SHALL exibir um Empty_State com ícone de confirmação (checkmark), título "Tudo em dia" e subtítulo "Nenhuma pendência de justificativa".
4. THE Empty_State SHALL ser visualmente distinto do estado de carregamento (Skeleton_Loader) e do estado de erro.
5. WHERE uma ação de criação for aplicável ao contexto vazio, THE Empty_State SHALL exibir um botão de CTA (Call to Action) que direcione o usuário para a ação correspondente.

---

### Requirement 8: Notificação Bell — Funcionalidade Real

**User Story:** Como usuário do sistema, quero que o ícone de notificações no Topbar exiba e gerencie notificações reais do sistema, para que eu seja alertado sobre eventos importantes sem precisar navegar por todas as páginas.

#### Acceptance Criteria

1. WHEN o usuário clicar no botão Bell do Topbar, THE Topbar SHALL exibir um painel dropdown com a lista de notificações recentes do sistema.
2. THE Topbar SHALL exibir o contador de notificações não lidas como badge numérico sobre o ícone Bell, atualizado em tempo real via WebSocket.
3. WHEN não houver notificações não lidas, THE Topbar SHALL ocultar o badge numérico do ícone Bell.
4. WHEN o usuário clicar em uma notificação no painel, THE Topbar SHALL navegar para a página correspondente ao evento notificado e marcar a notificação como lida.
5. THE Topbar SHALL exibir `aria-label="Notificações"` no botão Bell para garantir acessibilidade.

---

### Requirement 9: Acessibilidade — ARIA e Navegação por Teclado

**User Story:** Como usuário que navega por teclado ou utiliza tecnologia assistiva, quero que todos os elementos interativos sejam acessíveis e identificáveis, para que eu possa operar o sistema sem depender exclusivamente do mouse.

#### Acceptance Criteria

1. THE Topbar SHALL garantir que todos os botões icon-only (Bell, LogOut, Menu) possuam `aria-label` descritivo em pt-BR.
2. THE Sidebar SHALL garantir que todos os itens de menu possuam texto visível ou `aria-label` quando o sidebar estiver colapsado.
3. THE Input SHALL garantir que todos os campos de formulário possuam `aria-label` ou `aria-labelledby` associado a um elemento `<label>` visível.
4. WHEN um modal ou drawer for aberto, THE Confirmation_Modal SHALL capturar o foco (focus trap) dentro do modal e restaurar o foco ao elemento que o abriu ao fechar.
5. THE Button SHALL garantir que o Focus_Ring seja visível em todos os elementos interativos ao navegar por teclado, utilizando `focus-visible` em vez de `focus`.
6. THE AndonGrid SHALL garantir que os cards de workcenter possuam `role="button"` ou sejam elementos `<button>` nativos quando forem clicáveis, com `aria-label` descrevendo a ação.
7. WHEN um Badge ou chip exibir texto com tamanho inferior a 12px, THE Design_System SHALL garantir contraste mínimo de 4.5:1 entre a cor do texto e a cor de fundo, conforme WCAG 2.1 AA.

---

### Requirement 10: Indicadores de Clicabilidade — Hover e Cursor

**User Story:** Como usuário do sistema, quero que elementos clicáveis exibam feedback visual claro ao passar o mouse, para que eu saiba intuitivamente quais elementos são interativos.

#### Acceptance Criteria

1. THE AndonGrid SHALL garantir que os cards de workcenter exibam `cursor-pointer` e estado de hover visível (elevação de sombra ou mudança de borda) ao receber o ponteiro do mouse.
2. WHEN o usuário passar o mouse sobre um card clicável, THE AndonGrid SHALL exibir transição de hover com duração entre 150ms e 300ms.
3. THE Dashboard SHALL garantir que as linhas da fila de produção exibam estado de hover visível (`hover:bg-blue-50/30` ou equivalente) ao receber o ponteiro do mouse.
4. THE Solicitacoes SHALL garantir que as linhas da tabela exibam `cursor-pointer` e estado de hover visível quando forem clicáveis.
5. WHEN um elemento interativo estiver no estado `disabled`, THE Button SHALL exibir `cursor-not-allowed` e suprimir o estado de hover.

---

### Requirement 11: Loading States Consistentes

**User Story:** Como usuário do sistema, quero que todos os estados de carregamento utilizem o mesmo padrão visual, para que a interface seja previsível e profissional.

#### Acceptance Criteria

1. THE Design_System SHALL padronizar o componente de loading spinner como `Loader2` do pacote `lucide-react` com classe `animate-spin`, eliminando variações de texto simples como "Carregando..." sem indicador visual.
2. WHEN uma ação assíncrona (salvar, transferir, criar lote) estiver em progresso, THE Button SHALL exibir o spinner `Loader2` no lugar do ícone ou texto original, mantendo as dimensões do botão inalteradas.
3. THE Dashboard SHALL exibir Skeleton_Loaders durante o carregamento inicial em vez do spinner `Loader2` centralizado isolado.
4. WHEN o carregamento de uma página inteira estiver em progresso, THE Layout SHALL exibir um indicador de progresso na Topbar (barra fina no topo da página) em vez de bloquear toda a interface.

---

### Requirement 12: Tipografia Hierárquica

**User Story:** Como usuário do sistema, quero que a hierarquia visual das informações seja clara através da tipografia, para que eu identifique rapidamente o que é título, subtítulo, dado principal e dado secundário.

#### Acceptance Criteria

1. THE Design_System SHALL definir uma escala tipográfica hierárquica com pesos semânticos: `font-black` (900) para títulos de página, `font-bold` (700) para títulos de seção, `font-semibold` (600) para rótulos, `font-medium` (500) para corpo de texto, `font-normal` (400) para texto secundário.
2. THE Dashboard SHALL utilizar a escala tipográfica do Design_System para todos os textos, eliminando tamanhos arbitrários como `text-[9px]` e `text-[10px]` em favor de `text-xs` (12px) como tamanho mínimo para texto legível.
3. THE AndonGrid SHALL utilizar tamanhos tipográficos da escala semântica para os labels de seção dos cards, eliminando `text-[10px]` em favor de `text-xs`.
4. WHEN um Badge exibir texto de status, THE Badge SHALL utilizar no mínimo `text-xs` (12px) para garantir legibilidade, exceto em contextos de espaço extremamente limitado onde `text-[11px]` seja justificado.
5. THE KPICard SHALL manter a hierarquia: label em `text-xs font-bold uppercase`, valor em `text-2xl font-extrabold`, subtext em `text-xs font-medium`.

---

### Requirement 13: Consistência de Border-Radius e Sombras

**User Story:** Como designer e desenvolvedor, quero que border-radius e sombras sigam um padrão único definido no Design System, para que a interface tenha acabamento visual coeso e profissional.

#### Acceptance Criteria

1. THE Design_System SHALL definir no máximo quatro valores de border-radius para uso em componentes: `rounded-lg` (8px) para elementos pequenos (badges, chips), `rounded-xl` (12px) para botões e inputs, `rounded-2xl` (16px) para cards e painéis, `rounded-3xl` (24px) para modais e drawers.
2. THE Design_System SHALL eliminar o uso de `rounded-[2rem]` hardcoded, substituindo por `rounded-3xl` do token semântico.
3. THE Design_System SHALL padronizar sombras em três níveis: `shadow-sm` para cards em repouso, `shadow-md` para cards em hover, `shadow-xl` para modais e overlays.
4. WHEN um card estiver em estado de hover, THE AndonGrid SHALL aplicar `shadow-md` em vez de `shadow-xl` para manter a hierarquia de elevação.
5. THE Configuracoes SHALL utilizar `rounded-2xl` para o painel de conteúdo principal, eliminando `rounded-[2rem]` hardcoded.

---

### Requirement 14: Sidebar — Comportamento Mobile e Colapsado

**User Story:** Como usuário mobile, quero que a sidebar tenha comportamento fluído e intuitivo, para que a navegação seja eficiente em dispositivos de tela pequena.

#### Acceptance Criteria

1. THE Sidebar SHALL exibir animação de deslizamento suave (`transition-transform duration-300 ease-in-out`) ao abrir e fechar em dispositivos móveis.
2. WHEN o Sidebar estiver colapsado em desktop, THE Sidebar SHALL exibir tooltips com o nome do item de menu ao passar o mouse sobre os ícones.
3. WHEN o Sidebar estiver colapsado em desktop e um grupo de menu tiver um filho ativo, THE Sidebar SHALL exibir indicador visual (ponto colorido ou borda) no ícone do grupo para indicar que há um item ativo dentro dele.
4. THE Sidebar SHALL garantir que o overlay mobile (`bg-slate-900/40 backdrop-blur-sm`) seja renderizado em uma camada `z-index` inferior ao Sidebar e superior ao conteúdo principal.
5. WHEN o Sidebar mobile estiver aberto, THE Sidebar SHALL bloquear o scroll do body para evitar scroll duplo.

---

### Requirement 15: AndonTV — Modo TV Enterprise

**User Story:** Como supervisor de fábrica, quero que o modo TV do Andon exiba informações de forma clara e legível em telas grandes de fábrica, para que toda a equipe possa monitorar o status da produção em tempo real.

#### Acceptance Criteria

1. THE AndonTV SHALL garantir que todos os textos sejam legíveis a uma distância mínima de 3 metros, utilizando tamanho mínimo de `text-base` (16px) para informações secundárias e `text-2xl` (24px) para dados principais.
2. THE AndonTV SHALL exibir indicador de conexão WebSocket em tempo real (ícone de sinal com estado online/offline) no canto superior da tela.
3. WHEN a conexão WebSocket do AndonTV for perdida, THE AndonTV SHALL exibir um banner de aviso visível indicando "Conexão perdida — reconectando..." sem interromper a exibição dos últimos dados conhecidos.
4. THE AndonTV SHALL garantir que o carrossel de painéis exiba a barra de progresso de tempo (`TimerBar`) com animação suave e visível.
5. WHEN não houver chamados Andon ativos, THE AndonTV SHALL exibir o painel "Mesas Paradas" com Empty_State indicando "Todas as mesas em operação normal".

---

### Requirement 16: Login — Tela de Autenticação Enterprise

**User Story:** Como usuário do sistema, quero que a tela de login tenha aparência profissional e forneça feedback claro sobre erros de autenticação, para que o processo de login seja seguro e intuitivo.

#### Acceptance Criteria

1. THE Login SHALL exibir feedback de erro inline abaixo dos campos (borda vermelha + mensagem) quando a autenticação falhar, complementando o toast de erro existente.
2. THE Login SHALL garantir que os campos de usuário e senha possuam `aria-label` e `autocomplete` adequados (`autocomplete="username"` e `autocomplete="current-password"`).
3. WHEN o formulário de login estiver sendo submetido, THE Login SHALL desabilitar o botão de submit e exibir o spinner `Loader2` para prevenir submissões duplicadas.
4. THE Login SHALL ser totalmente responsivo, mantendo o card centralizado e legível em telas de 320px a 1920px de largura.
5. THE Login SHALL garantir que a navegação por Tab entre os campos (usuário → senha → botão submit) siga a ordem lógica do formulário.

---

### Requirement 17: Parsers e Serialização — Round-Trip de Dados

**User Story:** Como desenvolvedor, quero garantir que os dados exibidos na interface sejam corretamente formatados e que transformações de dados sejam reversíveis, para que não haja perda ou corrupção de informação na camada de apresentação.

#### Acceptance Criteria

1. THE Dashboard SHALL garantir que a função `formatObraDisplayName` produza saída consistente para qualquer string de entrada válida, sem lançar exceções para valores `null` ou `undefined`.
2. WHEN a função `formatObraDisplayName` receber um valor `null` ou `undefined`, THE Dashboard SHALL exibir um placeholder padrão ("—" ou "Sem obra") em vez de lançar exceção ou exibir `undefined`.
3. THE AndonTV SHALL garantir que as funções `elapsed` e `fmtTime` retornem valores de fallback ("---" e "--:--" respectivamente) para qualquer entrada inválida, sem lançar exceções.
4. FOR ALL strings de data ISO válidas, THE AndonTV SHALL garantir que `fmtTime(elapsed_input)` produza saída formatada consistente com o locale `pt-BR`.

---

### Requirement 18: Configurações — UX de Abas e Navegação

**User Story:** Como administrador do sistema, quero que a página de Configurações tenha navegação de abas clara e responsiva, para que eu encontre rapidamente as configurações que preciso alterar.

#### Acceptance Criteria

1. THE Configuracoes SHALL garantir que a navegação entre abas funcione corretamente sem depender de `console.log` para diagnóstico.
2. WHEN o usuário navegar para a página de Configurações com uma aba específica via URL hash (ex: `#ota`), THE Configuracoes SHALL ativar automaticamente a aba correspondente.
3. THE Configuracoes SHALL ser responsiva em mobile: as abas laterais SHALL ser exibidas como abas horizontais com scroll em telas menores que 768px.
4. WHEN o usuário tiver alterações não salvas e tentar navegar para outra aba, THE Configuracoes SHALL exibir um aviso de "Alterações não salvas" antes de trocar de aba.
5. THE Configuracoes SHALL garantir que o botão "Salvar Alterações" seja visível e acessível em todas as resoluções, incluindo mobile.

