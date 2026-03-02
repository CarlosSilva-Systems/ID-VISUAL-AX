import React, { useMemo } from 'react';
import { TaskStatusEnum } from '../../types/matrix';
import { Check, Ban } from 'lucide-react';

interface StatusCellProps {
    taskCode: string;
    status: TaskStatusEnum;
    label?: string;
    onClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    disabled?: boolean;
}

export const StatusCell: React.FC<StatusCellProps> = ({
    taskCode,
    status,
    onClick,
    onContextMenu,
    disabled
}) => {
    const isDocs = taskCode === 'DOCS_Epson';
    const isNA = status === TaskStatusEnum.nao_aplicavel;
    const isBlocked = status === TaskStatusEnum.bloqueado;

    const visualState = useMemo(() => {
        switch (status) {
            case TaskStatusEnum.nao_iniciado:
                return { bg: 'bg-slate-200', border: 'border-slate-300', icon: null };
            case TaskStatusEnum.montado:
                return {
                    bg: 'bg-amber-100',
                    border: 'border-amber-300',
                    icon: null,
                    text: isDocs ? 'Em Fila' : ''
                };
            case TaskStatusEnum.impresso:
                return {
                    bg: 'bg-emerald-100',
                    border: 'border-emerald-300',
                    icon: <Check size={16} className="text-emerald-600" />,
                    text: isDocs ? 'Impresso' : ''
                };
            case TaskStatusEnum.bloqueado:
                return { bg: 'bg-red-50', border: 'border-red-300', icon: <Ban size={16} className="text-red-500" /> };
            case TaskStatusEnum.nao_aplicavel:
            default:
                return { bg: 'bg-transparent', border: 'border-transparent', icon: null, text: '—' };
        }
    }, [status, isDocs]);

    if (isNA) {
        return (
            <div className="w-full h-12 flex items-center justify-center text-slate-300 font-medium select-none cursor-default">
                —
            </div>
        );
    }

    return (
        <div
            onClick={!disabled ? onClick : undefined}
            onContextMenu={!disabled ? onContextMenu : undefined}
            className={`
        w-full h-12 m-0.5 rounded-md border-2 transition-all duration-150 relative cursor-pointer group
        flex items-center justify-center
        ${visualState.bg} ${visualState.border}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-95 active:scale-95'}
      `}
        >
            {visualState.icon}
            {visualState.text && (
                <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    {visualState.text}
                </span>
            )}

            {/* Hover hint for next state */}
            {!disabled && !isBlocked && status !== TaskStatusEnum.impresso && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-20 bg-slate-400 rounded transition-opacity" />
            )}
        </div>
    );
};
