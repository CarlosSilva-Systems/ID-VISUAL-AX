# Requirements Document

## Introduction

Reestruturação sistemática e completa da interface do **ID Visual AX** com estratégia **Mobile-First**, garantindo responsividade absoluta em todos os breakpoints: Smartphones (320px–639px), Tablets (640px–1023px) e Desktop (1024px+). Este spec vai além do `ui-ux-audit-enterprise` — que cobriu responsividade parcialmente em Layout, Dashboard, Configurações e AndonGrid — e aplica uma estratégia mobile-first sistemática a **todos** os componentes e páginas do sistema, incluindo tabelas complexas, modais, drawers, formulários e páginas de gestão OTA/IoT.

O sistema é construído em React 18 + TypeScript + Tailwind CSS v4 + MUI v7. Os breakpoints Tailwind do projeto são: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px). A estratégia adotada é **CSS Grid + Flexbox** com unidades relativas (`rem`/`em`/`vh`/`vw`), touch targets mínimos de 44×44px, eliminação de efeitos `hover`-only em elementos touch, e tipografia escalável.

---

## Glossary

- **Mobile_First**: Estratégia de desenvolvimento onde os estilos base são definidos para telas menores (≥320px) e expandidos progressivamente para telas maiores via media queries.
- **Touch_Target**: Área mínima clicável/tocável de um elemento interativo. O padrão WCAG 2.5.5 e Apple HIG recomendam mínimo de 44×44px.
- **Breakpoint**: Ponto de quebra de layout responsivo. Breakpoints do projeto: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px).
- **Card_View**: Visualização alternativa a tabelas, onde cada linha é renderizada como um card empilhado verticalmente, adequada para telas estreitas.
- **Responsive_Table**: Tabela que se adapta a telas pequenas, ocultando colunas não essenciais ou convertendo para Card_View abaixo de determinado breakpoint.
- **Fluid_Grid**: Grade CSS que reorganiza colunas automaticamente usando `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` sem quebras de layout.
- **Relative_Unit**: Unidade CSS relativa ao contexto (`rem`, `em`, `vh`, `vw`, `%`) que escala proporcionalmente à densidade de pixels e tamanho de fonte do dispositivo.
- **Hover_Only_Effect**: Efeito visual (tooltip, ação, feedback) que só é acionado por `:hover` e não possui equivalente para toque (`active`, `focus`), tornando-o inacessível em dispositivos touch.
- **Sidebar**: Painel de navegação lateral colapsável presente no `Layout.tsx`.
- **Topbar**: Barra de navegação superior presente no `Layout.tsx`.
- **AndonGrid**: Grade de workcenters com status em tempo real (`AndonGrid.tsx`).
- **AndonTV**: Modo de exibição em tela grande para TV de fábrica (`AndonTV.tsx`). Componente exclusivo para telas grandes — não requer adaptação mobile.
- **OTASettings**: Componente de gestão de firmware OTA (`OTASettings.tsx`), contém tabela de releases e cards de status.
- **OTAProgressDashboard**: Dashboard de progresso de atualização OTA (`OTAProgressDashboard.tsx`).
- **DevicesPage**: Página de gestão de dispositivos IoT ESP32 (`DevicesPage.tsx`), contém tabela complexa com múltiplas colunas.
- **Solicitacoes**: Página de solicitações manuais de produção (`Solicitacoes.tsx`), contém tabela com drawer de detalhes.
- **AndonPendenciasPage**: Página de pendências de justificativa Andon (`AndonPendenciasPage.tsx`), contém tabela interna agrupada por workcenter.
- **ProductionViewUI**: Interface de solicitação de identificação para produção (`ProductionViewUI.tsx`).
- **Configuracoes**: Página de configurações do sistema (`Configuracoes.tsx`).
- **Dashboard**: Página principal de fila de produção (`Dashboard.tsx`).
- **ActiveBatch**: Página de lote ativo com matriz de tarefas.
- **WCAG**: Web Content Accessibility Guidelines — padrão de acessibilidade web.

---

## Requirements

---

