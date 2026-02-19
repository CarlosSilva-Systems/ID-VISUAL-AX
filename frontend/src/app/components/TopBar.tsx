import React from 'react';

interface TopBarProps {
    title: string;
}

export function TopBar({ title }: TopBarProps) {
    return (
        <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 flex items-center px-4 z-50">
            {/* Page title — centered */}
            <h1 className="flex-1 text-center text-sm font-bold text-slate-800 truncate">
                {title}
            </h1>

            {/* Odoo status dot */}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-lg border border-emerald-100">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider hidden min-[400px]:inline">Odoo</span>
            </div>
        </header>
    );
}
