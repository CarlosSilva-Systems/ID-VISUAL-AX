/**
 * Testes de propriedade para o componente ConfirmModal.
 * Feature: ui-ux-audit-enterprise
 * Property 1: ConfirmModal sempre exibe todos os elementos obrigatórios
 * Property 2: Ações destrutivas nunca chamam window.confirm()
 * Validates: Requirements 5.1, 5.2, 5.5, 5.6, 5.7
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { render } from '@testing-library/react';
import { ConfirmModal } from '../ConfirmModal';

const VARIANTS = ['destructive', 'warning', 'success'] as const;

describe('ConfirmModal — Property-Based Tests', () => {
  beforeEach(() => {
    // Limpar body overflow entre testes
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  test('Property 1: sempre exibe título, descrição e dois botões para qualquer combinação de props válidas', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 80 }),
          description: fc.string({ minLength: 1, maxLength: 200 }),
          variant: fc.constantFrom(...VARIANTS),
        }),
        ({ title, description, variant }) => {
          const { container, unmount } = render(
            <ConfirmModal
              isOpen={true}
              title={title}
              description={description}
              variant={variant}
              onConfirm={() => {}}
              onCancel={() => {}}
            />
          );

          const hasTitle = container.textContent?.includes(title) ?? false;
          const hasDescription = container.textContent?.includes(description) ?? false;
          const buttons = container.querySelectorAll('button');
          const hasTwoButtons = buttons.length >= 2;

          unmount();
          return hasTitle && hasDescription && hasTwoButtons;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 1b: não renderiza nada quando isOpen=false', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1 }),
          description: fc.string({ minLength: 1 }),
          variant: fc.constantFrom(...VARIANTS),
        }),
        ({ title, description, variant }) => {
          const { container, unmount } = render(
            <ConfirmModal
              isOpen={false}
              title={title}
              description={description}
              variant={variant}
              onConfirm={() => {}}
              onCancel={() => {}}
            />
          );
          const isEmpty = container.firstChild === null;
          unmount();
          return isEmpty;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 2: nunca chama window.confirm() ao renderizar', () => {
    const windowConfirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1 }),
          description: fc.string({ minLength: 1 }),
          variant: fc.constantFrom(...VARIANTS),
          isOpen: fc.boolean(),
        }),
        ({ title, description, variant, isOpen }) => {
          const callsBefore = windowConfirmSpy.mock.calls.length;
          const { unmount } = render(
            <ConfirmModal
              isOpen={isOpen}
              title={title}
              description={description}
              variant={variant}
              onConfirm={() => {}}
              onCancel={() => {}}
            />
          );
          const callsAfter = windowConfirmSpy.mock.calls.length;
          unmount();
          // window.confirm não deve ter sido chamado durante a renderização
          return callsAfter === callsBefore;
        }
      ),
      { numRuns: 50 }
    );

    windowConfirmSpy.mockRestore();
  });

  test('Property 1c: renderiza sem lançar exceção para qualquer combinação de props', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 100 }),
          description: fc.string({ minLength: 0, maxLength: 300 }),
          variant: fc.constantFrom(...VARIANTS),
          confirmLabel: fc.option(fc.string({ minLength: 1 })),
          cancelLabel: fc.option(fc.string({ minLength: 1 })),
          isLoading: fc.boolean(),
        }),
        ({ title, description, variant, confirmLabel, cancelLabel, isLoading }) => {
          expect(() => {
            const { unmount } = render(
              <ConfirmModal
                isOpen={true}
                title={title}
                description={description}
                variant={variant}
                confirmLabel={confirmLabel ?? undefined}
                cancelLabel={cancelLabel ?? undefined}
                isLoading={isLoading}
                onConfirm={() => {}}
                onCancel={() => {}}
              />
            );
            unmount();
          }).not.toThrow();
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
