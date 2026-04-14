import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  Factory,
  FileText,
  BarChart3,
  LayoutTemplate,
  Settings,
  Search,
  Bell,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Wifi,
  Menu,
  Zap,
  LogOut,
  Activity,
  AlertTriangle,
  Cpu,
  Sparkles,
  X
} from "lucide-react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { cn, Button } from "./ui";
import { api } from "../../services/api";
import { AgentSidebar } from "./AgentSidebar";
import { ConnectionBadge } from "./ConnectionBadge";
import { User as UserType, AppNotification } from "../types";


interface LayoutProps {
  children: React.ReactNode;
  user: UserType | null;
}

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  path?: string;
  badge?: string | number | null;
  isAdminOnly?: boolean;
}

interface MenuGroup {
  id: string;
  label: string;
  icon: any;
  items: MenuItem[];
  isAdminOnly?: boolean;
}

export const Layout = ({ children, user }: LayoutProps) => {
  const isAdmin = user?.is_admin || false;
  const username = user?.username || "Usuário";
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [manualCount, setManualCount] = useState(0);
  const [pendingJustificationCount, setPendingJustificationCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);

  // Persistence for expanded groups
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('id_visual_open_groups');
    const parsed = saved ? JSON.parse(saved) : {};
    // Garantir que os grupos principais estejam abertos por padrão
    return {
      'id-visual': true,
      'andon-group': true,
      ...parsed,
      // Migrar chave legada 'andon' → 'andon-group'
      ...(parsed['andon'] !== undefined && parsed['andon-group'] === undefined
        ? { 'andon-group': parsed['andon'] }
        : {}),
    };
  });

  useEffect(() => {
    localStorage.setItem('id_visual_open_groups', JSON.stringify(openGroups));
  }, [openGroups]);

  // Body scroll lock quando sidebar mobile está aberta
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = touchStartX.current - e.changedTouches[0].clientX;
    if (deltaX > 50) setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await api.getManualRequestsCount();
        setManualCount(res.open_count);
      } catch (e) { console.error(e); }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    const handleUpdate = () => fetchCount();
    window.addEventListener('manual-request-updated', handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('manual-request-updated', handleUpdate);
    };
  }, []);

  useEffect(() => {
    const fetchJustificationStats = async () => {
      try {
        const stats = await api.getJustificationStats();
        setPendingJustificationCount(stats.total_pending);
      } catch { /* silencioso */ }
    };
    fetchJustificationStats();
    // Polling a cada 30s para garantir sincronismo mesmo sem WebSocket
    const interval = setInterval(fetchJustificationStats, 30000);

    // WebSocket para atualizações em tempo real
    const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/devices/ws';
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'andon_justification_required') {
          setPendingJustificationCount(prev => prev + 1);
        } else if (msg.event === 'andon_call_justified') {
          setPendingJustificationCount(prev => Math.max(0, prev - 1));
        }
        if (msg.event === 'andon_call_created') {
          setNotifications(prev => [{
            id: String(msg.data?.call_id || Date.now()),
            type: 'andon_call' as const,
            title: 'Chamado Andon',
            description: `${msg.data?.workcenter_name || 'Mesa'} acionou chamado`,
            href: '/andon/painel',
            isRead: false,
            createdAt: new Date().toISOString(),
          }, ...prev.slice(0, 19)]);
        }
        if (msg.event === 'andon_justification_required') {
          setNotifications(prev => [{
            id: String(msg.data?.call_id || Date.now()),
            type: 'justification_required' as const,
            title: 'Justificativa Pendente',
            description: 'Um chamado Andon aguarda justificativa',
            href: '/andon/pendencias',
            isRead: false,
            createdAt: new Date().toISOString(),
          }, ...prev.slice(0, 19)]);
        }
      } catch { /* ignore */ }
    };
    return () => {
      clearInterval(interval);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, []);

  // Fechar dropdown de notificações ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    if (isNotifOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotifOpen]);

  const menuStructure: (MenuGroup | MenuItem)[] = [
    {
      id: "id-visual",
      label: "ID Visual",
      icon: Zap,
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/id-visual/dashboard" },
        { id: "requests", label: "Solicitações (ID)", icon: ClipboardList, path: "/id-visual/solicitacoes", badge: manualCount > 0 ? (manualCount > 99 ? '99+' : manualCount) : null },
        { id: "production", label: "Visão Produção", icon: Zap, path: "/id-visual/producao" },
        { id: "analytics", label: "Indicadores", icon: BarChart3, path: "/id-visual/analytics" },
      ]
    },
    {
      id: "andon-group",
      label: "Andon",
      icon: Activity,
      items: [
        { id: "andon", label: "Painel Andon", icon: Activity, path: "/andon/painel" },
        {
          id: "andon-pendencias",
          label: "Pendências",
          icon: AlertTriangle,
          path: "/andon/pendencias",
          badge: pendingJustificationCount > 0 ? (pendingJustificationCount > 99 ? '99+' : pendingJustificationCount) : null
        },
        { id: "andon-oee", label: "Indicadores", icon: BarChart3, path: "/andon/dashboard" },
        { id: "andon-devices", label: "Dispositivos IoT", icon: Cpu, path: "/andon/devices" },
      ]
    },
    { id: "templates", label: "Padrões (5S)", icon: LayoutTemplate, path: "/templates" },
    {
      id: "analytics-group",
      label: "Analytics",
      icon: BarChart3,
      items: [
        { id: "mpr-analytics", label: "MPR Analytics", icon: BarChart3, path: "/mpr/analytics" },
        { id: "relatorios", label: "Relatórios IA", icon: Sparkles, path: "/relatorios" },
      ]
    },
    { id: "config", label: "Configurações", icon: Settings, path: "/admin" },
  ];

  // Auto-expand group if child is active
  useEffect(() => {
    const currentPath = location.pathname;
    menuStructure.forEach(node => {
      if ('items' in node) {
        const hasActiveChild = node.items.some(item => item.path === currentPath);
        if (hasActiveChild && !openGroups[node.id]) {
          setOpenGroups(prev => ({ ...prev, [node.id]: true }));
        }
      }
    });
  }, [location.pathname]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const renderMenuItem = (item: MenuItem, isSubItem = false) => {
    const isActive = location.pathname === item.path;

    return (
      <Link
        key={item.id}
        to={item.path || "#"}
        onClick={() => setIsMobileMenuOpen(false)}
        className={cn(
          "flex items-center w-full h-11 px-3 rounded-xl transition-all group relative",
          isSubItem ? "pl-9 mb-1" : "mb-1",
          isActive
            ? "bg-blue-50 text-blue-700 shadow-[0_2px_10px_-4px_rgba(37,99,235,0.2)]"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        )}
      >
        <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-blue-600" : "")} />
        {!isSidebarCollapsed && (
          <div className="flex-1 flex items-center justify-between ml-3">
            <span className="text-sm font-medium">{item.label}</span>
            {item.badge && (
              <span className="bg-red-600 text-white text-[12px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{item.badge}</span>
            )}
          </div>
        )}
        {isSidebarCollapsed && (
          <div className="absolute left-full ml-4 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
            {item.label}
          </div>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-slate-200 transition-all duration-300 lg:static",
          isSidebarCollapsed ? "w-20" : "w-64",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{ width: isMobileMenuOpen ? 'min(280px, 85vw)' : undefined }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center h-16 px-6 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
              ID
            </div>
            {!isSidebarCollapsed && (
              <span className="font-bold text-slate-800 tracking-tight">ID Visual</span>
            )}
          </div>
        </div>

        {/* overflow-y-auto garante scroll quando menu excede a viewport em mobile */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {menuStructure.map((node) => {
            if ('items' in node) {
              const isOpen = openGroups[node.id];
              const hasActiveChild = node.items.some(item => location.pathname === item.path);

              return (
                <div key={node.id} className="mb-2">
                  <button
                    onClick={() => toggleGroup(node.id)}
                    className={cn(
                      "flex items-center w-full h-11 px-3 rounded-xl transition-all group relative mb-1",
                      hasActiveChild ? "text-blue-700 font-semibold" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <node.icon className={cn("w-5 h-5 shrink-0", hasActiveChild ? "text-blue-600" : "")} />
                    {!isSidebarCollapsed && (
                      <>
                        <span className="flex-1 ml-3 text-sm font-medium text-left">{node.label}</span>
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </>
                    )}
                  </button>

                  {isOpen && !isSidebarCollapsed && (
                    <div className="space-y-1">
                      {node.items.map(item => renderMenuItem(item, true))}
                    </div>
                  )}
                </div>
              );
            }
            return renderMenuItem(node as MenuItem);
          })}
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
              aria-label="Abrir menu"
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Busca expandida em mobile */}
            {isSearchOpen ? (
              <div className="flex items-center gap-2 flex-1 md:hidden">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Buscar..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                  />
                </div>
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="p-2 text-slate-500 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Fechar busca"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <>
                {/* Busca — desktop */}
                <div className="relative w-full max-w-md hidden md:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por Nº Fabricação, Cliente, Quadro..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                  />
                </div>
                {/* Busca — ícone mobile */}
                <button
                  className="md:hidden p-2 text-slate-500 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Buscar"
                  onClick={() => setIsSearchOpen(true)}
                >
                  <Search className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          {/* Elementos do lado direito — ocultos quando busca está expandida em mobile */}
          <div className={cn("flex items-center gap-3", isSearchOpen && "hidden md:flex")}>
            {/* Badge Odoo — oculto em mobile */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider">Odoo Conectado</span>
            </div>

            <ConnectionBadge />

            <div className="relative" ref={notifRef}>
              <button
                aria-label="Notificações"
                onClick={() => {
                  setIsNotifOpen(prev => !prev);
                  if (!isNotifOpen) {
                    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                  }
                }}
                className="relative p-2 text-slate-500 hover:bg-slate-50 active:bg-slate-100 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <Bell className="w-5 h-5" />
                {notifications.filter(n => !n.isRead).length > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 border-2 border-white">
                    {notifications.filter(n => !n.isRead).length > 9 ? '9+' : notifications.filter(n => !n.isRead).length}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800">Notificações</span>
                    {notifications.length > 0 && (
                      <button
                        onClick={() => setNotifications([])}
                        className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-slate-400">
                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm font-medium">Nenhuma notificação</p>
                      </div>
                    ) : (
                      notifications.map(notif => (
                        <button
                          key={notif.id}
                          onClick={() => { navigate(notif.href); setIsNotifOpen(false); }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors border-b border-slate-50 last:border-0"
                        >
                          <p className="text-sm font-bold text-slate-800">{notif.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{notif.description}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {new Date(notif.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="h-8 w-[1px] bg-slate-200 mx-1 hidden sm:block" />

            {/* Avatar + nome — nome oculto em mobile */}
            <div className="flex items-center gap-3 p-1.5 hover:bg-slate-50 active:bg-slate-100 rounded-xl transition-colors group">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-xs font-bold text-slate-800">{username.split('@')[0]}</span>
                <span className="text-[10px] text-slate-500">{isAdmin ? 'Administrador' : 'Operador'}</span>
              </div>
              <div className="w-9 h-9 bg-slate-100 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-600 font-bold group-hover:border-blue-200 transition-all overflow-hidden">
                <User className="w-5 h-5" />
              </div>
            </div>

            <button
              onClick={() => api.logout()}
              aria-label="Sair"
              title="Sair"
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 active:bg-red-100 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page Area */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Sidebar de IA (Co-pilot) */}
      <AgentSidebar />

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 overlay-backdrop z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};

