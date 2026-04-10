# Tasks — Mobile-First Responsiveness

## Implementation Plan

As tarefas estão organizadas em **5 fases incrementais**, do mais fundamental ao mais específico. Cada fase é independente e entregável — o sistema permanece funcional após cada fase concluída.

---

## Phase 1: Infraestrutura Global

- [x] 1.1 Adicionar utilitários CSS globais em `theme.css`
  - Classe `.scrollbar-hide` (`-ms-overflow-style: none; scrollbar-width: none; &::-webkit-scrollbar { display: none }`)
  - Regras `safe-area-inset` para containers de página (`.page-container { padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }`)
  - Regra `@supports (backdrop-filter: blur(4px))` com fallback `bg-slate-900/60` para overlays sem blur
  - Regra `@media (prefers-reduced-motion: reduce)` global para desabilitar `transition` e `animation`
  - **Requisitos:** 1.7, 13.3, 16.3, 16.5

- [x] 1.2 Criar hook `useReducedMotion`
  - Arquivo: `frontend/src/hooks/useReducedMotion.ts`
  - Lê `window.matchMedia('(prefers-reduced-motion: reduce)')`
  - Atualiza via `addEventListener('change', ...)`
  - **Requisitos:** 16.1

- [x] 1.3 Criar hook `useBreakpoint`
  - Arquivo: `frontend/src/hooks/useBreakpoint.ts`
  - Retorna `'mobile' | 'sm' | 'md' | 'lg' | 'xl'`
  - SSR-safe (fallback `'lg'` quando `window` não disponível)
  - Debounce de 100ms no handler de resize
  - **Requisitos:** 3.1, 5.4, 6.5

- [x] 1.4 Criar hook `useBottomSheet`
  - Arquivo: `frontend/src/hooks/useBottomSheet.ts`
  - Gerencia `isDragging`, `dragOffset`, handlers de touch
  - Threshold de 80px para fechar via swipe down
  - Retorna `sheetStyle` com `translateY` durante arrasto
  - **Requisitos:** 5.4, 6.5, 12.1, 12.3, 12.4, 12.8

---

## Phase 2: Novos Componentes Primitivos

- [x] 2.1 Criar componente `BottomSheet`
  - Arquivo: `frontend/src/app/components/BottomSheet.tsx`
  - Props: `isOpen`, `onClose`, `children`, `title?`, `maxHeight?`, `level?` (1|2), `showHandle?`
  - Overlay com `z-40`, sheet com `z-50` (nível 1) ou `z-60` (nível 2)
  - Drag handle visual (`w-10 h-1 bg-slate-300 rounded-full`)
  - Animação `slide-in-from-bottom` / `slide-out-to-bottom` com `useReducedMotion`
  - `max-height: calc(var(--max-height) - env(keyboard-inset-height, 0px))`
  - Fechar ao clicar no overlay
  - **Requisitos:** 5.4, 6.5, 10.1, 12.1, 12.3, 12.4, 12.7, 12.8

- [x] 2.2 Criar componente `ActionMenu`
  - Arquivo: `frontend/src/app/components/ActionMenu.tsx`
  - Usa `@radix-ui/react-dropdown-menu` (já disponível)
  - Botão trigger: ícone `MoreHorizontal` com `min-w-[44px] min-h-[44px]`
  - Props: `items: ActionMenuItem[]`, `size?`, `align?`
  - Item com `variant="destructive"` recebe cor vermelha
  - **Requisitos:** 6.1, 6.3

- [x] 2.3 Criar componente `FilterBar`
  - Arquivo: `frontend/src/app/components/FilterBar.tsx`
  - Scroll horizontal com `scrollbar-hide`
  - Negative margin `-mx-3 px-3` para sangrar até a borda em mobile
  - Props genéricas `FilterBarProps<T extends string>`
  - **Requisitos:** 4.4, 7.3

- [ ] 2.4 Escrever testes unitários para hooks e componentes novos
  - Arquivo: `frontend/src/app/components/__tests__/useBottomSheet.test.ts`
  - Testar: swipe ≥ 80px chama `onClose`; swipe < 80px não chama
  - Arquivo: `frontend/src/app/components/__tests__/useReducedMotion.test.ts`
  - Testar: retorna `true`/`false` conforme media query
  - Arquivo: `frontend/src/app/components/__tests__/BottomSheet.test.tsx`
  - Testar: renderização, drag handle, z-index por nível
  - Arquivo: `frontend/src/app/components/__tests__/ActionMenu.test.tsx`
  - Testar: items renderizados, disabled não dispara onClick
  - **Requisitos:** 5.4, 12.1, 16.1

---

## Phase 3: Layout Global e Navegação

- [x] 3.1 Refatorar `Layout.tsx` — Sidebar mobile
  - Largura: `style={{ width: 'min(280px, 85vw)' }}`
  - Overlay: `bg-slate-900/50 backdrop-blur-sm z-40`
  - `overflow-y-auto` no `<nav>` (verificar e garantir)
  - Fechar ao tocar overlay: já implementado, verificar
  - **Requisitos:** 3.1, 3.2, 3.3, 3.6, 3.8

