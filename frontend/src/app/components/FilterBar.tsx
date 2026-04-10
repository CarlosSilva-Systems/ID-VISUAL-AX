import { cn } from '@/lib/utils';

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
  count?: number;
}

interface FilterBarProps<T extends string = string> {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Barra de filtros com scroll horizontal e scrollbar oculta.
 * Sangra até a borda em mobile via negative margin.
 */
export function FilterBar<T extends string = string>({
  options,
  value,
  onChange,
  className,
}: FilterBarProps<T>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 overflow-x-auto scrollbar-hide scroll-touch',
        '-mx-3 px-3 sm:mx-0 sm:px-0',
        className
      )}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-shrink-0 flex items-center gap-1.5',
              'px-3 h-9 rounded-full text-sm font-medium',
              'transition-colors whitespace-nowrap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
              'active:scale-95',
              isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-200'
            )}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full font-semibold',
                  isActive ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
