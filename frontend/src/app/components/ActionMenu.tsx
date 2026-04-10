import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActionMenuItem {
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
  /** Alinhamento do dropdown. Default: 'end' */
  align?: 'start' | 'end' | 'center';
  /** aria-label do botão trigger */
  triggerLabel?: string;
}

/**
 * Menu de ações compacto com botão "⋯".
 * Substitui múltiplos ícones de ação em mobile para evitar superlotação.
 */
export function ActionMenu({
  items,
  size = 'md',
  align = 'end',
  triggerLabel = 'Mais ações',
}: ActionMenuProps) {
  const triggerSize = size === 'sm' ? 'w-9 h-9' : 'min-w-[44px] min-h-[44px]';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'flex items-center justify-center rounded-lg',
            'border border-slate-200 bg-white',
            'hover:bg-slate-50 active:bg-slate-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
            'transition-colors',
            triggerSize
          )}
          aria-label={triggerLabel}
        >
          <MoreHorizontal size={18} className="text-slate-600" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className={cn(
            'z-50 min-w-[160px] rounded-xl border border-slate-200 bg-white p-1',
            'shadow-lg shadow-slate-200/60',
            'animate-in fade-in-0 zoom-in-95 duration-150',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
          )}
        >
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <DropdownMenu.Item
                key={idx}
                disabled={item.disabled}
                onSelect={item.onClick}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm',
                  'cursor-pointer select-none outline-none',
                  'transition-colors',
                  item.variant === 'destructive'
                    ? 'text-red-600 hover:bg-red-50 focus:bg-red-50 data-[disabled]:text-red-300'
                    : 'text-slate-700 hover:bg-slate-50 focus:bg-slate-50 data-[disabled]:text-slate-300',
                  'data-[disabled]:cursor-not-allowed data-[disabled]:pointer-events-none'
                )}
              >
                <Icon size={15} className="flex-shrink-0" />
                <span>{item.label}</span>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