### Requirement 1: Estratégia Mobile-First — Tokens e Escala Global

**User Story:** Como desenvolvedor, quero que todos os valores de espaçamento, tipografia e layout sejam definidos com unidades relativas e escalem automaticamente entre dispositivos, para que a interface seja consistente em qualquer densidade de pixels.

#### Acceptance Criteria

1. THE Mobile_First SHALL utilizar exclusivamente Relative_Unit (`rem`, `em`, `vh`, `vw`, `%`) para tamanhos de fonte, espaçamentos e dimensões de layout, eliminando valores fixos em `px` para tipografia e padding de containers.
2. THE Mobile_First SHALL garantir que o `font-size` base do `html` (definido em `theme.css` como `var(--font-size)`) seja `16px` como valor padrão, permitindo que todos os valores `rem` escalem proporcionalmente.
3. WHEN a largura da tela for inferior a 640px, THE Mobile_First SHALL garantir que nenhum container de página aplique padding horizontal superior a `1rem` (16px), evitando overflow horizontal.
4. THE Mobile_First SHALL garantir que todos os containers de página principais utilizem a escala de padding responsivo: `p-3` (12px) em mobile, `p-4 sm:p-6` em tablet, `p-6 lg:p-8` em desktop.
5. THE Mobile_First SHALL garantir que nenhum elemento de texto utilize tamanho inferior a `0.75rem` (12px / `text-xs`) em qualquer breakpoint, preservando legibilidade mínima.
6. FOR ALL componentes de página, THE Mobile_First SHALL garantir que `max-width` containers utilizem `w-full` como base e `max-w-7xl mx-auto` apenas em breakpoints `lg` e superiores.

---

### Requirement 2: Touch Targets — Botões e Elementos Interativos

**User Story:** Como operador de fábrica que usa o sistema via smartphone ou tablet, quero que todos os botões e elementos clicáveis tenham área de toque adequada, para que eu possa operar o sistema com precisão sem erros de toque.

#### Acceptance Criteria

1. THE Touch_Target SHALL garantir que todos os botões de ação primária (criar lote, salvar, transferir, confirmar) possuam altura mínima de `2.75rem` (44px) em todos os breakpoints.
2. THE Touch_Target SHALL garantir que todos os botões de ação secundária (filtros, abas, chips de status) possuam altura mínima de `2.75rem` (44px) em dispositivos com largura inferior a 768px.
3. THE Touch_Target SHALL garantir que todos os botões icon-only (ações de tabela: editar, deletar, reiniciar, sincronizar) possuam área clicável mínima de `2.75rem × 2.75rem` (44×44px) em dispositivos com largura inferior a 768px.
4. WHEN um elemento interativo receber toque em dispositivo mobile, THE Touch_Target SHALL exibir feedback visual via estado `active:` (escala, opacidade ou cor) em substituição ou complemento ao estado `hover:`.
5. THE Touch_Target SHALL garantir que checkboxes de seleção em tabelas possuam área de toque de no mínimo `2.75rem × 2.75rem` em mobile, utilizando padding ao redor do elemento `<input type="checkbox">`.
6. THE Touch_Target SHALL garantir que os itens de menu da Sidebar possuam altura mínima de `2.75rem` (44px) em todos os breakpoints.

---

### Requirement 3: Layout Global — Sidebar e Topbar Responsivos

**User Story:** Como usuário mobile, quero que a navegação principal seja fluída e intuitiva em telas pequenas, para que eu acesse qualquer seção do sistema sem dificuldade.

#### Acceptance Criteria

