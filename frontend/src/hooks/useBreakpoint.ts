import { useEffect, useRef, useState } from 'react';

export type Breakpoint = 'mobile' | 'sm' | 'md' | 'lg' | 'xl';

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'lg'; // SSR-safe fallback
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 768) return 'sm';
  if (w < 1024) return 'md';
  if (w < 1280) return 'lg';
  return 'xl';
}

/**
 * Retorna o breakpoint atual baseado na largura da janela.
 * SSR-safe: retorna 'lg' quando window não está disponível.
 * Debounce de 100ms para evitar re-renders excessivos durante resize.
 */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(getBreakpoint);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setBp(getBreakpoint()), 100);
    };
    window.addEventListener('resize', handler, { passive: true });
    return () => {
      window.removeEventListener('resize', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return bp;
}

/** Helpers de conveniência */
export function useIsMobile(): boolean {
  const bp = useBreakpoint();
  return bp === 'mobile';
}

export function useIsTabletOrBelow(): boolean {
  const bp = useBreakpoint();
  return bp === 'mobile' || bp === 'sm' || bp === 'md';
}

export function useIsSmallOrBelow(): boolean {
  const bp = useBreakpoint();
  return bp === 'mobile' || bp === 'sm';
}
