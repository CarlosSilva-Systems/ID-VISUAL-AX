# Design Document — UI/UX Audit Enterprise

## Overview

Este documento descreve o design técnico da auditoria completa de UI/UX do sistema **ID Visual AX**. O objetivo é elevar a interface ao padrão enterprise: design system coeso, responsividade Mobile First, acessibilidade mínima garantida (WCAG 2.1 AA), remoção de código de debug e substituição de APIs nativas do navegador (`window.confirm()`) por componentes React consistentes.

A implementação é dividida em três camadas:

1. **Fundação** — tokens CSS em `theme.css` e componentes base em `ui.tsx`
2. **Componentes Novos** — `ConfirmModal`, `SkeletonLoader`, `EmptyState`
3. **Correções por Página** — cada um dos 13 componentes auditados

Stack: React 18 + TypeScript + Tailwind CSS v4 + Vite 6. Sem novas dependências externas além das já instaladas.

---

## Architecture

A auditoria segue uma estratégia de **correção incremental por camada**, garantindo que mudanças na fundação (tokens, componentes base) se propaguem automaticamente para as páginas.

```
theme.css (tokens)
    └── ui.tsx (Button, Badge, Card, KPICard, Input, Tooltip)
            └── Novos componentes (ConfirmModal, SkeletonLoader, EmptyState)
                    └── Páginas (Layout, Dashboard, AndonGrid, Configuracoes, ...)
```

### Fases de Implementação

| Fase | Escopo | Prioridade |
|------|--------|-----------|
| 1 | `theme.css` — tokens de sombra, radius, tipografia | Crítica |
| 2 | `ui.tsx` — focus rings, cursor-not-allowed, tamanhos mínimos | Crítica |
| 3 | `ConfirmModal` — novo componente reutilizável | Crítica |
| 4 | `SkeletonLoader` + `EmptyState` — novos componentes | Alta |
| 5 | `Configuracoes.tsx` — remoção de debug, modal, responsividade | Crítica |
| 6 | `DevicesPage.tsx` + `ActiveBatch` — substituição de confirm() | Alta |
| 7 | `Layout.tsx` — sidebar mobile, aria-labels, busca mobile | Alta |
| 8 | `Dashboard.tsx` — padding responsivo, skeletons | Média |
| 9 | `AndonGrid.tsx` — skeletons, hover, tipografia | Média |
| 10 | `AndonPendenciasPage.tsx` + `AndonTV.tsx` — empty states, WS indicator | Média |

---

## Components and Interfaces

### 3.1 ConfirmModal

Componente modal reutilizável que substitui todos os `window.confirm()` e `confirm()` nativos.

```typescript
// frontend/src/app/components/ConfirmModal.tsx

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;       // default: "Confirmar"
  cancelLabel?: string;        // default: "Cancelar"
  variant?: "destructive" | "warning" | "success"; // default: "destructive"
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
```

**Comportamento:**
- Renderiza sobre um overlay `bg-slate-900/50 backdrop-blur-sm`
- Focus trap: ao abrir, foco vai para o botão "Cancelar" (mais seguro)
- Fecha ao pressionar `Escape` ou clicar no overlay
- Não executa `onConfirm` ao fechar via Escape/overlay
- Usa `role="dialog"` e `aria-modal="true"` com `aria-labelledby` apontando para o título

**Variantes de cor do botão de confirmação:**
- `destructive` → `bg-red-600 hover:bg-red-700`
- `warning` → `bg-amber-600 hover:bg-amber-700`
- `success` → `bg-emerald-600 hover:bg-emerald-700`

### 3.2 SkeletonLoader

Componente de placeholder animado com shimmer.

```typescript
// frontend/src/app/components/SkeletonLoader.tsx

interface SkeletonProps {
  className?: string;
}

// Componente base
export const Skeleton = ({ className }: SkeletonProps) => { ... }

// Variantes compostas
export const SkeletonTableRow = () => { ... }   // linha de tabela (7 colunas)
export const SkeletonCard = () => { ... }        // card de workcenter (AndonGrid)
export const SkeletonKPICard = () => { ... }     // card de KPI (Dashboard)
export const SkeletonListItem = () => { ... }    // item de lista genérico
```