- [x] 3.2 Refatorar `Layout.tsx` — Topbar busca expansível mobile
  - Estado `isSearchOpen: boolean`
  - Quando `isSearchOpen`: exibir input `w-full` + botão fechar (×); ocultar Bell e avatar
  - Quando fechado: exibir ícone de busca clicável
  - **Requisitos:** 3.4

- [x] 3.3 Refatorar `Layout.tsx` — Topbar elementos mobile
  - Ocultar badge "Odoo Conectado" em `< sm` (`hidden sm:flex`)
  - Ocultar nome do usuário em `< sm` (`hidden md:flex`)
  - Manter Bell, avatar e logout visíveis em todos os breakpoints
  - **Requisitos:** 3.5

- [x] 3.4 Refatorar `Layout.tsx` — Touch targets da Sidebar
  - Garantir `h-11` (44px) em todos os itens de menu (`renderMenuItem`)
  - Garantir `h-11` no botão de toggle de grupo
  - **Requisitos:** 2.6, 3.7

---

## Phase 4: Páginas Principais

- [x] 4.1 Refatorar `Dashboard.tsx` — StatCards e filtros
  - StatCards: `grid-cols-2 sm:grid-cols-4 auto-rows-fr`
  - Filtros: substituir por `<FilterBar>` com `scrollbar-hide`
  - Campo de busca: `w-full md:w-80`
  - ActiveBatches: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
  - **Requisitos:** 4.1, 4.2, 4.4, 4.5, 4.7

- [x] 4.2 Refatorar `Dashboard.tsx` — DashboardRow mobile
  - Abaixo de `md`: card compacto com campos primários (status, MO, obra, data)
  - Campos secundários (responsável, etapa) colapsáveis via "ver mais"
  - Botão "Criar Lote": `w-full` em mobile, `h-11` mínimo
  - **Requisitos:** 4.3, 4.6

- [x] 4.3 Refatorar `Solicitacoes.tsx` — Card View mobile
  - Abaixo de `md`: lista de cards com hierarquia: status → solicitante + MO → obra → botão
  - Cabeçalho: `flex-col sm:flex-row`, botão transferência `w-full sm:w-auto`
  - Barra de filtros: empilhar verticalmente em mobile, busca `w-full`
  - Botão "Transferir" por card: `min-h-[44px]`
  - Checkboxes: padding para área de toque `44×44px`
  - **Requisitos:** 5.1, 5.2, 5.3, 5.5, 5.6

- [x] 4.4 Refatorar `Solicitacoes.tsx` — Bottom sheet para drawer
  - Usar `useBreakpoint` para detectar `< md`
  - Em mobile: renderizar drawer como `<BottomSheet maxHeight="85vh">`
  - Em desktop: manter drawer lateral atual
  - **Requisitos:** 5.4

- [x] 4.5 Refatorar `DevicesPage.tsx` — Card View e ActionMenu
  - Abaixo de `lg`: Card View com nome, MAC, status, workcenter, firmware + `<ActionMenu>`
  - `ActionMenu` agrupa: editar, logs, sync, reiniciar, remover
  - SummaryCards: `grid-cols-2 lg:grid-cols-4`
  - Cabeçalho: `flex-col sm:flex-row`, botão Atualizar `w-full sm:w-auto`
  - **Requisitos:** 6.1, 6.2, 6.3, 6.4, 6.6

- [x] 4.6 Refatorar `DevicesPage.tsx` — Bottom sheet para DeviceDrawer
  - Em `< md`: renderizar `DeviceDrawer` como `<BottomSheet maxHeight="90vh">`
  - Abas internas: cada aba com `overflow-y-auto` independente
  - **Requisitos:** 6.5

- [x] 4.7 Refatorar `AndonPendenciasPage.tsx` — Card View e filtros
  - Abaixo de `lg`: Card View com `border-l-4` colorida (vermelho/amarelo)
  - Cabeçalho de grupo: simplificado em mobile (nome + contador)
  - Filtros: colapsáveis via botão "🔍 Filtros" em mobile
  - Cabeçalho da página: `flex-col sm:flex-row`
  - Botão "Justificar": `min-h-[44px]`
  - **Requisitos:** 7.1, 7.2, 7.3, 7.4, 7.5

---

## Phase 5: Componentes Secundários e Modais

- [x] 5.1 Refatorar `AndonGrid.tsx` — Hover e touch
  - Substituir `hover:-translate-y-1` por `@media (hover: hover) { &:hover { --tw-translate-y: -0.25rem; } }`
  - Adicionar `active:scale-[0.98]` em todos os cards
  - Tooltip IoT: substituir por label inline em `< lg`
  - Cabeçalho: `flex-col sm:flex-row`, botão "Abrir TV" `w-full sm:w-auto` em `< sm`
  - **Requisitos:** 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 13.2

