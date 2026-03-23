import React, { useState, useEffect } from 'react';
import { RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { FilaAtivaItem, mprAnalyticsApi } from '../../../services/mprAnalytics';

export function MPRFilaAtivaTable() {
  const [data, setData] = useState<FilaAtivaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchData = async () => {
    try {
      const res = await mprAnalyticsApi.getFilaAtiva();
      setData(res);
    } catch (err) {
      console.error('Erro ao buscar fila ativa', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-polling every 60 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredData = data.filter(item => 
    item.mo_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.responsavel_atual?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const currentItems = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getStatusColor = (status: string) => {
    switch(status.toLowerCase()) {
      case 'nova': return 'bg-blue-100 text-blue-800';
      case 'triagem': return 'bg-purple-100 text-purple-800';
      case 'em lote': return 'bg-yellow-100 text-yellow-800';
      case 'em progresso': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-100 mb-6">
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800">Fila Ativa de IDs (WIP)</h2>
          <button 
            onClick={() => { setLoading(true); fetchData(); }}
            className="text-gray-400 hover:text-blue-600 transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar OF, status ou responsável..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-8 pr-3 py-1.5 border rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 outline-none w-full md:w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
            <tr>
              <th className="px-6 py-3 font-medium">Ordem de Fabricação</th>
              <th className="px-6 py-3 font-medium">Status Atual</th>
              <th className="px-6 py-3 font-medium">Prioridade</th>
              <th className="px-6 py-3 font-medium">Solicitado Em</th>
              <th className="px-6 py-3 font-medium">Aging (Horas)</th>
              <th className="px-6 py-3 font-medium">Responsável</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  Carregando fila ativa...
                </td>
              </tr>
            ) : currentItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  Nenhuma ID pendente encontrada.
                </td>
              </tr>
            ) : (
              currentItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-900">{item.mo_number}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                      {item.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-3">{item.prioridade.toUpperCase()}</td>
                  <td className="px-6 py-3">
                    {item.solicitado_em ? new Date(item.solicitado_em).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-3">
                    <span className={item.aging_horas > 24 ? 'text-red-600 font-bold' : ''}>
                      {item.aging_horas.toFixed(1)}h
                    </span>
                  </td>
                  <td className="px-6 py-3">{item.responsavel_atual || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredData.length)} de {filteredData.length} registros
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded border hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium">
              {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded border hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
