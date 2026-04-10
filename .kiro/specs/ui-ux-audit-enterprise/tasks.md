# Plano de Implementação: UI/UX Audit Enterprise

## Visão Geral

Auditoria completa de UI/UX do frontend ID Visual AX, organizada em 10 fases incrementais — do mais crítico ao menos crítico. Cada fase constrói sobre a anterior, garantindo que tokens e componentes base estejam prontos antes das correções por página.

A fase 11 cobre os testes de propriedade com `fast-check`, validando invariantes das funções puras e componentes base.

---

## Tarefas

- [ ] 1. Fase 1 — Tokens CSS em `theme.css`
  - [ ] 1.1 Adicionar tokens de sombra semânticos (`--shadow-sm`, `--shadow-md`, `--shadow-lg`) e tokens de border-radius (`--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`) em `frontend/src/styles/theme.css`
    - Substituir valores hardcoded de sombra e radius por variáveis CSS
    - _Requirements: 1.1, 1.2, 13.1, 13.2, 13.3_
  - [ ] 1.2 Adicionar escala tipográfica semântica (`--text-xs` a `--text-2xl`) e keyframe + classe `animate-shimmer` para o efeito de skeleton loader
    - Eliminar tamanhos arbitrários `text-[9px]`, `text-[10px]`, `text-[11px]` da base
    - Animação shimmer: `background-size: 200% 100%`, duração `1.5s infinite`
    - _Requirements: 1.4, 6.4, 12.1_

- [ ] 2. Fase 2 — Componentes base em `ui.tsx`
  - [ ] 2.1 Atualizar `Button` em `frontend/src/app/components/ui.tsx`: adicionar `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500` em todos os variantes, substituir `disabled:pointer-events-none` por `disabled:cursor-not-allowed`, adicionar prop `isLoading?: boolean` que exibe `<Loader2 className="w-4 h-4 animate-spin" />`
    - _Requirements: 3.1, 3.5, 9.5, 10.5, 11.2_
  - [ ] 2.2 Atualizar `Badge` em `ui.tsx`: alterar `text-[11px]` → `text-xs` (12px mínimo) em todas as variantes
    - _Requirements: 12.4, 9.7_
  - [ ] 2.3 Atualizar `KPICard` em `ui.tsx`: alterar `text-[10px]` → `text-xs` no label e no subtext
    - _Requirements: 12.5_

