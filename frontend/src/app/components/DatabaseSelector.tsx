import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../../services/api';

interface Database {
  name: string;
  type: 'production' | 'test';
  selectable: boolean;
  is_active: boolean;
}

export function DatabaseSelector() {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    loadDatabases();
  }, []);

  const loadDatabases = async () => {
    try {
      setLoadingList(true);
      // api.get retorna o JSON diretamente (não response.data)
      const data: Database[] = await api.get('/odoo/databases');
      setDatabases(data);
      const active = data.find((db) => db.is_active);
      if (active) setSelectedDb(active.name);
    } catch (err: any) {
      toast.error('Erro ao carregar lista de bancos de dados');
    } finally {
      setLoadingList(false);
    }
  };

  const handleSave = async () => {
    if (!selectedDb) {
      toast.error('Selecione um banco de dados');
      return;
    }

    setLoading(true);
    try {
      await api.post('/odoo/databases/select', { database: selectedDb });
      toast.success('Banco de dados atualizado com sucesso!');
      window.dispatchEvent(new Event('database-changed'));
      await loadDatabases();
    } catch (err: any) {
      if (err.status === 403) {
        toast.error('Banco de produção não pode ser selecionado durante testes');
      } else if (err.status === 400) {
        toast.error('Nome de banco inválido');
      } else if (err.status === 502) {
        toast.error('Falha ao conectar com o banco selecionado');
      } else {
        toast.error(err.message || 'Erro ao salvar configuração');
      }
    } finally {
      setLoading(false);
    }
  };

  const selectedDatabase = databases.find((db) => db.name === selectedDb);

  if (loadingList) {
    return (
      <div className="space-y-4">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Banco de Dados Odoo
        </label>
        <div className="w-full p-4 rounded-xl border border-slate-100 bg-slate-50 text-slate-400">
          Carregando...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
        Banco de Dados Odoo
      </label>

      <select
        value={selectedDb}
        onChange={(e) => setSelectedDb(e.target.value)}
        disabled={loading}
        className="w-full p-4 rounded-xl border border-slate-100 bg-slate-50 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">Selecione um banco...</option>
        {databases.map((db) => (
          <option key={db.name} value={db.name} disabled={!db.selectable}>
            {db.type === 'production' ? '🟢' : '🟡'} {db.name}
            {db.is_active ? ' (Ativo)' : ''}
            {!db.selectable ? ' (Protegido)' : ''}
          </option>
        ))}
      </select>

      {selectedDatabase?.type === 'production' && (
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-800 flex items-start gap-2">
          <span>⚠️</span>
          <span>
            <strong>Banco de produção</strong> — seleção desabilitada durante período de testes.
          </span>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={loading || !selectedDb || !selectedDatabase?.selectable}
        className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Salvando...' : 'Salvar Configuração'}
      </button>
    </div>
  );
}
