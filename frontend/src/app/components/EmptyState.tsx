import React from 'react';
import { cn } from './ui';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center py-16 px-6 text-center',
      className
    )}
  >
    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
      <Icon className="w-8 h-8 text-slate-400" />
    </div>
    <h3 className="text-base font-bold text-slate-700 mb-1">{title}</h3>
    {description && (
      <p className="text-sm text-slate-400 max-w-xs leading-relaxed">{description}</p>
    )}
    {action && (
      <button
        onClick={action.onClick}
        className="mt-4 px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
      >
        {action.label}
      </button>
    )}
  </div>
);
