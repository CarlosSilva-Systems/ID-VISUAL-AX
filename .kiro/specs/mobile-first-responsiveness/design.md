# Design Document — Mobile-First Responsiveness

## Overview

Este documento descreve a arquitetura técnica para a reestruturação mobile-first sistemática do **ID Visual AX**. A estratégia cobre todos os componentes e páginas do sistema, garantindo responsividade absoluta nos breakpoints: Smartphones (320px–639px), Tablets (640px–1023px) e Desktop (1024px+).

A abordagem é **incremental e não-destrutiva**: os componentes existentes são refatorados in-place com classes Tailwind responsivas, e novos componentes reutilizáveis (`BottomSheet`, `ActionMenu`, `FilterBar`) são criados para substituir padrões não-responsivos.

Stack: React 18 + TypeScript + Tailwind CSS v4 + MUI v7 + Recharts. Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px).

---

## Architecture

### Estratégia de Camadas

```
┌─────────────────────────────────────────────────────────┐
│  Camada 1: Infraestrutura Global                        │
│  theme.css (safe-area, scrollbar-hide, @supports)       │
│  useReducedMotion hook                                  │
│  useBreakpoint hook                                     │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│  Camada 2: Componentes Primitivos Novos                 │
│  BottomSheet.tsx  ActionMenu.tsx  FilterBar.tsx         │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│  Camada 3: Refatoração de Componentes Existentes        │
│  Layout → Dashboard → Solicitacoes → DevicesPage        │
│  AndonPendencias → AndonGrid → OTA → Configuracoes      │
│  ProductionViewUI → AndonOperador → Modais              │
└─────────────────────────────────────────────────────────┘
```

### Estratégia de Z-Index

| Camada                        | Z-Index | Uso                                      |
|-------------------------------|---------|------------------------------------------|
| Overlay base (backdrop)       | z-40    | Fundo semitransparente de modais/sheets  |
| Bottom Sheet nível 1          | z-50    | Primeiro bottom sheet aberto             |
| Bottom Sheet nível 2          | z-60    | Sheet aninhado (ex: confirmação dentro de drawer) |
| Sidebar mobile                | z-50    | Painel lateral em mobile                 |
| Topbar                        | z-40    | Barra superior fixa                      |
| Notificações dropdown         | z-50    | Dropdown de notificações                 |

### Fluxo de Detecção de Breakpoint

```
window.matchMedia('(max-width: 639px)')  → isMobile
window.matchMedia('(max-width: 767px)')  → isSmall
window.matchMedia('(max-width: 1023px)') → isTablet
```

O hook `useBreakpoint` encapsula essa lógica e é usado apenas quando a lógica condicional não pode ser expressa via classes Tailwind (ex: renderização condicional de componentes inteiros como BottomSheet vs Drawer).

---

## Components and Interfaces

### 1. `useReducedMotion` Hook

```typescript
// frontend/src/hooks/useReducedMotion.ts
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState<boolean>(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}
```

**Uso:** Componentes com animações (`transition`, `animate-*`) consultam este hook e aplicam `duration-0` ou removem classes de animação quando `prefersReduced === true`.

---

### 2. `useBreakpoint` Hook

```typescript
// frontend/src/hooks/useBreakpoint.ts
type Breakpoint = 'mobile' | 'sm' | 'md' | 'lg' | 'xl';

export function useBreakpoint(): Breakpoint {
  const getBreakpoint = (): Breakpoint => {
    const w = window.innerWidth;
    if (w < 640) return 'mobile';
    if (w < 768) return 'sm';
    if (w < 1024) return 'md';
    if (w < 1280) return 'lg';
    return 'xl';
  };

  const [bp, setBp] = useState<Breakpoint>(getBreakpoint);

  useEffect(() => {
    const handler = () => setBp(getBreakpoint());
    window.addEventListener('resize', handler, { passive: true });
    return () => window.removeEventListener('resize', handler);
  }, []);

  return bp;
}
```

---

### 3. `useBottomSheet` Hook

Gerencia o estado de abertura/fechamento do BottomSheet com suporte a swipe down.