1. THE Sidebar SHALL ser completamente oculta em dispositivos com largura inferior a 1024px (`lg`) e acessível exclusivamente via botão de menu hambúrguer na Topbar.
2. WHEN o botão de menu hambúrguer for acionado em mobile, THE Sidebar SHALL deslizar da esquerda com animação `transition-transform duration-300 ease-in-out` e ocupar largura de `min(280px, 85vw)` para não cobrir toda a tela.
3. WHEN a Sidebar mobile estiver aberta, THE Sidebar SHALL exibir overlay semitransparente (`bg-slate-900/50 backdrop-blur-sm`) cobrindo o conteúdo principal, com `z-index` inferior ao painel da Sidebar.
4. THE Topbar SHALL exibir o botão de busca como ícone clicável em mobile (largura < 768px), expandindo para um campo de busca full-width ao ser acionado, em vez de ocultar completamente a funcionalidade.
5. THE Topbar SHALL garantir que os elementos do lado direito (badge Odoo, ConnectionBadge, Bell, avatar, logout) se reorganizem em mobile: ocultar badge "Odoo Conectado" e nome do usuário em telas < 640px, mantendo apenas Bell, avatar e logout visíveis.
6. WHEN a Sidebar mobile estiver aberta e o usuário navegar para uma nova página, THE Sidebar SHALL fechar automaticamente após a navegação.
7. THE Sidebar SHALL garantir que grupos de menu colapsáveis (ID Visual, Andon) funcionem corretamente em mobile, com área de toque adequada no botão de toggle do grupo.

---

### Requirement 4: Dashboard — Fila de Produção Responsiva

**User Story:** Como supervisor de produção acessando o sistema via tablet, quero que a fila de produção seja legível e operável em telas menores, para que eu possa criar lotes e monitorar o status sem precisar de um desktop.

#### Acceptance Criteria

