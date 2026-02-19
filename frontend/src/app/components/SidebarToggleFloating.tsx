import React from 'react';
import { Menu, X } from 'lucide-react';

interface SidebarToggleFloatingProps {
    isOpen: boolean;
    onClick: () => void;
    manualCount?: number;
}

export function SidebarToggleFloating({ isOpen, onClick, manualCount }: SidebarToggleFloatingProps) {
    return (
        <button
            onClick={onClick}
            aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
            className="fixed bottom-4 right-4 z-[80] w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center transition-all duration-300 active:scale-95 hover:bg-blue-700 hover:shadow-xl"
        >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}

            {/* Badge — WhatsApp style, only when closed */}
            {!isOpen && manualCount != null && manualCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#E53935] text-white text-[10px] font-bold px-1.5 rounded-full min-w-[16px] text-center leading-[18px] shadow-sm border-2 border-white">
                    {manualCount > 99 ? '99+' : manualCount}
                </span>
            )}
        </button>
    );
}
