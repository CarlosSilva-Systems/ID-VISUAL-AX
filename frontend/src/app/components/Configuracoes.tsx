import React, { useState } from 'react';
import {
  Database,
  Settings2,
  ShieldCheck,
  History,
  RefreshCw,
  Save,
  Lock,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Server
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Tab = 'odoo' | 'lean' | 'permissoes' | 'auditoria';

export function Configuracoes() {
  const [activeTab, setActiveTab] = useState<Tab>('odoo');
  const [isTesting, setIsTesting] = useState(false);

  const tabs = [
    { id: 'odoo', label: 'Integração Odoo', icon: Server },
  ];

  const handleTestConnection = () => {
    setIsTesting(true);
    setTimeout(() => {
      setIsTesting(false);
      toast.success('Teste de conexão enviado para o backend!');
    }, 1500);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Configurações do Sistema</h2>
          <p className="text-sm text-slate-500">Ajustes da conexão com Odoo e Backoffice.</p>
        </div>
        <button className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95">
          <Save size={18} /> Salvar Alterações
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Nav */}
        <div className="w-full md:w-64 shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all",
                activeTab === tab.id
                  ? "bg-white text-blue-600 shadow-sm border border-slate-100 ring-1 ring-slate-100"
                  : "text-slate-500 hover:bg-slate-100"
              )}
            >
              <tab.icon size={20} />
              {tab.label}
              {activeTab === tab.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden p-8">
          {activeTab === 'odoo' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <section className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><Database size={18} /> Conexão Principal</h3>
                  <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                    Conectado
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <ConfigField label="URL da Instância" value="https://odoo.exemplo.com" disabled />
                  <div className="grid grid-cols-2 gap-4">
                    <ConfigField label="Banco de Dados (DB)" value="producao-db" />
                    <ConfigField label="Tipo de Autenticação" value="API Key (JSON-2)" disabled />
                  </div>
                  <ConfigField label="API Key Secret" value="****************" type="password" />
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-colors flex items-center gap-2"
                >
                  {isTesting ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Testar Conexão Agora
                </button>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2 font-bold text-slate-800 border-b border-slate-50 pb-4">
                  <RefreshCw size={18} /> Sincronização Automática
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-sm font-bold text-slate-700">Sync em Tempo Real</p>
                    <p className="text-xs text-slate-500">Atualiza fabricações e solicitações a cada 5 min.</p>
                  </div>
                  <div className="w-12 h-6 bg-blue-600 rounded-full relative p-1 cursor-pointer">
                    <div className="w-4 h-4 bg-white rounded-full shadow-sm ml-auto" />
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfigField({ label, value, disabled = false, type = "text" }: { label: string, value: string, disabled?: boolean, type?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <input
        type={type}
        defaultValue={value}
        disabled={disabled}
        className={cn(
          "w-full p-3 rounded-xl border border-slate-100 font-bold text-sm transition-all outline-none",
          disabled ? "bg-slate-50 text-slate-400" : "bg-white text-slate-800 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600"
        )}
      />
    </div>
  );
}
