import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface MenuItem {
    id: string;
    label: string;
    icon: React.ElementType;
    badge?: number | string | null;
}

interface MobileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (pageId: string) => void;
    menuItems: MenuItem[];
    activePage: string;
}

export function MobileDrawer({ isOpen, onClose, onNavigate, menuItems, activePage }: MobileDrawerProps) {
    // ESC closes drawer
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    // NOTE: scroll lock is handled by App.tsx (single source of truth)

    const handleItemClick = (pageId: string) => {
        onNavigate(pageId);
        onClose();
    };

    return (
        <>
            {/* Overlay z-[70] */}
            <div
                className={cn(
                    "fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70] transition-opacity duration-300",
                    isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Drawer container z-[75] */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Menu de navegação"
                className={cn(
                    "fixed inset-y-0 left-0 w-[80vw] max-w-[320px] bg-white shadow-2xl z-[75] flex flex-col transition-transform duration-300 ease-in-out",
                    isOpen ? "translate-x-0" : "-translate-x-full"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between h-14 px-5 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
                            ID
                        </div>
                        <span className="font-bold text-slate-800 tracking-tight">ID Visual</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex items-center justify-center w-11 h-11 rounded-xl text-slate-400 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                        aria-label="Fechar menu"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => handleItemClick(item.id)}
                            className={cn(
                                "flex items-center w-full min-h-[44px] h-12 px-4 rounded-xl transition-all gap-3",
                                activePage === item.id
                                    ? "bg-blue-50 text-blue-700 shadow-[0_2px_10px_-4px_rgba(37,99,235,0.2)]"
                                    : "text-slate-600 hover:bg-slate-50 active:bg-slate-100"
                            )}
                        >
                            <item.icon className={cn("w-5 h-5 shrink-0", activePage === item.id ? "text-blue-600" : "")} />
                            <span className="flex-1 text-sm font-medium text-left">{item.label}</span>
                            {item.badge != null && (
                                <span className="bg-[#E53935] text-white text-[12px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
                                    {typeof item.badge === 'number' && item.badge > 99 ? '99+' : item.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200">
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Odoo Conectado</span>
                    </div>
                </div>
            </div>
        </>
    );
}
