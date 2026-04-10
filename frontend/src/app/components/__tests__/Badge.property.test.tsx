/**
 * Testes de propriedade para o componente Badge.
 * Feature: ui-ux-audit-enterprise
 * Property 3: Badge sempre usa tamanho de fonte >= 12px (text-xs) em todas as variantes
 * Validates: Requirements 12.4, 9.7
 */
import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { render } from '@testing-library/react';
import { Badge } from '../ui';

const BADGE_VARIANTS = [
  'default',
  'success',
  'warning',
  'error',
  'info',
  'neutral',
  'urgent',
] as const;

describe('Badge — Property-Based Tests', () => {
  test('Property 3: não usa classes de tamanho arbitrário menor que 12px em nenhuma variante', () => {
    fc.assert(
      fc.property(fc.constantFrom(...BADGE_VARIANTS), (variant) => {
        const { container, unmount } = render(<Badge variant={variant}>Teste</Badge>);
        const badge = container.firstChild as HTMLElement;
        const classList = badge?.className ?? '';

        // Garantir que não há tamanhos arbitrários abaixo de 12px
        const hasArbitrarySmallSize =
          classList.includes('text-[11px]') ||
          classList.includes('text-[10px]') ||
          classList.includes('text-[9px]') ||
          classList.includes('text-[8px]');

        unmount();
        return !hasArbitrarySmallSize;
      }),
      { numRuns: 100 }
    );
  });

  test('Property 3b: renderiza sem lançar exceção para qualquer variante e conteúdo string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BADGE_VARIANTS),
        fc.string({ minLength: 0, maxLength: 50 }),
        (variant, content) => {
          let rendered = false;
          expect(() => {
            const { container, unmount } = render(
              <Badge variant={variant}>{content}</Badge>
            );
            rendered = container.firstChild !== null;
            unmount();
          }).not.toThrow();
          return rendered;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3c: sempre contém a classe text-xs (mínimo 12px)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...BADGE_VARIANTS), (variant) => {
        const { container, unmount } = render(<Badge variant={variant}>X</Badge>);
        const badge = container.firstChild as HTMLElement;
        const hasTextXs = badge?.className?.includes('text-xs') ?? false;
        unmount();
        return hasTextXs;
      }),
      { numRuns: 100 }
    );
  });
});