- [x] 5.2 Refatorar `OTASettings.tsx` — Responsividade
  - Container: `p-4 sm:p-6 lg:p-8`
  - Tabela de releases: Card View em `< md`
  - Botões de ação: `flex-col sm:flex-row`, `w-full sm:w-auto`, `min-h-[44px]`
  - Versão da frota: `text-3xl sm:text-4xl`
  - **Requisitos:** 8.1, 8.2, 8.3, 14.5

- [x] 5.3 Refatorar `OTAProgressDashboard.tsx` — Responsividade
  - Container: `p-4 sm:p-6 lg:p-8`
  - Stats: `grid-cols-2 md:grid-cols-4`
  - Valores numéricos: `text-2xl sm:text-3xl`
  - DeviceProgressItem: layout em coluna em `< md`
  - "Ver mais": estado `showAll`, exibir primeiros 10 + botão quando `devices.length > 10`
  - **Requisitos:** 8.5, 8.6, 8.7, 8.8, 14.4

- [x] 5.4 Refatorar `Configuracoes.tsx` — Abas e formulários
  - Abas: `flex-row overflow-x-auto scrollbar-hide` em mobile
  - Abas ícone-only em `< 400px` (usar `useBreakpoint` ou CSS `@container`)
  - Cabeçalho: `flex-col sm:flex-row`, botão "Salvar" `w-full sm:w-auto min-h-[44px]`
  - Grid Odoo: `grid-cols-1 md:grid-cols-2`
  - AndonSettings: Card View em `< md`
  - **Requisitos:** 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7

- [x] 5.5 Refatorar `ProductionViewUI.tsx` — Bottom sheet e CTA
  - Modal: `<BottomSheet>` em `< sm`, modal centralizado em `>= sm`
  - Botão "Solicitar AGORA": `position: sticky; bottom: 0` dentro do scroll container; `h-14`
  - Campo de busca: `w-full` (remover `sm:w-80`)
  - Grid de tipos/itens: `grid-cols-2` com `min-h-[44px]`
  - **Requisitos:** 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 15.2

- [x] 5.6 Refatorar `AndonOperador.tsx` — Bottom sheet e grid mobile
  - Modal de motivo: `<BottomSheet>` em `< sm`
  - Grid de botões de cor: `grid-cols-3` com `min-h-[64px]` em mobile
  - **Requisitos:** 12.8

- [x] 5.7 Refatorar `ConfirmModal.tsx` — Bottom sheet mobile
  - Em `< sm`: `fixed bottom-0 left-0 right-0 w-full rounded-t-2xl rounded-b-none z-50`
  - Drag handle visual no topo
  - Usar `useBottomSheet` para swipe down
  - Em `>= sm`: manter modal centralizado atual
  - Botões: `min-h-[44px]`
  - **Requisitos:** 12.1, 12.2

- [x] 5.8 Refatorar `ModalPacote.tsx` e `JustificationModal.tsx` — Bottom sheets
  - Em `< sm`: renderizar como `<BottomSheet maxHeight="95vh">`
  - Em `>= sm`: manter modal centralizado atual
  - **Requisitos:** 12.3, 12.4

- [x] 5.9 Aplicar tipografia responsiva global
  - Títulos de página (`h1`): `text-xl sm:text-2xl lg:text-3xl`
  - Títulos de seção (`h2`, `h3`): `text-base sm:text-lg lg:text-xl`
  - Títulos de modais/drawers: `text-base lg:text-lg`
  - Verificar que nenhum texto usa `< text-xs`
  - **Requisitos:** 14.1, 14.2, 14.3, 14.6, 14.7

- [x] 5.10 Implementar virtualização para listas longas
  - Instalar `@tanstack/react-virtual` via `npm install @tanstack/react-virtual`
  - Aplicar em: fila de produção (`Dashboard`), lista de dispositivos (`DevicesPage`), histórico de chamados Andon
  - Threshold: ativar virtualização quando `items.length > 50`
  - `overscan: 5` para scroll suave
  - **Requisitos:** 16.6

- [x] 5.11 Aplicar touch targets globais e hover/active states
  - Todos os botões de ação primária: `min-h-[44px]`
  - Botões icon-only em `< md`: `min-w-[44px] min-h-[44px]`
  - Campos de formulário em `< md`: `min-h-[44px]`
  - Checkboxes: padding para área de toque `44×44px`
  - Adicionar `active:bg-*` correspondente a todos os `hover:bg-*`
  - Usar `@media (hover: none)` para evitar hover "grudado" em iOS
  - **Requisitos:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 13.3, 13.4

- [x] 5.12 Refatorar `AndonOEEDashboard.tsx` — Gráficos responsivos
  - Todos os gráficos Recharts: `<ResponsiveContainer width="100%" height="100%">`
  - Container dos gráficos: `h-48 sm:h-64`
  - Eliminar dimensões fixas em pixels nos gráficos
  - **Requisitos:** 17.1

- [x] 5.13 Aplicar sombras reduzidas em mobile
  - Substituir `shadow-xl` por `shadow-md sm:shadow-xl` nos cards principais
  - Substituir `shadow-2xl` por `shadow-md sm:shadow-2xl` nos modais
  - Usar classes Tailwind condicionais (não JavaScript)
  - **Requisitos:** 16.4
