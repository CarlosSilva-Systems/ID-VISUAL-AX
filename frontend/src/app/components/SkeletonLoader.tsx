import React from 'react';
import { cn } from './ui';

// Componente base
interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className }: SkeletonProps) => (
  <div className={cn('animate-shimmer rounded-md', className)} />
);

// Linha de tabela (7 colunas — DevicesPage)
export const SkeletonTableRow = () => (
  <tr className="border-b border-slate-100">
    <td className="px-5 py-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </td>
    <td className="px-4 py-4"><Skeleton className="h-3.5 w-24" /></td>
    <td className="px-4 py-4"><Skeleton className="h-6 w-16 rounded-full" /></td>
    <td className="px-4 py-4"><Skeleton className="h-6 w-14 rounded-full" /></td>
    <td className="px-4 py-4"><Skeleton className="h-3.5 w-16" /></td>
    <td className="px-4 py-4"><Skeleton className="h-3.5 w-14" /></td>
    <td className="px-5 py-4">
      <div className="flex items-center justify-end gap-1">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="w-8 h-8 rounded-lg" />
        ))}
      </div>
    </td>
  </tr>
);

// Card de workcenter (AndonGrid)
export const SkeletonCard = () => (
  <div className="rounded-3xl border-2 border-slate-100 p-5 space-y-4 bg-white">
    <div className="flex items-center justify-between">
      <Skeleton className="h-5 w-32" />
      <div className="flex items-center gap-2">
        <Skeleton className="w-6 h-6 rounded-lg" />
        <Skeleton className="w-3 h-3 rounded-full" />
      </div>
    </div>
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="pt-2 border-t border-slate-100">
        <Skeleton className="h-3.5 w-20" />
      </div>
    </div>
    <div className="flex items-center gap-2 mt-4">
      <Skeleton className="flex-1 h-9 rounded-xl" />
      <Skeleton className="w-9 h-9 rounded-xl" />
    </div>
  </div>
);

// Card de KPI (Dashboard StatCards)
export const SkeletonKPICard = () => (
  <div className="p-4 rounded-xl border border-slate-100 bg-white flex items-center gap-4">
    <Skeleton className="w-12 h-12 rounded-lg" />
    <div className="space-y-2">
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="h-7 w-12" />
    </div>
  </div>
);

// Item de lista genérico (Dashboard rows, AndonPendencias)
export const SkeletonListItem = () => (
  <div className="p-4 flex items-center gap-4 border-b border-slate-100">
    <div className="flex-1 space-y-2">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <Skeleton className="h-3.5 w-48" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
    <div className="flex items-center gap-3">
      <Skeleton className="h-7 w-14 rounded-lg" />
      <Skeleton className="w-6 h-6 rounded" />
    </div>
  </div>
);