```typescript
// frontend/src/hooks/useBottomSheet.ts
interface UseBottomSheetOptions {
  onClose: () => void;
  swipeThreshold?: number; // default: 80px
}

interface UseBottomSheetReturn {
  isDragging: boolean;
  dragOffset: number;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  sheetStyle: React.CSSProperties;
}

export function useBottomSheet({
  onClose,
  swipeThreshold = 80,
}: UseBottomSheetOptions): UseBottomSheetReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    // Só permite arrastar para baixo (delta positivo)
    if (delta > 0) setDragOffset(delta);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsDragging(false);
    if (dragOffset >= swipeThreshold) {
      onClose();
    }
    setDragOffset(0);
  };

  const sheetStyle: React.CSSProperties = {
    transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
    transition: isDragging ? 'none' : 'transform 300ms ease-out',
  };

  return {
    isDragging,
    dragOffset,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    sheetStyle,
  };
}
```

**Detecção de swipe down:**
1. `touchstart` → registra `touchStartY`
2. `touchmove` → calcula `delta = currentY - startY`; se `delta > 0`, aplica `translateY(delta)` no sheet (feedback visual de arrasto)
3. `touchend` → se `delta >= 80px`, chama `onClose()`; caso contrário, anima de volta para posição original

---

### 4. `BottomSheet` Component

```typescript
// frontend/src/app/components/BottomSheet.tsx

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  /** Altura máxima. Default: '85vh' */
  maxHeight?: string;
  /** Nível de z-index: 1 = z-50, 2 = z-60. Default: 1 */
  level?: 1 | 2;
  /** Exibir drag handle. Default: true */
  showHandle?: boolean;
}
```

**Estrutura DOM:**

```
<div> <!-- Overlay: fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm -->
  <div> <!-- Sheet: fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl -->
    <div> <!-- Drag handle: w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 mb-2 -->
    <div> <!-- Header com título e botão fechar -->
    <div> <!-- Content: overflow-y-auto com max-h dinâmico -->
      <!-- max-h: calc(maxHeight - env(keyboard-inset-height, 0px)) -->
      {children}
    </div>
  </div>
</div>
```

**Animação de entrada/saída:**
- Entrada: `animate-in slide-in-from-bottom duration-300`
- Saída: `animate-out slide-out-to-bottom duration-200`
- Com `useReducedMotion`: `duration-0` em ambos

**Adaptação ao teclado virtual:**
```css
max-height: calc(var(--max-height, 85vh) - env(keyboard-inset-height, 0px));
```

---

### 5. `ActionMenu` Component

Substitui múltiplos ícones de ação em mobile por um botão "⋯" com dropdown.

```typescript
// frontend/src/app/components/ActionMenu.tsx

interface ActionMenuItem {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  /** Tamanho do botão trigger. Default: 'md' */
  size?: 'sm' | 'md';
  /** Posição do dropdown. Default: 'bottom-end' */
  align?: 'start' | 'end';
}
```

**Implementação:** Usa `@radix-ui/react-dropdown-menu` (já disponível no projeto). O botão trigger exibe `⋯` (MoreHorizontal do lucide-react) com `min-w-[44px] min-h-[44px]`.

---

### 6. `FilterBar` Component

Barra de filtros com scroll horizontal e scrollbar oculta.

```typescript
// frontend/src/app/components/FilterBar.tsx

interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterBarProps<T extends string> {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}
```

**CSS aplicado:**
```html
<div class="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
```

A classe `scrollbar-hide` é definida em `theme.css`:
```css
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

---

### 7. Refatorações de Componentes Existentes

#### 7.1 `Layout.tsx`

**Mudanças:**
- Sidebar: adicionar `overflow-y-auto` no `<nav>` (já existe parcialmente)
- Overlay: mudar de `bg-slate-900/40` para `bg-slate-900/50 backdrop-blur-sm` com `z-40`
- Sidebar width: `min(280px, 85vw)` via `style={{ width: 'min(280px, 85vw)' }}`
- Busca mobile: estado `isSearchOpen` — quando `true`, exibe input full-width e oculta Bell/avatar
- Topbar: ocultar badge "Odoo Conectado" e nome do usuário em `< 640px`
- Fechar sidebar ao navegar: já implementado via `onClick={() => setIsMobileMenuOpen(false)}` nos links

#### 7.2 `Dashboard.tsx`

**Mudanças:**
- StatCards: `grid-cols-2 sm:grid-cols-4 auto-rows-fr` (de `grid-cols-1 md:grid-cols-4`)
- DashboardRow: renderização condicional — abaixo de `md`, exibe card compacto com campos primários (status, MO, obra, data) e campos secundários colapsáveis
- Filtros: envolver em `<FilterBar>` com `scrollbar-hide`
- Campo de busca: `w-full md:w-80`
- ActiveBatches: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`

