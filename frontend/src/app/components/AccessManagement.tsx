import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Trash2, 
  Key, 
  RefreshCw,
  Info,
  CheckCircle2,
  XCircle,
  ShieldAlert
} from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { ConfirmModal } from './ConfirmModal';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ROLES = [
  { value: 'ti', label: 'T.I (Acesso Total)', color: 'blue' },
  { value: 'gerencia', label: 'Gerência', color: 'purple' },
  { value: 'producao', label: 'Produção', color: 'emerald' },
  { value: 'engenharia', label: 'Engenharia', color: 'orange' },
];

export function AccessManagement() {
  const [localUsers, setLocalUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserData, setNewUserData] = useState({
    username: '',
    full_name: '',
    password: '',
    role: 'producao'
  });
  // Estado separado para o valor bruto do input do username
  // Evita o bug de cursor resetar ao aplicar toLowerCase no onChange
  const [rawUsername, setRawUsername] = useState('');

  // Reset password state
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Delete state
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await api.getLocalUsers();
      setLocalUsers(data);
    } catch (err: any) {
      toast.error('Erro ao carregar usuários: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      await api.createLocalUser(newUserData);
      toast.success('Usuário criado com sucesso!');
      setShowAddModal(false);
      setNewUserData({ username: '', full_name: '', password: '', role: 'producao' });
      setRawUsername('');
      loadUsers();
    } catch (err: any) {
      toast.error('Erro ao criar usuário: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUserId || !newPassword) return;
    try {
      await api.updateLocalUserPassword(resetUserId, newPassword);
      toast.success('Senha redefinida com sucesso!');
      setResetUserId(null);
      setNewPassword('');
    } catch (err: any) {
      toast.error('Erro ao redefinir senha: ' + err.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    try {
      await api.deleteLocalUser(deleteUserId);
      toast.success('Usuário removido com sucesso!');
      setDeleteUserId(null);
      loadUsers();
    } catch (err: any) {
      toast.error('Erro ao remover usuário: ' + err.message);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center justify-between border-b border-slate-50 pb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Shield size={18} className="text-blue-600" /> Gestão de Usuários Locais
        </h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-blue-700 transition-all active:scale-95 shadow-sm"
        >
          <UserPlus size={16} /> Novo Usuário
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3">
        <Info className="text-blue-500 shrink-0" size={20} />
        <div className="space-y-1">
          <p className="text-xs text-blue-800 leading-relaxed font-bold">
            Contas Compartilhadas e Administradores
          </p>
          <p className="text-[11px] text-blue-700/80 leading-relaxed">
            Usuários locais têm prioridade sobre o Odoo. Use-os para contas compartilhadas por setor ou acessos de emergência da T.I.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <RefreshCw className="animate-spin text-blue-500" size={32} />
          <p className="text-sm font-bold text-slate-400">Carregando usuários...</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left">
                <th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuário / Nome</th>
                <th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo / Permissões</th>
                <th className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {localUsers.map((u) => (
                <tr key={u.id} className="bg-slate-50/50 hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-4 rounded-l-2xl">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900">@{u.username}</span>
                      <span className="text-xs text-slate-500">{u.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                      u.role?.toLowerCase() === 'ti' ? "bg-blue-50 text-blue-700 border-blue-100" :
                      u.role?.toLowerCase() === 'gerencia' ? "bg-purple-50 text-purple-700 border-purple-100" :
                      u.role?.toLowerCase() === 'producao' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                      "bg-orange-50 text-orange-700 border-orange-100"
                    )}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-4 rounded-r-2xl text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setResetUserId(u.id)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Redefinir Senha"
                      >
                        <Key size={16} />
                      </button>
                      <button 
                        onClick={() => setDeleteUserId(u.id)}
                        disabled={u.username === 'tiax2026'}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Remover Usuário"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Novo Usuário */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-50 flex items-center justify-between">
              <h4 className="font-black text-slate-900 flex items-center gap-2">
                <UserPlus size={20} className="text-blue-600" /> Novo Usuário Local
              </h4>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <XCircle size={24} />
              </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Username (Login)</label>
                <input
                  required
                  type="text"
                  value={rawUsername}
                  onChange={(e) => {
                    // Atualiza o valor bruto para exibir sem resetar cursor
                    setRawUsername(e.target.value);
                  }}
                  onBlur={(e) => {
                    // Aplica transformção só ao sair do campo
                    const clean = e.target.value.toLowerCase().replace(/\s/g, '');
                    setRawUsername(clean);
                    setNewUserData({ ...newUserData, username: clean });
                  }}
                  placeholder="ex: producao_setor_a"
                  className="w-full p-3 rounded-xl border border-slate-100 bg-slate-50 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome Completo</label>
                <input
                  required
                  type="text"
                  value={newUserData.full_name}
                  onChange={(e) => setNewUserData({ ...newUserData, full_name: e.target.value })}
                  placeholder="Ex: Equipe de Produção"
                  className="w-full p-3 rounded-xl border border-slate-100 bg-slate-50 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha Inicial</label>
                <input
                  required
                  type="password"
                  value={newUserData.password}
                  onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-100 bg-slate-50 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo / Permissões</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((role) => (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => setNewUserData({ ...newUserData, role: role.value })}
                      className={cn(
                        "p-3 rounded-xl border text-xs font-bold transition-all text-left flex flex-col gap-1",
                        newUserData.role === role.value
                          ? "bg-blue-50 border-blue-500 text-blue-700 shadow-sm"
                          : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
                      )}
                    >
                      <span>{role.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-50 text-slate-500 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  {isCreating ? <RefreshCw className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                  Criar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Redefinir Senha */}
      {resetUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-50">
              <h4 className="font-black text-slate-900 flex items-center gap-2">
                <Key size={20} className="text-amber-500" /> Redefinir Senha
              </h4>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nova Senha</label>
                <input
                  autoFocus
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-100 bg-slate-50 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-amber-500/10 focus:border-amber-600 transition-all outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setResetUserId(null)}
                  className="flex-1 px-4 py-3 bg-slate-50 text-slate-500 rounded-xl font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={!newPassword}
                  className="flex-1 px-4 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-all disabled:opacity-50"
                >
                  Salvar Senha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Deleção */}
      <ConfirmModal
        isOpen={!!deleteUserId}
        title="Remover Usuário"
        description="Esta ação removerá permanentemente o acesso deste usuário ao sistema. Deseja continuar?"
        confirmLabel="Remover Usuário"
        variant="destructive"
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteUserId(null)}
      />
    </div>
  );
}