1. THE Dashboard SHALL aplicar padding responsivo no container principal: `p-3` em mobile, `p-4 sm:p-6` em tablet, `p-6 lg:p-8` em desktop, eliminando o `p-3 sm:p-4 md:p-6 lg:p-8` atual que já está parcialmente correto mas deve ser verificado.
2. THE Dashboard SHALL reorganizar os cards de estatísticas (StatCard) de `grid-cols-1 md:grid-cols-4` para `grid-cols-2 md:grid-cols-4`, garantindo que em mobile os 4 cards sejam exibidos em 2 colunas de 2 linhas.
3. WHEN a largura da tela for inferior a 768px, THE Dashboard SHALL exibir cada item da fila de produção (DashboardRow) como um card compacto empilhado verticalmente, em vez da layout horizontal com múltiplas colunas.
4. THE Dashboard SHALL garantir que os filtros de status (Todas, Hoje, Esta Semana, Atrasadas, Bloqueadas) sejam exibidos em scroll horizontal em mobile, sem quebrar para múltiplas linhas.
5. THE Dashboard SHALL garantir que o campo de busca da fila de produção ocupe `w-full` em mobile e `w-80` em desktop.
6. WHEN a largura da tela for inferior a 768px, THE Dashboard SHALL exibir o botão "Criar Lote" com texto completo e ícone, com altura mínima de 44px, posicionado abaixo do contador de selecionados.
7. THE Dashboard SHALL garantir que os cards de lotes em andamento (ActiveBatches) utilizem `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, exibindo um card por linha em mobile.

---

### Requirement 5: Solicitações — Tabela com Card View Mobile

**User Story:** Como operador de produção acessando via smartphone, quero que a lista de solicitações manuais seja legível e operável em telas pequenas, para que eu possa transferir solicitações sem precisar de um desktop.

#### Acceptance Criteria

1. WHEN a largura da tela for inferior a 768px, THE Solicitacoes SHALL substituir a visualização de tabela por uma lista de Card_View, onde cada solicitação é exibida como um card com: status badge, nome do solicitante, número MO, obra e botão de ação.
2. THE Solicitacoes SHALL garantir que o cabeçalho da página (título + botão de transferência em lote) se reorganize em coluna em mobile, com o botão de transferência em lote ocupando `w-full` abaixo do título.
3. THE Solicitacoes SHALL garantir que a barra de filtros (chips de status + campo de busca) empilhe verticalmente em mobile, com o campo de busca ocupando `w-full`.
4. WHEN a largura da tela for inferior a 768px, THE Solicitacoes SHALL exibir o drawer de detalhes como um bottom sheet (painel deslizando de baixo para cima) em vez de um painel lateral, ocupando `100vw` e `max-h-[85vh]`.
5. THE Solicitacoes SHALL garantir que o botão "Transferir" em cada card/linha possua altura mínima de 44px em mobile.
6. THE Solicitacoes SHALL garantir que checkboxes de seleção múltipla possuam área de toque de 44×44px em mobile.

---

### Requirement 6: Dispositivos IoT — Tabela Complexa Responsiva

**User Story:** Como técnico de TI acessando via tablet, quero que a página de dispositivos IoT seja utilizável em telas menores, para que eu possa gerenciar dispositivos ESP32 sem precisar de um desktop.

#### Acceptance Criteria

1. WHEN a largura da tela for inferior a 1024px, THE DevicesPage SHALL substituir a visualização de tabela por uma lista de Card_View, onde cada dispositivo é exibido como um card com: nome, MAC address, status badge, workcenter vinculado, firmware e botões de ação.
2. THE DevicesPage SHALL garantir que os cards de resumo (SummaryCards) utilizem `grid-cols-2 lg:grid-cols-4`, exibindo 2 cards por linha em mobile e tablet.
3. THE DevicesPage SHALL garantir que os botões de ação de cada dispositivo (editar, logs, sync, reiniciar, remover) possuam área de toque mínima de 44×44px em mobile, agrupados em uma linha horizontal com scroll se necessário.
4. THE DevicesPage SHALL garantir que o cabeçalho da página (título + botão Atualizar) se reorganize em coluna em mobile, com o botão Atualizar ocupando `w-full` abaixo do título.
5. WHEN a largura da tela for inferior a 768px, THE DevicesPage SHALL exibir o DeviceDrawer como um bottom sheet (painel deslizando de baixo para cima) em vez de um painel lateral, ocupando `100vw` e `max-h-[90vh]`.
6. THE DevicesPage SHALL garantir que os badges de status (Online, Offline, Sem vínculo) e firmware sejam legíveis em cards mobile sem truncamento.

---

### Requirement 7: Andon Pendências — Tabela Agrupada Responsiva

**User Story:** Como supervisor de produção acessando via tablet, quero que a página de pendências de justificativa seja utilizável em telas menores, para que eu possa justificar paradas sem precisar de um desktop.

#### Acceptance Criteria

1. WHEN a largura da tela for inferior a 1024px, THE AndonPendenciasPage SHALL substituir a tabela interna de cada grupo de workcenter por uma lista de Card_View, onde cada parada é exibida como um card com: cor do chamado, responsável, tipo, fabricação, duração e botão "Justificar".
2. THE AndonPendenciasPage SHALL garantir que o cabeçalho do grupo de workcenter (nome, responsável, tipo, fabricação) se reorganize em mobile, exibindo apenas nome do workcenter e contador de paradas na linha principal, com os detalhes em linha secundária.
3. THE AndonPendenciasPage SHALL garantir que os filtros (select de cor, inputs de data) se reorganizem em coluna em mobile, com cada filtro ocupando `w-full`.
4. THE AndonPendenciasPage SHALL garantir que o botão "Justificar" em cada card/linha possua altura mínima de 44px em mobile.
5. THE AndonPendenciasPage SHALL garantir que o cabeçalho da página (título + botão Atualizar) se reorganize em coluna em mobile.

---

### Requirement 8: OTA Management — Responsividade Completa

**User Story:** Como administrador de TI acessando via tablet, quero que as páginas de gestão OTA sejam utilizáveis em telas menores, para que eu possa gerenciar atualizações de firmware sem precisar de um desktop.

#### Acceptance Criteria

1. THE OTASettings SHALL substituir o padding fixo `p-8` do container principal por padding responsivo: `p-4 sm:p-6 lg:p-8`.
2. WHEN a largura da tela for inferior a 768px, THE OTASettings SHALL substituir a tabela de releases por uma lista de Card_View, onde cada release é exibido como um card com: versão, data, origem, tamanho e botão "Atualizar Todos".
3. THE OTASettings SHALL garantir que os botões de ação ("Verificar GitHub", "Upload Manual") se reorganizem em coluna em mobile, com cada botão ocupando `w-full` e altura mínima de 44px.
4. THE OTASettings SHALL substituir o `rounded-[2rem]` hardcoded dos cards de status da frota por `rounded-2xl` do token semântico.
5. THE OTAProgressDashboard SHALL substituir o padding fixo `p-8` do container principal por padding responsivo: `p-4 sm:p-6 lg:p-8`.
6. THE OTAProgressDashboard SHALL garantir que os cards de estatísticas (Concluídos, Em Progresso, Falharam, Total) utilizem `grid-cols-2 md:grid-cols-4`, exibindo 2 cards por linha em mobile.
7. WHEN a largura da tela for inferior a 768px, THE OTAProgressDashboard SHALL reorganizar cada DeviceProgressItem para exibir a barra de progresso abaixo das informações do dispositivo (layout em coluna), em vez de ao lado (layout em linha).

---

### Requirement 9: Configurações — Responsividade de Abas e Formulários

**User Story:** Como administrador do sistema acessando via tablet, quero que a página de configurações seja completamente utilizável em telas menores, para que eu possa ajustar configurações sem precisar de um desktop.

#### Acceptance Criteria

1. THE Configuracoes SHALL garantir que o layout de abas laterais (`flex-col md:flex-row`) funcione corretamente em mobile, exibindo as abas como uma lista horizontal com scroll acima do conteúdo em telas < 768px.
2. THE Configuracoes SHALL garantir que o cabeçalho da página (título + botão "Salvar Alterações") se reorganize em coluna em mobile, com o botão "Salvar Alterações" ocupando `w-full` abaixo do título.
3. THE Configuracoes SHALL garantir que o botão "Salvar Alterações" possua altura mínima de 44px em todos os breakpoints.
4. THE Configuracoes SHALL garantir que o grid de botões de ambiente Odoo (`grid-cols-1 md:grid-cols-2`) exiba os botões em coluna única em mobile, com cada botão tendo altura mínima de 44px.
5. THE Configuracoes SHALL garantir que a seção "Zona de Perigo" reorganize o layout `flex-col md:flex-row` corretamente em mobile, com o botão "Resetar Agora" ocupando `w-full` abaixo da descrição.
6. THE Configuracoes SHALL garantir que o select de usuário responsável possua altura mínima de 44px em todos os breakpoints.

---

### Requirement 10: Visão Produção — Formulário Mobile-First

**User Story:** Como operador de produção acessando via smartphone na fábrica, quero que o formulário de solicitação de identificação seja completamente utilizável em telas pequenas, para que eu possa solicitar IDs diretamente do chão de fábrica.

#### Acceptance Criteria

1. THE ProductionViewUI SHALL garantir que o modal de nova solicitação (`fixed top-1/2 left-1/2`) seja exibido como bottom sheet em mobile (largura < 640px), deslizando de baixo para cima e ocupando `w-full max-h-[95vh]`, em vez de um modal centralizado que pode ser cortado em telas pequenas.
2. THE ProductionViewUI SHALL garantir que o grid de tipos de quadro (`grid-cols-2`) mantenha 2 colunas em mobile, com cada botão tendo altura mínima de 44px.
3. THE ProductionViewUI SHALL garantir que o grid de itens necessários (`grid-cols-2`) mantenha 2 colunas em mobile, com cada botão tendo altura mínima de 44px.
4. THE ProductionViewUI SHALL garantir que o campo de busca de fabricação ocupe `w-full` em mobile, sem o `sm:w-80` que limita a largura.
5. THE ProductionViewUI SHALL garantir que o grid de conteúdo principal (`grid-cols-1 md:grid-cols-2`) exiba as seções em coluna única em mobile.
6. THE ProductionViewUI SHALL garantir que o botão "Solicitar AGORA" possua altura mínima de 56px (`h-14`) em todos os breakpoints, sendo o principal CTA da página.

---

### Requirement 11: AndonGrid — Cards de Workcenter Responsivos

**User Story:** Como operador de fábrica acessando via smartphone, quero que o painel Andon seja utilizável em telas pequenas, para que eu possa acionar chamados diretamente do chão de fábrica.

#### Acceptance Criteria

1. THE AndonGrid SHALL garantir que o grid de cards de workcenter utilize `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, exibindo um card por linha em mobile.
2. THE AndonGrid SHALL garantir que o botão "Acionar Andon" em cada card possua altura mínima de 44px em todos os breakpoints.
3. THE AndonGrid SHALL garantir que o botão de planejamento (ícone Calendar) possua área de toque mínima de 44×44px em mobile.
4. THE AndonGrid SHALL garantir que o botão IoT (ícone KeyRound) possua área de toque mínima de 44×44px em mobile.
5. WHEN a largura da tela for inferior a 640px, THE AndonGrid SHALL garantir que o cabeçalho da página (título + botão "Abrir TV") se reorganize em coluna, com o botão "Abrir TV" ocupando `w-full`.
6. THE AndonGrid SHALL eliminar o efeito `hover:-translate-y-1` dos cards em dispositivos touch, substituindo por feedback `active:scale-[0.98]` para indicar o toque.