#### 7.3 `Solicitacoes.tsx`

**Mudanças:**
- Abaixo de `md`: substituir tabela por lista de cards com hierarquia: status badge → solicitante + MO → obra → botão ação
- Drawer de detalhes: renderizar como `<BottomSheet>` em `< md`, manter drawer lateral em `>= md`
- Cabeçalho: `flex-col sm:flex-row` com botão de transferência `w-full sm:w-auto`

#### 7.4 `DevicesPage.tsx`

**Mudanças:**
- Abaixo de `lg`: substituir tabela por Card View com `<ActionMenu>` agrupando os 5 ícones de ação
- SummaryCards: `grid-cols-2 lg:grid-cols-4`
- DeviceDrawer: renderizar como `<BottomSheet level={1}>` em `< md`; abas internas com `overflow-y-auto` independente

#### 7.5 `AndonPendenciasPage.tsx`

**Mudanças:**
- Abaixo de `lg`: Card View com `border-l-4` colorida (vermelho/amarelo)
- Filtros: colapsáveis em mobile via estado `isFiltersOpen`
- Cabeçalho de grupo: simplificado em mobile (nome + contador)

#### 7.6 `AndonGrid.tsx`

**Mudanças:**
- Hover: `@media (hover: hover)` para `hover:-translate-y-1`; `active:scale-[0.98]` em todos
- Tooltip IoT: substituir por label inline em `< lg`
- Cabeçalho: `flex-col sm:flex-row` com botão "Abrir TV" `w-full sm:w-auto` em `< sm`

#### 7.7 `OTASettings.tsx`

**Mudanças:**
- Container: `p-4 sm:p-6 lg:p-8` (de `p-8`)
- Tabela de releases: Card View em `< md`
- Botões de ação: `flex-col sm:flex-row` com `w-full sm:w-auto`
- Versão da frota: `text-3xl sm:text-4xl`

#### 7.8 `OTAProgressDashboard.tsx`

**Mudanças:**
- Container: `p-4 sm:p-6 lg:p-8` (de `p-8`)
- Stats: `grid-cols-2 md:grid-cols-4`
- Valores numéricos: `text-2xl sm:text-3xl`
- DeviceProgressItem: layout em coluna em `< md` (barra de progresso abaixo das infos)
- "Ver mais": exibir primeiros 10 e botão para carregar mais quando `devices.length > 10`

#### 7.9 `Configuracoes.tsx`

**Mudanças:**
- Abas: `flex-row overflow-x-auto` em mobile; ícone-only em `< 400px` via `w-full max-w-[400px]`
- Cabeçalho: `flex-col sm:flex-row`
- Grid de botões Odoo: `grid-cols-1 md:grid-cols-2`
- AndonSettings: Card View em `< md`

#### 7.10 `ProductionViewUI.tsx`

**Mudanças:**
- Modal: renderizar como `<BottomSheet>` em `< sm`; modal centralizado em `>= sm`
- Botão "Solicitar AGORA": `position: sticky; bottom: 0` dentro do scroll container; `h-14` em todos os breakpoints
- Campo de busca: `w-full` (remover `sm:w-80`)

#### 7.11 `AndonOperador.tsx`

**Mudanças:**
- Modal de motivo: renderizar como `<BottomSheet>` em `< sm`
- Grid de botões de cor: `grid-cols-3` com `min-h-[64px]` em mobile (de `grid-cols-1 md:grid-cols-3`)

#### 7.12 `ConfirmModal.tsx`

**Mudanças:**
- Em `< sm`: posicionar na parte inferior como bottom sheet (`rounded-t-2xl rounded-b-none`, `fixed bottom-0 left-0 right-0 w-full`)
- Em `>= sm`: manter modal centralizado atual
- Drag handle visual no topo em mobile

#### 7.13 `ModalPacote.tsx` e `JustificationModal.tsx`

**Mudanças:**
- Em `< sm`: renderizar como `<BottomSheet maxHeight="95vh">`
- Em `>= sm`: manter modal centralizado atual

---

## Data Models

