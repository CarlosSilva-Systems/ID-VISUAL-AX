import React, { useState } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  Factory,
  Printer,
  FileText,
  BarChart3,
  LayoutTemplate,
  Settings,
  Search,
  Bell,
  User,
  ChevronLeft,
  ChevronRight,
  Wifi,
  Menu,
  Zap
} from "lucide-react";
import { cn, Button } from "./ui";

interface LayoutProps {
  children: React.ReactNode;
  activePage: string;
  setActivePage: (page: string) => void;
}

export const Layout = ({ children, activePage, setActivePage }: LayoutProps) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [manualCount, setManualCount] = useState(0);

  React.useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await import('../../services/api').then(m => m.api.getManualRequestsCount());
        setManualCount(res.open_count);
      } catch (e) { console.error(e); }
    };

    fetchCount(); // Initial fetch

    // Polling every 60s
    const interval = setInterval(fetchCount, 60000);

    // Custom event listener for immediate updates
    const handleUpdate = () => {
      fetchCount();
    };
    window.addEventListener('manual-request-updated', handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('manual-request-updated', handleUpdate);
    };
  }, []);

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "requests", label: "Solicitações (ID)", icon: ClipboardList, badge: manualCount > 0 ? (manualCount > 99 ? '99+' : manualCount) : null },
    { id: "mrp", label: "Fabricações (MRP)", icon: Factory },
    { id: "production", label: "Visão Produção", icon: Zap },
    { id: "printers", label: "Impressoras", icon: Printer },
    { id: "templates", label: "Padrões (5S)", icon: LayoutTemplate },
    { id: "admin", label: "Configurações", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-slate-200 transition-all duration-300 lg:static",
          isSidebarCollapsed ? "w-20" : "w-64",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center h-16 px-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
              ID
            </div>
            {!isSidebarCollapsed && (
              <span className="font-bold text-slate-800 tracking-tight">ID Visual</span>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActivePage(item.id);
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "flex items-center w-full h-11 px-3 rounded-xl transition-all group relative",
                activePage === item.id
                  ? "bg-blue-50 text-blue-700 shadow-[0_2px_10px_-4px_rgba(37,99,235,0.2)]"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              )}
            >
              <item.icon className={cn("w-5 h-5 shrink-0", activePage === item.id ? "text-blue-600" : "")} />
              {!isSidebarCollapsed && (
                <div className="flex-1 flex items-center justify-between ml-3">
                  <span className="text-sm font-medium">{item.label}</span>
                  {(item as any).badge && (
                    <span className="bg-[#E53935] text-white text-[12px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{(item as any).badge}</span>
                  )}
                </div>
              )}
              {isSidebarCollapsed && (
                <div className="absolute left-full ml-4 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                  {item.label}
                </div>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="flex items-center justify-center w-full h-10 rounded-xl hover:bg-slate-50 text-slate-400 transition-colors hidden lg:flex"
          >
            {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shrink-0 z-40">
          <div className="flex items-center flex-1 max-w-2xl gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="relative w-full max-w-md hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por Nº Fabricação, Cliente, Quadro..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Odoo Conectado</span>
            </div>

            <button className="relative p-2 text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>

            <div className="h-8 w-[1px] bg-slate-200 mx-1 hidden sm:block" />

            <button className="flex items-center gap-3 p-1.5 hover:bg-slate-50 rounded-xl transition-colors group">
              <div className="flex flex-col items-end hidden md:flex">
                <span className="text-xs font-bold text-slate-800">Rodrigo Silva</span>
                <span className="text-[10px] text-slate-500">ID Responsável</span>
              </div>
              <div className="w-9 h-9 bg-slate-100 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-600 font-bold group-hover:border-blue-200 transition-all overflow-hidden">
                <User className="w-5 h-5" />
              </div>
            </button>
          </div>
        </header>

        {/* Page Area */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};
