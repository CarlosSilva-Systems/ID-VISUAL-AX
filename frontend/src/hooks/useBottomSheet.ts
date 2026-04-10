import { useRef, useState } from 'react';

interface UseBottomSheetOptions {
  onClose: () => void;
  /** Deslocamento mínimo em px para fechar ao soltar. Default: 80 */
  swipeThreshold?: number;
}

interface UseBottomSheetReturn {
  isDragging: boolean;
  dragOffset: number;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: () => void;
  sheetStyle: React.CSSProperties;
}

/**
 * Gerencia o estado de swipe-to-close de um BottomSheet.
 * Detecta arrasto para baixo ≥ swipeThreshold px e chama onClose.
 */
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

  const handleTouchEnd = () => {
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
