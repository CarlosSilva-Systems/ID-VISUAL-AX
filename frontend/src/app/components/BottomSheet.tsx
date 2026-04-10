import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useBottomSheet } from '@/hooks/useBottomSheet';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  /** Altura máxima do sheet. Default: '85vh' */
  maxHeight?: string;
  /**
   * Nível de z-index para empilhamento:
   * 1 = z-50 (primeiro sheet), 2 = z-60 (sheet aninhado). Default: 1
   */
  level?: 1 | 2;
  /** Exibir drag handle visual no topo. Default: true */
  showHandle?: boolean;
  className?: string;
}

/**
 * Componente BottomSheet reutilizável.
 * Suporta swipe-to-close, drag handle, z-index progressivo e adaptação ao teclado virtual.
 */
export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  maxHeight = '85vh',
  level = 1,
  showHandle = true,
  className,
}: BottomSheetProps) {
  const prefersReduced = useReducedMotion();
  const { handleTouchStart, handleTouchMove, handleTouchEnd, sheetStyle } =
    useBottomSheet({ onClose });

  // Bloquear scroll do body quando aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const overlayZIndex = 'z-40';
  const sheetZIndex = level === 2 ? 'z-60' : 'z-50';

  const animationClass = prefersReduced
    ? ''
    : 'animate-in slide-in-from-bottom duration-300';

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          'fixed inset-0 overlay-backdrop',
          overlayZIndex
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl',
          'flex flex-col',
          sheetZIndex,
          animationClass,
          className
        )}
        style={{
          maxHeight: `calc(${maxHeight} - env(keyboard-inset-height, 0px))`,
          ...sheetStyle,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        {showHandle && (
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>
        )}

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <h2 className="text-base font-semibold text-slate-900 lg:text-lg">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 active:bg-slate-200 transition-colors"
              aria-label="Fechar"
            >
              <X size={18} className="text-slate-500" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );
}