---

### Requirement 12: Modais e Drawers — Adaptação Mobile

**User Story:** Como usuário mobile, quero que modais e painéis de detalhes sejam exibidos de forma adequada em telas pequenas, para que eu possa interagir com eles sem dificuldade.

#### Acceptance Criteria

1. WHEN a largura da tela for inferior a 640px, THE Confirmation_Modal SHALL ocupar `w-full` com `rounded-t-2xl rounded-b-none` e ser posicionado na parte inferior da tela (bottom sheet), em vez de centralizado com `max-w-sm`.
2. THE Confirmation_Modal SHALL garantir que os botões de ação (Cancelar, Confirmar) possuam altura mínima de 44px em todos os breakpoints.
3. WHEN a largura da tela for inferior a 640px, THE ModalPacote SHALL ser exibido como bottom sheet, ocupando `w-full max-h-[95vh]` com scroll interno.
4. WHEN a largura da tela for inferior a 640px, THE JustificationModal SHALL ser exibido como bottom sheet, ocupando `w-full max-h-[95vh]` com scroll interno.
5. THE DocumentPreviewModal SHALL garantir que em mobile o modal ocupe `w-full h-full` (tela cheia), eliminando margens laterais que reduziriam o espaço de visualização do documento.
6. WHEN um drawer lateral (DeviceDrawer, detalhes de Solicitacoes) for exibido em mobile (largura < 768px), THE drawer SHALL ser renderizado como bottom sheet em vez de painel lateral, com `w-full` e `max-h-[90vh]`.

