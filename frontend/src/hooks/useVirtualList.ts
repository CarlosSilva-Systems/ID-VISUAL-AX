import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const VIRTUALIZATION_THRESHOLD = 50;

interface UseVirtualListOptions {
  count: number;
  estimateSize?: number;
  overscan?: number;
}

/**
 * Hook que ativa virtualização de lista quando `count > 50`.
 * Abaixo do threshold, retorna `null` para que o componente renderize normalmente.
 *
 * Uso:
 * ```tsx
 * const { parentRef, virtualizer, shouldVirtualize } = useVirtualList({ count: items.length });
 *
 * if (shouldVirtualize) {
 *   return (
 *     <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
 *       <div style={{ height: virtualizer.getTotalSize() }}>
 *         {virtualizer.getVirtualItems().map(vItem => (
 *           <div key={vItem.key} style={{ position: 'absolute', top: vItem.start, width: '100%' }}>
 *             <MyItem item={items[vItem.index]} />
 *           </div>
 *         ))}
 *       </div>
 *     </div>
 *   );
 * }
 * // Renderização normal para listas pequenas
 * return items.map(item => <MyItem key={item.id} item={item} />);
 * ```
 */
export function useVirtualList({
  count,
  estimateSize = 72,
  overscan = 5,
}: UseVirtualListOptions) {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = count > VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? count : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    enabled: shouldVirtualize,
  });

  return {
    parentRef,
    virtualizer,
    shouldVirtualize,
  };
}
