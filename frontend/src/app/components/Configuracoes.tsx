import React, { useState, useEffect } from 'react';
import {
  Database,
  Server,
  Save,
  RefreshCw,
  Layout,
  User,
  AlertTriangle
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from 'sonner';
import { api } from '../../services/api';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Tab = 'odoo' | 'lean' | 'permissoes';

export function Configuracoes() {
  const [activeTab, setActiveTab] = useState<Tab>('odoo');
  const [isSaving, setIsSaving] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedRespId, setSelectedRespId] = useState<string>('');
  const [initialRespId, setInitialRespId] = useState<string>('');

  const tabs = [
    { id: 'odoo', label: 'Integração Odoo', icon: Server },
  ];

  useEffect(() => {
    const loadData = async () => {
      setLoadingUsers(true);
      try {
        const [odooUsers, settings] = await Promise.all([
          api.getOdooUsers(),
          api.getSettings()
        ]);
        setUsers(odooUsers);
        
        const respSetting = settings.find((s: any) => s.key === 'odoo_id_visual_activity_user_id');
        if (respSetting) {
          setSelectedRespId(respSetting.value);
          setInitialRespId(respSetting.value);
        }
      } catch (err: any) {
        toast.error('Erro ao carregar configurações: ' + err.message);
      } finally {
        setLoadingUsers(false);
      }
    };
    loadData();
  }, []);

  const handleSave = async () => {
    if (selectedRespId === initialRespId) {
      toast.info('Nenhuma alteração detectada.');
      return;
    }

    setIsSaving(true);
    try {
      await api.patchSettings({
        odoo_id_visual_activity_user_id: selectedRespId
      });
      setInitialRespId(selectedRespId);
      toast.success('Configurações salvas com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Configurações do Sistema</h2>
          <p className="text-sm text-slate-500">Ajustes da conexão com Odoo e Backoffice.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving || selectedRespId === initialRespId}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50 disabled:grayscale disabled:scale-100"
        >
          {isSaving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />} 
          Salvar Alterações
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
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

        <div className="flex-1 bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden p-8">
          {activeTab === 'odoo' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <section className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Layout size={18} /> Responsável pela Produção
                  </h3>
                </div>

                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3">
                  <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    O usuário selecionado abaixo receberá todas as atividades de <strong>"Imprimir ID Visual"</strong> no chatter das ordens de fabricação no Odoo.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <User size={14} /> Usuário Responsável (Odoo)
                  </label>
                  <select
                    value={selectedRespId}
                    onChange={(e) => setSelectedRespId(e.target.value)}
                    disabled={loadingUsers}
                    className="w-full p-4 rounded-xl border border-slate-100 bg-slate-50 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all outline-none"
                  >
                    <option value="">Selecione um usuário...</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.login})</option>
                    ))}
                  </select>
                  {loadingUsers && <p className="text-[10px] text-blue-500 font-bold animate-pulse">Carregando usuários do Odoo...</p>}
                </div>
              </section>

              <section className="space-y-4 pt-4 border-t border-slate-50">
                <div className="flex items-center gap-2 font-bold text-slate-400">
                  <Database size={18} /> Parâmetros de Conexão
                </div>
                <p className="text-xs text-slate-400 italic">
                  Configurações de infraestrutura (URL/DB/Secret) são gerenciadas via variáveis de ambiente (.env) por segurança.
                </p>
              </section>

              <section className="mt-12 pt-8 border-t-2 border-red-50 space-y-4">
                <div className="flex items-center gap-2 font-black text-red-600 uppercase tracking-widest text-xs">
                  <AlertTriangle size={16} /> Zona de Perigo
                </div>
                <div className="bg-red-50 border border-red-100 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-bold text-red-900 text-sm">Limpar Base de Dados Local</p>
                    <p className="text-xs text-red-700/70 max-w-md">
                      Isso apagará todas as fabricações, solicitações e configurações salvas localmente. 
                      Útil após trocar de banco no Odoo para evitar dados órfãos.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (window.confirm("ATENÇÃO: Isso apagará TODOS os dados locais. Deseja continuar?")) {
                        try {
                          await api.resetDatabase();
                          toast.success("Base de dados resetada com sucesso! Recarregando sistema...");
                          setTimeout(() => {
                            window.location.href = '/';
                          }, 1500);
                        } catch (err: any) {
                          toast.error("Erro ao resetar: " + err.message);
                        }
                      }
                    }}
                    className="px-6 py-3 bg-white border-2 border-red-100 text-red-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white hover:border-red-600 transition-all active:scale-95 whitespace-nowrap"
                  >
                    Resetar Agora
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