### BottomSheet State

```typescript
interface BottomSheetState {
  isOpen: boolean;
  isDragging: boolean;
  dragOffset: number; // pixels arrastados para baixo
}
```

### ActionMenu Item

```typescript
interface ActionMenuItem {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  variant: 'default' | 'destructive';
  disabled: boolean;
}
```

### Breakpoint Enum

```typescript
type Breakpoint = 'mobile' | 'sm' | 'md' | 'lg' | 'xl';
// mobile: < 640px
// sm:     640px – 767px
// md:     768px – 1023px
// lg:     1024px – 1279px
// xl:     >= 1280px
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Swipe down fecha o BottomSheet

*Para qualquer* BottomSheet aberto, quando o usuário arrasta para baixo com deslocamento ≥ 80px, o callback `onClose` deve ser chamado exatamente uma vez.

**Validates: Requirements 5.4, 6.5, 12.1**

### Property 2: Swipe abaixo do threshold não fecha

*Para qualquer* BottomSheet aberto, quando o usuário arrasta para baixo com deslocamento < 80px e solta, o callback `onClose` não deve ser chamado.

**Validates: Requirements 5.4, 6.5, 12.1**

### Property 3: useReducedMotion reflete a media query

*Para qualquer* estado da media query `prefers-reduced-motion`, o hook `useReducedMotion` deve retornar `true` se e somente se a media query estiver ativa.

**Validates: Requirements 16.1**

---

## Error Handling

### BottomSheet

- Se `onClose` lançar exceção, o sheet permanece aberto (não fecha silenciosamente)
- Se `children` lançar erro de renderização, o sheet exibe um `ErrorBoundary` interno com mensagem genérica

### ActionMenu

- Se `onClick` de um item lançar exceção, o menu fecha e o erro é propagado para o `ErrorBoundary` pai
- Items com `disabled: true` não disparam `onClick`

### useBreakpoint

- SSR-safe: inicializa com `'lg'` como fallback quando `window` não está disponível
- Debounce de 100ms no handler de `resize` para evitar re-renders excessivos

### Virtualização (TanStack Virtual)

- Quando a lista tem ≤ 50 itens, renderiza normalmente sem virtualização
- Quando > 50 itens, usa `@tanstack/react-virtual` com `overscan: 5`
- Se a biblioteca não estiver disponível, fallback para renderização normal com `max-h` + `overflow-y-auto`

---

## Testing Strategy

### Abordagem

Este feature é predominantemente de **UI/CSS responsivo** — a maior parte das mudanças são classes Tailwind e estrutura de componentes. PBT é aplicável apenas para a lógica pura do hook `useBottomSheet` (detecção de swipe).

**Testes unitários (Vitest + Testing Library):**

1. `useBottomSheet` — lógica de swipe:
   - Swipe ≥ 80px chama `onClose`
   - Swipe < 80px não chama `onClose`
   - `dragOffset` é atualizado corretamente durante `touchmove`

2. `useReducedMotion` — leitura da media query:
   - Retorna `true` quando `prefers-reduced-motion: reduce` está ativo
   - Retorna `false` quando não está ativo

3. `BottomSheet` — renderização:
   - Exibe drag handle quando `showHandle={true}`
   - Aplica `z-50` no nível 1 e `z-60` no nível 2
   - Não renderiza quando `isOpen={false}`

4. `ActionMenu` — comportamento:
   - Renderiza todos os items passados
   - Item com `disabled={true}` não dispara `onClick`
   - Item com `variant="destructive"` recebe classe de cor vermelha

**Testes de propriedade (fast-check — já disponível no projeto):**

- Property 1 e 2: gerar valores aleatórios de `dragOffset` (0–200px) e verificar que `onClose` é chamado se e somente se `dragOffset >= 80`

**Testes de integração (manual / Playwright futuro):**

- Verificar que Sidebar fecha ao tocar overlay em mobile
- Verificar que BottomSheet fecha via swipe down em dispositivo real
- Verificar que ActionMenu abre e fecha corretamente em touch

**Não testado automaticamente (verificação visual):**

- Breakpoints CSS (verificação via DevTools)
- Touch targets de 44px (verificação via DevTools Accessibility)
- `scrollbar-hide` funcionando em iOS Safari
- `env(keyboard-inset-height)` adaptando ao teclado virtual
