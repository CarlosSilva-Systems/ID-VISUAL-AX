/**
 * Testes de propriedade para utilitários de formatação.
 * Feature: ui-ux-audit-enterprise
 * Property 4: formatObraDisplayName nunca lança exceção para qualquer entrada
 * Validates: Requirements 17.1, 17.2
 */
import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatObraDisplayName } from '../utils';

describe('formatObraDisplayName — Property-Based Tests', () => {
  test('Property 4a: nunca lança exceção para qualquer entrada', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        let result: string = '';
        expect(() => {
          result = formatObraDisplayName(input as any);
        }).not.toThrow();
        expect(typeof result).toBe('string');
      }),
      { numRuns: 100 }
    );
  });

  test('Property 4b: retorna placeholder não vazio para null e undefined', () => {
    fc.assert(
      fc.property(fc.constantFrom(null, undefined), (input) => {
        const result = formatObraDisplayName(input as any);
        return typeof result === 'string' && result.length > 0;
      }),
      { numRuns: 10 }
    );
  });

  test('Property 4c: retorna string para qualquer string de entrada (incluindo espaços)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (input) => {
        const result = formatObraDisplayName(input);
        // Resultado deve ser sempre uma string (pode ser vazia para strings só de espaços)
        return typeof result === 'string';
      }),
      { numRuns: 100 }
    );
  });

  test('Property 4e: retorna string não vazia para strings com conteúdo não-numérico', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => /[a-zA-ZÀ-ÿ]/.test(s)),
        (input) => {
          const result = formatObraDisplayName(input);
          return typeof result === 'string' && result.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 4d: resultado é sempre uma string (nunca undefined, null, number)', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = formatObraDisplayName(input as any);
        return typeof result === 'string';
      }),
      { numRuns: 100 }
    );
  });
});
