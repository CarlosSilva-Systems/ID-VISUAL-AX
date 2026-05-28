import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../../services/api';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTES DE PROTEÇÃO DE PRODUÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

const PRODUCTION_DB_NAME = "axengenharia1";
/**
 * Nome do banco de dados de produção que deve ser protegido contra seleção acidental.
 * Este banco NUNCA pode ser selecionado quando o sistema está operando em modo de teste.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

interface Database {
  name: string;
  type: 'production' | 'test';
  selectable: boolean;
  is_active: boolean;
}

interface OdooDatabase {
  id: string;
  name: string;
  url: string;
  isProduction: boolean;
  isActive: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE PROTEÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica se um banco de dados é o ambiente de produção.
 */
function isProductionEnvironment(dbName: string): boolean {
  return dbName === PRODUCTION_DB_NAME;
}

/**
 * Verifica se o banco ativo atual é produção.
 */
function isCurrentlyInProduction(databases: Database[]): boolean {
  const activeDb = databases.find(db => db.is_active);
  return activeDb ? isProductionEnvironment(activeDb.name) : false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE: BADGE DE AMBIENTE
// ═══════════════════════════════════════════════════════════════════════════════

interface EnvironmentBadgeProps {
  databases: Database[];
}

function EnvironmentBadge({ databases }: EnvironmentBadgeProps) {
  const activeDb = databases.find(db => db.is_active);
  const inProduction = isCurrentlyInProduction(databases);

  if (!activeDb) {
    return (
      <div className="bg-slate-100 border border-slate-200 px-4 py-3 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className="text-lg">⚪</span>
          <div>
            <div className="font-bold">Nenhum banco ativo</div>
            <div className="text-xs text-slate-500">Selecione um banco de dados</div>
          </div>
        </div>
      </div>
    );
  }

  if (inProduction) {
    return (
      <div className="bg-green-50 border border-green-200 px-4 py-3 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-green-800">
          <span className="text-lg">🟢</span>
          <div>
            <div className="font-bold">PRODUÇÃO ATIVA</div>
            <div className="text-xs text-green-600">Banco: {activeDb.name}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 px-4 py-3 rounded-lg">
      <div className="flex items-center gap-2 text-sm text-blue-800">
        <span className="text-lg">🔵</span>
        <div>
          <div className="font-bold">AMBIENTE DE TESTE</div>
          <div className="text-xs text-blue-600">Banco: {activeDb.name}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-blue-700 flex items-center gap-1">
        <span>✅</span>
        <span>Banco de produção está protegido</span>
      </div>
    </div>
  );
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

    // Confirmação ao sair de produção
    const currentlyInProd = isCurrentlyInProduction(databases);
    const selectedDatabase = databases.find(db => db.name === selectedDb);
    
    if (currentlyInProd && selectedDatabase && !isProductionEnvironment(selectedDatabase.name)) {
      const confirmed = window.confirm(
        '⚠️ ATENÇÃO: Você está saindo do ambiente de PRODUÇÃO\n\n' +
        `Deseja realmente trocar para o banco de teste "${selectedDb}"?\n\n` +
        'O banco de produção ficará protegido contra modificações acidentais.'
      );
      
      if (!confirmed) {
        return;
      }
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
    <div className="space-y-6">
      {/* Aviso de Proteção */}
      <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-sm text-amber-800 flex items-start gap-3">
        <span className="text-xl">⚠️</span>
        <div>
          <div className="font-bold mb-1">Proteção de Produção Ativa</div>
          <div className="text-xs text-amber-700">
            O banco de produção ({PRODUCTION_DB_NAME}) está protegido contra seleção acidental.
            Quando outro banco estiver ativo, NENHUMA operação poderá modificar o banco de produção.
          </div>
        </div>
      </div>

      {/* Badge de Ambiente Atual */}
      <EnvironmentBadge databases={databases} />

      {/* Seletor de Banco */}
      <div className="space-y-3">
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
              {db.type === 'production' ? '🔒 🟢' : '🔵'} {db.name}
              {db.is_active ? ' (Ativo)' : ''}
              {!db.selectable ? ' (Protegido)' : ''}
            </option>
          ))}
        </select>

        {selectedDatabase?.type === 'production' && (
          <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-xs text-red-800 flex items-start gap-2">
            <span>🔒</span>
            <span>
              <strong>Banco de produção protegido</strong> — seleção desabilitada para evitar modificações acidentais.
            </span>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={loading || !selectedDb || !selectedDatabase?.selectable}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Salvando...' : 'Salvar Configuração'}
        </button>
      </div>
    </div>
  );
}
