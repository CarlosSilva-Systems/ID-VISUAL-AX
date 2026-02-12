import React, { useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Factory,
  Eye,
  Printer,
  CheckSquare,
  Settings,
  Menu,
  X,
  CheckCircle
} from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { ActiveBatch } from '../components/ActiveBatch';
import { Recursos } from './components/Recursos';
import { Solicitacoes } from './components/Solicitacoes';
import { Fabricacoes } from './components/Fabricacoes';
import { VisaoProducao } from './components/VisaoProducao';
import { Padroes5S } from './components/Padroes5S';
import { Configuracoes } from './components/Configuracoes';
import { FinalizadasPage } from './pages/FinalizadasPage';
import { Toaster } from 'sonner';
import { Fabrication } from './types';
import { api } from '../services/api';

type Page = 'Dashboard' | 'LoteDoDia' | 'Solicitações' | 'Fabricações' | 'Finalizadas' | 'VisãoProdução' | 'Recursos' | 'Padrões' | 'Configurações';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [selectedFabrications, setSelectedFabrications] = useState<Fabrication[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean>(false);

  React.useEffect(() => {
    const checkHealth = async () => {
      try {
        const data = await api.healthCheck(); // Returns { status: "ok", odoo: "connected" ... }
        if (data.odoo === 'connected') {
          setIsBackendOnline(true);
          console.log('Odoo connection confirmed');
        } else {
          setIsBackendOnline(false);
          console.warn('Backend running but Odoo disconnected:', data.odoo);
        }
      } catch (error) {
        setIsBackendOnline(false);
        console.error('Backend connection failed', error);
      }
    };

    checkHealth();
    // Optional: Poll every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const menuItems = [
    { id: 'Dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'Solicitações', icon: ClipboardList, label: 'Solicitações (ID)' },
    { id: 'Fabricações', icon: Factory, label: 'Fabricações (MRP)' },
    { id: 'Finalizadas', icon: CheckCircle, label: 'Finalizadas' },
    { id: 'VisãoProdução', icon: Eye, label: 'Visão Produção' },
    { id: 'Recursos', icon: Printer, label: 'Impressoras' },
    { id: 'Padrões', icon: CheckSquare, label: 'Padrões (5S)' },
    { id: 'Configurações', icon: Settings, label: 'Configurações' },
  ];

  const handleCreateBatch = (batchId: string) => {
    setActiveBatchId(batchId);
    setCurrentPage('LoteDoDia');
  };

  return (
    <div className="flex h-screen bg-[#F8F9FA] font-sans text-[#333]">
      <Toaster position="top-right" expand={false} richColors />

      {/* Sidebar */}
      <aside className={`bg-[#1E293B] text-white transition-all duration-300 flex flex-col z-50 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className="p-4 flex items-center justify-between border-b border-slate-700">
          {isSidebarOpen && (
            <div className="flex flex-col">
              <span className="font-black text-lg tracking-tight">ID VISUAL</span>
              <span className="text-[10px] text-blue-400 font-bold tracking-widest uppercase -mt-1">Lean + 5S System</span>
            </div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-700 rounded transition-colors">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id as Page)}
              className={`w-full flex items-center p-4 transition-colors relative group ${currentPage === item.id || (currentPage === 'LoteDoDia' && item.id === 'Dashboard')
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
            >
              <item.icon size={22} className={cn("min-w-[22px]", (currentPage === item.id) ? "text-white" : "group-hover:text-blue-400")} />
              {isSidebarOpen && <span className="ml-4 font-bold text-sm">{item.label}</span>}
              {currentPage === item.id && <div className="absolute right-0 top-0 bottom-0 w-1 bg-white" />}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700 text-[10px] text-slate-500 font-black uppercase tracking-widest">
          {isSidebarOpen ? 'v1.0.0 • AX ENGENHARIA' : 'AX'}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-800 tracking-tight">
              {currentPage === 'Dashboard' && 'Painel de Controle'}
              {currentPage === 'LoteDoDia' && 'Lote do Dia (Produção)'}
              {currentPage === 'Solicitações' && 'Fila de Solicitações'}
              {currentPage === 'Fabricações' && 'MRP / Fabricações'}
              {currentPage === 'Finalizadas' && 'ID Visuais Finalizadas'}
              {currentPage === 'VisãoProdução' && 'Portal de Produção'}
              {currentPage === 'Recursos' && 'Checklists & Recursos'}
              {currentPage === 'Padrões' && 'Manual 5S'}
              {currentPage === 'Configurações' && 'Configurações do Sistema'}
            </h1>
            {currentPage === 'LoteDoDia' && (
              <span className="ml-4 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-black uppercase">Modo Operação</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm font-black text-slate-900 leading-none">Operador ID</span>
              <span className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isBackendOnline ? 'text-emerald-500' : 'text-red-500'}`}>
                {isBackendOnline ? 'ODOO ONLINE' : 'ODOO OFFLINE'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-black border-2 border-white shadow-sm ring-1 ring-blue-50">
              OP
            </div>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto bg-[#F1F5F9]">
          {currentPage === 'Dashboard' && (
            <Dashboard onCreateBatch={handleCreateBatch} />
          )}
          {currentPage === 'LoteDoDia' && (
            <ActiveBatch batchId={activeBatchId} onBack={() => setCurrentPage('Dashboard')} onNavigateFinalizadas={() => setCurrentPage('Finalizadas')} />
          )}
          {currentPage === 'Solicitações' && (
            <Solicitacoes onCreateBatch={handleCreateBatch} />
          )}
          {currentPage === 'Fabricações' && (
            <Fabricacoes />
          )}
          {currentPage === 'Finalizadas' && (
            <FinalizadasPage />
          )}
          {currentPage === 'VisãoProdução' && (
            <VisaoProducao />
          )}
          {currentPage === 'Recursos' && (
            <Recursos />
          )}
          {currentPage === 'Padrões' && (
            <Padroes5S />
          )}
          {currentPage === 'Configurações' && (
            <Configuracoes />
          )}
        </section>
      </main>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