**Animação shimmer:**
```css
/* Adicionado em theme.css */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.animate-shimmer {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

### 3.3 EmptyState

Componente padronizado para estados vazios.

```typescript
// frontend/src/app/components/EmptyState.tsx

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}
```

### 3.4 Alterações em ui.tsx

**Button** — adicionar:
- `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500` em todos os variantes
- `disabled:cursor-not-allowed` (remover `disabled:pointer-events-none` que suprime o cursor)
- Prop `isLoading?: boolean` que exibe `<Loader2 className="w-4 h-4 animate-spin" />` no lugar do conteúdo

**Badge** — alterar:
- `text-[11px]` → `text-xs` (12px mínimo)
- Adicionar `focus-visible:ring-2` quando usado como elemento interativo

**KPICard** — alterar:
- `text-[10px]` no label → `text-xs`
- `text-[10px]` no subtext → `text-xs`

### 3.5 Alterações em Layout.tsx

**Sidebar mobile:**
- Adicionar `transition-transform duration-300 ease-in-out` (já existe `transition-all duration-300`, manter)
- Adicionar `useEffect` para bloquear `document.body.style.overflow = 'hidden'` quando `isMobileMenuOpen`
- Implementar swipe handler com `onTouchStart`/`onTouchEnd` para fechar ao swipe esquerdo ≥ 50px

**Topbar:**
- Botão Bell: adicionar `aria-label="Notificações"`
- Botão LogOut: adicionar `aria-label="Sair"`
- Botão Menu (mobile): adicionar `aria-label="Abrir menu"`
- Campo de busca: extrair para componente `SearchBar` com versão mobile (ícone que expande)
- Adicionar `SearchBar` visível em mobile (substituir `hidden md:block`)

**Main:**
- `p-4 lg:p-8` → `p-3 sm:p-4 md:p-6 lg:p-8`

**Notificações Bell (Requirement 8):**
- Adicionar estado `notifications: Notification[]` e `isNotifOpen: boolean`
- Dropdown renderizado abaixo do Bell com lista de notificações
- Badge numérico sobre o Bell quando `unreadCount > 0`
- Integração via WebSocket existente (`/devices/ws`) — escutar eventos relevantes

### 3.6 Alterações em Dashboard.tsx

- Container: `p-8 max-w-7xl mx-auto` → `p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto`
- Loading state: substituir `<Loader2>` centralizado por `<SkeletonKPICard>` × 4 + `<SkeletonListItem>` × 8
- Empty state da fila: substituir texto italic por `<EmptyState icon={Package} title="Fila vazia" description="Nenhuma fabricação disponível no momento." />`
- Badge de notificação: `bg-[#E53935]` → `bg-red-600` (classe semântica Tailwind)

### 3.7 Alterações em Configuracoes.tsx

**Remoção de debug (Requirement 4):**
- Remover completamente o bloco `<div className="bg-yellow-100 border border-yellow-300 ...">Debug:...</div>`
- Remover `console.log('Clicou na aba:', tab.id)` do handler de clique

**Substituição de window.confirm() (Requirement 5):**
- Adicionar estado `confirmReset: boolean`
- Substituir `window.confirm(...)` por `setConfirmReset(true)`
- Renderizar `<ConfirmModal isOpen={confirmReset} title="Limpar Base de Dados Local" description="Isso apagará TODOS os dados locais..." variant="destructive" onConfirm={handleReset} onCancel={() => setConfirmReset(false)} />`

**Responsividade de abas (Requirement 18):**
- Em mobile (< 768px): abas laterais → abas horizontais com `overflow-x-auto`
- `rounded-[2rem]` → `rounded-2xl` no painel de conteúdo

**Unsaved changes warning (Requirement 18.4):**
- Adicionar estado `hasUnsavedChanges: boolean`
- Ao clicar em outra aba com `hasUnsavedChanges`, exibir `ConfirmModal` de aviso

### 3.8 Alterações em DevicesPage.tsx

- `handleRestart`: remover `confirm()`, adicionar estado `confirmRestart: ESPDeviceEnriched | null`
- `handleDelete`: remover `confirm()`, adicionar estado `confirmDelete: ESPDeviceEnriched | null`
- Loading state: substituir spinner por `<SkeletonTableRow>` × 5
- Renderizar dois `<ConfirmModal>` condicionais para restart e delete

### 3.9 Alterações em ActiveBatch/index.tsx

- `handleFinalizeBatch`: remover `confirm()`, usar `ConfirmModal` (já existe `confirmAction` state no Dashboard — replicar padrão)
- `px-8 pb-8` → `px-3 pb-3 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8`
- `bg-[#F8F9FA]` → `bg-slate-50`

### 3.10 Alterações em AndonGrid.tsx

- Loading state: substituir texto simples por `<SkeletonCard>` × 8 em grid
- `rounded-[2rem]` → `rounded-3xl` nos cards
- `hover:shadow-xl` → `hover:shadow-md`
- Labels `text-[10px]` → `text-xs`
- Cards: adicionar `role="region"` com `aria-label={wc.name}` para acessibilidade

### 3.11 Alterações em AndonPendenciasPage.tsx

- Loading state: substituir `<RefreshCw animate-spin>` por `<SkeletonListItem>` × 5
- Empty state: substituir `<AlertTriangle>` por `<EmptyState icon={CheckCircle2} title="Tudo em dia" description="Nenhuma pendência de justificativa no momento." />`

### 3.12 Alterações em AndonTV.tsx

- Adicionar indicador de conexão WebSocket: ícone `Signal` (verde) / `SignalLow` (vermelho) no canto superior
- Adicionar estado `wsConnected: boolean` derivado do contexto `AndonTVContext`
- Banner de reconexão: quando `!wsConnected`, exibir faixa amarela no topo com "Conexão perdida — reconectando..."
- `PanelMesasParadas` com `calls.length === 0`: substituir ausência de conteúdo por `<EmptyState icon={CheckCircle2} title="Todas as mesas em operação normal" />`
- Textos `text-[9px]` e `text-[11px]` → `text-xs` mínimo

---

## Data Models

### Notification (novo tipo para o Bell)

```typescript
// frontend/src/app/types.ts — adicionar

interface Notification {
  id: string;
  type: 'andon_call' | 'justification_required' | 'device_offline' | 'batch_complete';
  title: string;
  description: string;
  href: string;           // rota para navegar ao clicar
  isRead: boolean;
  createdAt: string;      // ISO 8601
}
```

### ConfirmModalState (padrão de uso nos componentes)

```typescript
// Padrão de estado para componentes que usam ConfirmModal
interface ConfirmState<T = void> {
  isOpen: boolean;
  payload: T | null;      // dados do item a ser confirmado (ex: device, batchId)
}

// Uso:
const [confirmDelete, setConfirmDelete] = useState<ConfirmState<ESPDeviceEnriched>>({
  isOpen: false,
  payload: null,
});
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: ConfirmModal sempre exibe todos os elementos obrigatórios

*Para qualquer* combinação de props válidas de `ConfirmModal` (título não vazio, descrição, variante), o componente renderizado SHALL conter: um elemento com o título, um elemento com a descrição, um botão de cancelamento e um botão de confirmação com cor semântica correspondente à variante.

**Validates: Requirements 5.2**

### Property 2: Ações destrutivas nunca chamam window.confirm()

*Para qualquer* ação destrutiva registrada nos componentes auditados (Configuracoes, DevicesPage, ActiveBatch), acionar o handler da ação SHALL resultar na abertura do `ConfirmModal` e nunca na chamada de `window.confirm()` ou `confirm()`.

**Validates: Requirements 5.1, 5.5, 5.6, 5.7**

### Property 3: Badge sempre usa tamanho de fonte mínimo text-xs

*Para qualquer* variante de `Badge` (default, success, warning, error, info, neutral, urgent), o tamanho de fonte computado SHALL ser maior ou igual a 12px.

**Validates: Requirements 12.4**

### Property 4: formatObraDisplayName nunca lança exceção

*Para qualquer* valor de entrada (string válida, string vazia, null, undefined, número, objeto), a função `formatObraDisplayName` SHALL retornar uma string sem lançar exceção. Para entradas null ou undefined, SHALL retornar o placeholder padrão ("—" ou "Sem obra").

**Validates: Requirements 17.1, 17.2**

### Property 5: elapsed e fmtTime retornam fallback para entradas inválidas

*Para qualquer* entrada inválida passada às funções `elapsed` e `fmtTime` do `AndonTV` (null, undefined, string não-ISO, número, objeto), as funções SHALL retornar os valores de fallback definidos ("---" e "--:--" respectivamente) sem lançar exceção.

**Validates: Requirements 17.3**

### Property 6: fmtTime produz saída formatada consistente para datas ISO válidas

*Para qualquer* string de data ISO 8601 válida, `fmtTime` SHALL retornar uma string no formato "HH:MM" (dois dígitos para hora e minuto, separados por ":") sem lançar exceção.

**Validates: Requirements 17.4**

### Property 7: Botões icon-only no Topbar sempre possuem aria-label

*Para qualquer* renderização do componente `Layout` (independente do usuário logado, estado de conexão ou contagem de notificações), todos os botões icon-only (Bell, LogOut, Menu) SHALL possuir atributo `aria-label` não vazio.

**Validates: Requirements 9.1**

### Property 8: Badge mantém contraste mínimo 4.5:1 em todas as variantes

*Para qualquer* variante de `Badge`, o ratio de contraste entre a cor do texto e a cor de fundo SHALL ser maior ou igual a 4.5:1, conforme WCAG 2.1 AA.

**Validates: Requirements 9.7**

---

## Error Handling

### Erros de Carregamento de Dados

Todos os componentes que fazem fetch de dados devem seguir o padrão:

```typescript
// Estado de erro explícito
const [error, setError] = useState<string | null>(null);

// No catch:
setError('Mensagem amigável em pt-BR');
toast.error('Mensagem amigável');

// No render: exibir EmptyState com variante de erro quando error !== null
```

### ConfirmModal — Erros na Ação Confirmada

O `ConfirmModal` não gerencia erros internamente. O componente pai é responsável por:
1. Chamar `onConfirm`
2. Aguardar a Promise
3. Exibir toast de erro se a Promise rejeitar
4. Fechar o modal apenas em caso de sucesso

```typescript
const handleConfirm = async () => {
  try {
    await api.deleteDevice(confirmDelete.payload!.id);
    toast.success('Dispositivo removido');
    setConfirmDelete({ isOpen: false, payload: null });
  } catch (err) {
    toast.error('Erro ao remover dispositivo');
    // Modal permanece aberto para nova tentativa
  }
};
```

### WebSocket — Reconexão Automática

O indicador de conexão no `AndonTV` deve refletir o estado real do WebSocket. A lógica de reconexão já existe no `AndonTVContext` — apenas expor o estado `isConnected` via contexto.

---

## Testing Strategy

### Abordagem Dual

A estratégia combina testes de exemplo (comportamentos específicos) com testes de propriedade (invariantes universais).

**Testes de Exemplo** — cobrem:
- Renderização condicional (loading, empty, error states)
- Interações de UI (clique, teclado, swipe)
- Acessibilidade (aria-labels, focus trap, tab order)
- Substituição de `window.confirm()` por `ConfirmModal`

**Testes de Propriedade** — cobrem:
- Funções puras de formatação (`formatObraDisplayName`, `elapsed`, `fmtTime`)
- Invariantes de componentes (`Badge` sempre ≥ 12px, `ConfirmModal` sempre com todos os elementos)
- Contraste de cores do `Badge`

### Biblioteca de Testes de Propriedade

**Vitest** (já no projeto via Vite) + **fast-check** para property-based testing.

```bash
npm install --save-dev fast-check
```

Cada teste de propriedade deve rodar com mínimo de **100 iterações** (padrão do fast-check).

### Estrutura de Arquivos de Teste

```
frontend/src/
├── app/components/
│   ├── __tests__/
│   │   ├── ConfirmModal.test.tsx       # Exemplos: estrutura, teclado, Escape
│   │   ├── ConfirmModal.property.test.tsx  # Propriedade 1, 2
│   │   ├── Badge.property.test.tsx     # Propriedades 3, 8
│   │   ├── Layout.test.tsx             # Exemplos: aria-labels, busca mobile
│   │   ├── Layout.property.test.tsx    # Propriedade 7
│   │   ├── SkeletonLoader.test.tsx     # Exemplos: renderização
│   │   └── EmptyState.test.tsx         # Exemplos: estrutura, CTA
├── lib/
│   └── __tests__/
│       ├── utils.property.test.ts      # Propriedade 4 (formatObraDisplayName)
│       └── andonTV.property.test.ts    # Propriedades 5, 6 (elapsed, fmtTime)
```

### Exemplos de Testes de Propriedade

```typescript
// Badge.property.test.tsx
// Feature: ui-ux-audit-enterprise, Property 3: Badge sempre usa tamanho mínimo text-xs
import { fc } from 'fast-check';
import { render } from '@testing-library/react';
import { Badge } from '../ui';

const BADGE_VARIANTS = ['default', 'success', 'warning', 'error', 'info', 'neutral', 'urgent'] as const;

test('Property 3: Badge sempre usa tamanho de fonte >= 12px em todas as variantes', () => {
  fc.assert(
    fc.property(fc.constantFrom(...BADGE_VARIANTS), fc.string(), (variant, content) => {
      const { container } = render(<Badge variant={variant}>{content}</Badge>);
      const badge = container.firstChild as HTMLElement;
      const fontSize = parseFloat(window.getComputedStyle(badge).fontSize);
      return fontSize >= 12;
    }),
    { numRuns: 100 }
  );
});
```

```typescript
// utils.property.test.ts
// Feature: ui-ux-audit-enterprise, Property 4: formatObraDisplayName nunca lança exceção
import { fc } from 'fast-check';
import { formatObraDisplayName } from '../utils';

test('Property 4: formatObraDisplayName nunca lança exceção para qualquer entrada', () => {
  fc.assert(
    fc.property(fc.anything(), (input) => {
      let result: string;
      expect(() => { result = formatObraDisplayName(input as any); }).not.toThrow();
      expect(typeof result!).toBe('string');
    }),
    { numRuns: 100 }
  );
});

test('Property 4b: formatObraDisplayName retorna placeholder para null/undefined', () => {
  fc.assert(
    fc.property(fc.constantFrom(null, undefined), (input) => {
      const result = formatObraDisplayName(input as any);
      return result === '—' || result === 'Sem obra';
    }),
    { numRuns: 100 }
  );
});
```

```typescript
// andonTV.property.test.ts
// Feature: ui-ux-audit-enterprise, Property 5: elapsed e fmtTime retornam fallback para entradas inválidas
import { fc } from 'fast-check';
import { elapsed, fmtTime } from '../AndonTV'; // exportar funções para teste

test('Property 5: elapsed retorna "---" para entradas inválidas', () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constant(null), fc.constant(undefined), fc.string().filter(s => isNaN(Date.parse(s)))),
      (input) => elapsed(input as any) === '---'
    ),
    { numRuns: 100 }
  );
});