---

### Requirement 13: Eliminação de Hover-Only Effects em Touch

**User Story:** Como usuário de dispositivo touch (smartphone/tablet), quero que todos os feedbacks visuais de interação funcionem com toque, para que eu saiba quando um elemento foi acionado.

#### Acceptance Criteria

1. THE Mobile_First SHALL garantir que todos os tooltips baseados em `group-hover:opacity-100` (como os tooltips da Sidebar colapsada e os tooltips do AndonGrid) possuam alternativa de exibição via `focus-visible` ou `active` para dispositivos touch.
2. THE AndonGrid SHALL eliminar o tooltip de IoT status que depende exclusivamente de `hover` (via `TooltipProvider`), substituindo por exibição inline do status no card em mobile.
3. THE Mobile_First SHALL garantir que estados de hover em linhas de tabela (`hover:bg-blue-50/20`) sejam complementados com `active:bg-blue-50/40` para feedback imediato em touch.
4. THE Mobile_First SHALL garantir que botões com `hover:bg-*` também possuam `active:bg-*` correspondente para feedback em dispositivos touch.
5. WHEN um elemento interativo receber foco via teclado, THE Mobile_First SHALL garantir que o Focus_Ring (`focus-visible:ring-2 focus-visible:ring-offset-2`) seja visível em todos os elementos interativos.

---

### Requirement 14: Tipografia e Escala Responsiva

**User Story:** Como usuário acessando o sistema em diferentes dispositivos, quero que os textos sejam legíveis em qualquer tamanho de tela, para que eu possa ler informações sem precisar dar zoom.