- [ ] 3. Fase 3 — Novo componente `ConfirmModal`
  - [ ] 3.1 Criar `frontend/src/app/components/ConfirmModal.tsx` com interface `ConfirmModalProps` (isOpen, title, description, confirmLabel, cancelLabel, variant, isLoading, onConfirm, onCancel)
    - Overlay `bg-slate-900/50 backdrop-blur-sm`, `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apontando para o título
    - Variantes de cor: `destructive` → `bg-red-600`, `warning` → `bg-amber-600`, `success` → `bg-emerald-600`
    - _Requirements: 5.1, 5.2_
  - [ ] 3.2 Implementar focus trap no `ConfirmModal`: foco inicial no botão "Cancelar", navegação por Tab entre os botões, fechamento via tecla Escape e clique no overlay sem chamar `onConfirm`
    - _Requirements: 5.3, 5.4, 9.4_
  - [ ]* 3.3 Escrever testes de exemplo para `ConfirmModal` em `frontend/src/app/components/__tests__/ConfirmModal.test.tsx`
    - Testar: fecha via Escape sem chamar onConfirm, fecha via clique no overlay, focus trap ativo, foco inicial no botão Cancelar, exibe Loader2 quando isLoading=true
    - _Requirements: 5.3, 5.4_

- [ ] 4. Fase 4 — Novos componentes `SkeletonLoader` e `EmptyState`
  - [ ] 4.1 Criar `frontend/src/app/components/SkeletonLoader.tsx` com componente base `Skeleton` e variantes compostas: `SkeletonTableRow` (7 colunas), `SkeletonCard` (card de workcenter), `SkeletonKPICard`, `SkeletonListItem`
    - Usar classe `animate-shimmer` definida na Fase 1
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ] 4.2 Criar `frontend/src/app/components/EmptyState.tsx` com interface `EmptyStateProps` (icon, title, description?, action?, className?)
    - Visualmente distinto do skeleton e do estado de erro
    - Exibir botão CTA quando `action` for fornecido
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 5. Checkpoint — Fundação completa
  - Garantir que todos os testes passem. Verificar que `theme.css`, `ui.tsx`, `ConfirmModal`, `SkeletonLoader` e `EmptyState` compilam sem erros TypeScript. Perguntar ao usuário se há dúvidas antes de prosseguir.

- [ ] 6. Fase 5 — `Configuracoes.tsx`
  - [ ] 6.1 Remover bloco de debug `<div className="bg-yellow-100 ...">Debug:...</div>` e remover `console.log('Clicou na aba:', tab.id)` de `frontend/src/app/components/Configuracoes.tsx`
    - _Requirements: 4.1, 4.2_
  - [ ] 6.2 Substituir `window.confirm()` da ação "Resetar Banco de Dados" por `ConfirmModal` com `variant="destructive"` em `Configuracoes.tsx`
    - Adicionar estado `confirmReset: boolean`
    - _Requirements: 5.1, 5.5_
  - [ ] 6.3 Implementar responsividade de abas em `Configuracoes.tsx`: em mobile (< 768px) abas laterais → abas horizontais com `overflow-x-auto`; alterar `rounded-[2rem]` → `rounded-2xl` no painel de conteúdo
    - _Requirements: 13.2, 13.5, 18.3_
  - [ ] 6.4 Adicionar aviso de "Alterações não salvas" em `Configuracoes.tsx`: estado `hasUnsavedChanges`, exibir `ConfirmModal` ao tentar trocar de aba com mudanças pendentes
    - _Requirements: 18.4_

- [ ] 7. Fase 6 — `DevicesPage.tsx` e `ActiveBatch/index.tsx`
  - [ ] 7.1 Substituir `confirm()` das ações "Reiniciar ESP32" e "Remover Dispositivo" por `ConfirmModal` em `frontend/src/app/components/DevicesPage.tsx`
    - Adicionar estados `confirmRestart: ConfirmState<ESPDeviceEnriched>` e `confirmDelete: ConfirmState<ESPDeviceEnriched>`
    - Substituir spinner de loading por `<SkeletonTableRow>` × 5
    - _Requirements: 5.1, 5.6, 6.3_
  - [ ] 7.2 Substituir `confirm()` da ação "Finalizar Lote" por `ConfirmModal` em `frontend/src/components/ActiveBatch/index.tsx`
    - Alterar padding `px-8 pb-8` → `px-3 pb-3 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8`
    - Substituir `bg-[#F8F9FA]` → `bg-slate-50`
    - _Requirements: 1.5, 2.6, 5.1, 5.7_

- [ ] 8. Fase 7 — `Layout.tsx`
  - [ ] 8.1 Implementar melhorias de sidebar mobile em `frontend/src/app/components/Layout.tsx`: `useEffect` para bloquear `document.body.style.overflow = 'hidden'` quando `isMobileMenuOpen`, swipe handler com `onTouchStart`/`onTouchEnd` para fechar ao swipe esquerdo ≥ 50px
    - _Requirements: 2.1, 2.2, 14.1, 14.5_
  - [ ] 8.2 Adicionar `aria-label` nos botões icon-only do Topbar em `Layout.tsx`: Bell → `"Notificações"`, LogOut → `"Sair"`, Menu → `"Abrir menu"`
    - _Requirements: 8.5, 9.1_
  - [ ] 8.3 Implementar `SearchBar` responsivo em `Layout.tsx`: extrair campo de busca para componente interno com versão mobile (ícone que expande), substituir `hidden md:block` por versão visível em mobile
    - Alterar padding do main: `p-4 lg:p-8` → `p-3 sm:p-4 md:p-6 lg:p-8`
    - _Requirements: 2.3, 2.4_
  - [ ] 8.4 Implementar funcionalidade real do Bell de notificações em `Layout.tsx`: adicionar tipo `Notification` em `frontend/src/app/types.ts`, estado `notifications` e `isNotifOpen`, dropdown com lista, badge numérico quando `unreadCount > 0`, integração via WebSocket existente
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [ ]* 8.5 Escrever testes de exemplo para `Layout` em `frontend/src/app/components/__tests__/Layout.test.tsx`
    - Testar: aria-label do Bell, LogOut e Menu; botão de busca visível em mobile
    - _Requirements: 8.5, 9.1_

- [ ] 9. Fase 8 — `Dashboard.tsx`
  - [ ] 9.1 Atualizar `frontend/src/app/components/Dashboard.tsx`: alterar container `p-8 max-w-7xl mx-auto` → `p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto`; substituir `<Loader2>` centralizado por `<SkeletonKPICard>` × 4 + `<SkeletonListItem>` × 8
    - _Requirements: 2.5, 6.1, 11.3_
  - [ ] 9.2 Substituir texto italic de fila vazia por `<EmptyState icon={Package} title="Fila vazia" description="Nenhuma fabricação disponível no momento." />` em `Dashboard.tsx`
    - Alterar `bg-[#E53935]` → `bg-red-600` no badge de notificação
    - _Requirements: 1.5, 7.1_

- [ ] 10. Fase 9 — `AndonGrid.tsx`
  - [ ] 10.1 Atualizar `frontend/src/app/components/AndonGrid.tsx`: substituir loading simples por `<SkeletonCard>` × 8 em grid; alterar `rounded-[2rem]` → `rounded-3xl` nos cards; alterar `hover:shadow-xl` → `hover:shadow-md`
    - _Requirements: 6.2, 13.2, 13.4_
  - [ ] 10.2 Corrigir tipografia e acessibilidade em `AndonGrid.tsx`: labels `text-[10px]` → `text-xs`; adicionar `role="region"` com `aria-label={wc.name}` nos cards
    - _Requirements: 9.6, 12.3_

- [ ] 11. Fase 10 — `AndonPendenciasPage.tsx` e `AndonTV.tsx`
  - [ ] 11.1 Atualizar `frontend/src/app/components/AndonPendenciasPage.tsx`: substituir `<RefreshCw animate-spin>` por `<SkeletonListItem>` × 5; substituir `<AlertTriangle>` por `<EmptyState icon={CheckCircle2} title="Tudo em dia" description="Nenhuma pendência de justificativa no momento." />`
    - _Requirements: 6.1, 7.3_
  - [ ] 11.2 Atualizar `frontend/src/app/components/AndonTV.tsx`: adicionar estado `wsConnected: boolean` derivado do `AndonTVContext`; adicionar indicador de conexão WebSocket (ícone `Signal`/`SignalLow`) no canto superior; adicionar banner de reconexão quando `!wsConnected`
    - _Requirements: 15.2, 15.3_
  - [ ] 11.3 Adicionar `EmptyState` no painel `PanelMesasParadas` de `AndonTV.tsx` quando `calls.length === 0`; corrigir textos `text-[9px]` e `text-[11px]` → `text-xs` mínimo
    - _Requirements: 12.1, 15.1, 15.5_

- [ ] 12. Checkpoint — Páginas completas
  - Garantir que todos os testes passem e que não há erros TypeScript. Verificar que `window.confirm()` e `confirm()` foram completamente removidos dos componentes auditados. Perguntar ao usuário se há dúvidas antes de prosseguir para os testes de propriedade.

- [ ] 13. Fase 11 — Instalar `fast-check` e escrever testes de propriedade
  - [ ] 13.1 Instalar `fast-check` como dev dependency no frontend
    - Executar `npm install --save-dev fast-check` em `frontend/`
    - _Requirements: (infraestrutura de testes)_
  - [ ]* 13.2 Escrever teste de propriedade para `formatObraDisplayName` em `frontend/src/lib/__tests__/utils.property.test.ts`
    - **Propriedade 4: `formatObraDisplayName` nunca lança exceção para qualquer entrada**
    - **Valida: Requirements 17.1, 17.2**
    - Testar com `fc.anything()` (100 iterações); testar retorno de placeholder para `null`/`undefined`
  - [ ]* 13.3 Escrever testes de propriedade para `elapsed` e `fmtTime` em `frontend/src/lib/__tests__/andonTV.property.test.ts`
    - **Propriedade 5: `elapsed` retorna `"---"` para entradas inválidas**
    - **Valida: Requirements 17.3**
    - **Propriedade 6: `fmtTime` retorna string `HH:MM` para datas ISO válidas**
    - **Valida: Requirements 17.4**
    - Exportar `elapsed` e `fmtTime` de `AndonTV.tsx` para permitir teste unitário
  - [ ]* 13.4 Escrever testes de propriedade para `Badge` em `frontend/src/app/components/__tests__/Badge.property.test.tsx`
    - **Propriedade 3: `Badge` sempre usa tamanho de fonte ≥ 12px em todas as variantes**
    - **Valida: Requirements 12.4**
    - **Propriedade 8: `Badge` mantém contraste mínimo 4.5:1 em todas as variantes**
    - **Valida: Requirements 9.7**
    - Usar `fc.constantFrom(...BADGE_VARIANTS)` com 100 iterações
  - [ ]* 13.5 Escrever testes de propriedade para `ConfirmModal` em `frontend/src/app/components/__tests__/ConfirmModal.property.test.tsx`
    - **Propriedade 1: `ConfirmModal` sempre exibe todos os elementos obrigatórios para qualquer combinação de props válidas**
    - **Valida: Requirements 5.2**
    - **Propriedade 2: Ações destrutivas nunca chamam `window.confirm()`**
    - **Valida: Requirements 5.1, 5.5, 5.6, 5.7**
    - Usar `fc.record({ title: fc.string({ minLength: 1 }), description: fc.string(), variant: fc.constantFrom('destructive', 'warning', 'success') })` com 100 iterações

- [ ] 14. Checkpoint final — Garantir qualidade
  - Garantir que todos os testes passem (`npm run test -- --run` em `frontend/`). Verificar ausência de erros TypeScript com `tsc --noEmit`. Confirmar que nenhum `window.confirm()`, `console.log` de debug ou bloco de debug visual permanece no código. Perguntar ao usuário se há ajustes finais.

---

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia os requisitos específicos para rastreabilidade
- A ordem das fases é intencional: tokens → componentes base → novos componentes → páginas → testes
- Checkpoints garantem validação incremental antes de avançar para a próxima camada
- Testes de propriedade usam `fast-check` com mínimo de 100 iterações por propriedade
- Testes de exemplo usam Vitest + Testing Library (já presentes no projeto via Vite)