test('Property 6: fmtTime retorna string HH:MM para datas ISO válidas', () => {
  fc.assert(
    fc.property(fc.date(), (date) => {
      const iso = date.toISOString();
      const result = fmtTime(iso);
      return /^\d{2}:\d{2}$/.test(result);
    }),
    { numRuns: 100 }
  );
});
```

### Testes de Exemplo Prioritários

```typescript
// ConfirmModal.test.tsx
describe('ConfirmModal', () => {
  it('fecha ao pressionar Escape sem chamar onConfirm', async () => { ... });
  it('fecha ao clicar no overlay sem chamar onConfirm', async () => { ... });
  it('captura foco dentro do modal (focus trap)', async () => { ... });
  it('foco inicial vai para o botão Cancelar', async () => { ... });
  it('exibe Loader2 quando isLoading=true', async () => { ... });
});

// Layout.test.tsx
describe('Layout — Topbar', () => {
  it('botão Bell tem aria-label="Notificações"', () => { ... });
  it('botão LogOut tem aria-label="Sair"', () => { ... });
  it('botão Menu tem aria-label="Abrir menu"', () => { ... });
  it('exibe botão de busca em mobile (viewport < 640px)', () => { ... });
});

// AndonPendenciasPage.test.tsx
describe('AndonPendenciasPage — Empty State', () => {
  it('exibe ícone CheckCircle2 (não AlertTriangle) quando lista vazia', () => { ... });
  it('exibe título "Tudo em dia" quando lista vazia', () => { ... });
});
```

### Cobertura Mínima Esperada

| Componente | Tipo de Teste | Cobertura Alvo |
|-----------|--------------|----------------|
| `ConfirmModal` | Exemplo + Propriedade | 90% |
| `SkeletonLoader` | Exemplo | 80% |
| `EmptyState` | Exemplo | 80% |
| `Badge` (ui.tsx) | Propriedade | 100% das variantes |
| `formatObraDisplayName` | Propriedade | 100% |
| `elapsed` / `fmtTime` | Propriedade | 100% |
| `Layout` (aria-labels) | Propriedade | 100% dos botões icon-only |