#### Acceptance Criteria

1. THE Mobile_First SHALL garantir que títulos de página (`h1`) utilizem escala responsiva: `text-xl` em mobile, `text-2xl` em tablet, `text-3xl` em desktop, em vez de tamanho fixo.
2. THE Mobile_First SHALL garantir que títulos de seção (`h2`, `h3`) utilizem escala responsiva: `text-base` em mobile, `text-lg` em tablet, `text-xl` em desktop.
3. THE Mobile_First SHALL garantir que nenhum texto de conteúdo principal utilize tamanho inferior a `text-xs` (12px) em qualquer breakpoint.
4. THE OTAProgressDashboard SHALL garantir que os valores numéricos dos cards de estatísticas (`text-3xl font-black`) utilizem escala responsiva: `text-2xl` em mobile, `text-3xl` em desktop.
5. THE OTASettings SHALL garantir que o valor da versão da frota (`text-4xl font-black`) utilize escala responsiva: `text-3xl` em mobile, `text-4xl` em desktop.
6. THE Dashboard SHALL garantir que os valores dos StatCards (`text-2xl font-bold`) mantenham legibilidade em mobile sem truncamento.

---

### Requirement 15: Navegação e Fluxo Mobile — Experiência de Uma Mão

**User Story:** Como operador de fábrica usando o sistema com uma mão em um smartphone, quero que as ações principais estejam acessíveis na parte inferior da tela, para que eu possa operar o sistema sem precisar alcançar o topo da tela.

#### Acceptance Criteria

1. THE Mobile_First SHALL garantir que botões de ação primária (CTAs) em páginas de formulário sejam posicionados na parte inferior da tela em mobile, utilizando `sticky bottom-0` ou posicionamento fixo quando aplicável.
2. THE ProductionViewUI SHALL garantir que o botão "Solicitar AGORA" no modal de solicitação seja sempre visível na parte inferior do modal, sem ser coberto pelo teclado virtual em mobile.
3. THE Solicitacoes SHALL garantir que o botão de transferência em lote seja acessível sem scroll em mobile quando itens estiverem selecionados, utilizando posicionamento `sticky` ou `fixed` na parte inferior da tela.
4. THE Mobile_First SHALL garantir que a barra de filtros de qualquer página seja acessível via scroll horizontal em mobile, sem quebrar para múltiplas linhas que aumentariam a altura da página.
5. THE AndonGrid SHALL garantir que o botão "Acionar Andon" em cada card seja o elemento de maior destaque visual e área de toque, sendo o CTA principal da página para operadores mobile.

---

### Requirement 16: Performance e Otimização Mobile

**User Story:** Como usuário em rede móvel (3G/4G), quero que a interface carregue e responda rapidamente em dispositivos com recursos limitados, para que o sistema seja utilizável mesmo em condições de rede não ideais.

#### Acceptance Criteria

1. THE Mobile_First SHALL garantir que animações CSS (`transition`, `animate-*`) utilizem `prefers-reduced-motion` media query para desabilitar animações em dispositivos que solicitam movimento reduzido.
2. THE Mobile_First SHALL garantir que listas longas (fila de produção, lista de dispositivos, pendências) utilizem `max-h-*` com `overflow-y-auto` em vez de renderizar toda a lista sem scroll, evitando reflow excessivo em mobile.
3. THE Mobile_First SHALL garantir que o scroll horizontal em tabelas e filtros utilize `-webkit-overflow-scrolling: touch` (via `overflow-x-auto`) para scroll suave em iOS.
4. WHEN a largura da tela for inferior a 640px, THE Mobile_First SHALL garantir que sombras complexas (`shadow-xl`, `shadow-2xl`) sejam reduzidas para `shadow-md` ou `shadow-sm` para melhorar performance de renderização em dispositivos móveis.
5. THE Mobile_First SHALL garantir que o `backdrop-blur-sm` utilizado em overlays de modal seja aplicado apenas em dispositivos com suporte adequado, com fallback para `bg-slate-900/60` sem blur em dispositivos mais antigos.

