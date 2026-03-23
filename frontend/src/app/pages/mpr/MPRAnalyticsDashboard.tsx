import React, { useState, useEffect, useCallback } from 'react';
import { Download } from 'lucide-react';
import { MPRFilterBar, MPRFilters } from '../../components/mpr/MPRFilterBar';
import { MPRKPICards } from '../../components/mpr/MPRKPICards';
import { MPRFilaAtivaTable } from '../../components/mpr/MPRFilaAtivaTable';
import { MPRGraphs } from '../../components/mpr/MPRGraphs';
import { 
  mprAnalyticsApi, 
  KPIResumo, 
  MPRConfigResponse, 
  VolumePorPeriodoItem, 
  EvolucaoTempoCicloItem, 
  RankingResponsaveisItem, 
  MotivoRevisaoItem, 
  ImpactoFabricacaoItem 
} from '../../../services/mprAnalytics';

export function MPRAnalyticsDashboard() {
  const [filters, setFilters] = useState<MPRFilters | null>(null);
  
  // States
  const [config, setConfig] = useState<MPRConfigResponse | null>(null);
  const [kpiData, setKpiData] = useState<KPIResumo | null>(null);
  const [volumeData, setVolumeData] = useState<VolumePorPeriodoItem[]>([]);
  const [cicloData, setCicloData] = useState<EvolucaoTempoCicloItem[]>([]);
  const [rankingData, setRankingData] = useState<RankingResponsaveisItem[]>([]);
  const [motivosData, setMotivosData] = useState<MotivoRevisaoItem[]>([]);
  const [impactoData, setImpactoData] = useState<ImpactoFabricacaoItem[]>([]);
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [exportLoading, setExportLoading] = useState<boolean>(false);

  // Fetch Config ONCE
  useEffect(() => {
    mprAnalyticsApi.getConfig().then(setConfig).catch(console.error);
  }, []);

  // Fetch all filtered data when filters change
  const fetchDashboardData = useCallback(async (currentFilters: MPRFilters) => {
    setIsLoading(true);
    try {
      const { startDate, endDate } = currentFilters;
      
      const [kpis, vol, ciclos, ranking, motivos, impactos] = await Promise.all([
        mprAnalyticsApi.getKPIsResumo(startDate, endDate),
        mprAnalyticsApi.getVolumePorPeriodo(startDate, endDate),
        mprAnalyticsApi.getEvolucaoTempoCiclo(startDate, endDate),
        mprAnalyticsApi.getRankingResponsaveis(startDate, endDate),
        mprAnalyticsApi.getMotivosRevisao(startDate, endDate),
        mprAnalyticsApi.getImpactoFabricacao(startDate, endDate)
      ]);

      setKpiData(kpis);
      setVolumeData(vol);
      setCicloData(ciclos);
      setRankingData(ranking);
      setMotivosData(motivos);
      setImpactoData(impactos);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      // Optional: Toast error handling
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle filter changes from MPRFilterBar
  const handleFilterChange = (newFilters: MPRFilters) => {
    setFilters(newFilters);
    fetchDashboardData(newFilters);
  };

  // Exportação CSV (Correção 3)
  // Como o endpoint dedicado não existe (apenas sumários da API), usaremos os KPIs e Resumos já mapeados.
  // Em uma feature ideal, bateríamos na lista das IDs ativas nesse range. Aqui usaremos um resumo gerencial para CSV.
  const handleExportCSV = async () => {
    if (!kpiData) return;
    setExportLoading(true);
    
    try {
      // Criação básica do CSV usando dados de tela
      const lines = [
        ["Data Exportacao", new Date().toISOString()],
        ["Periodo Inicial", filters?.startDate],
        ["Periodo Final", filters?.endDate],
        [],
        ["Dashboard Geral"],
        ["Solicitadas", "Entregues", "No Prazo (%)", "Retrabalho (%)"],
        [kpiData.total_ids_solicitadas, kpiData.total_ids_entregues, kpiData.taxa_entrega_no_prazo_pct, kpiData.taxa_retrabalho_pct],
        [],
        ["Ranking de Produtividade (Entregas e WIP)"],
        ["Nome", "Entregues", "Andamento (WIP)"]
      ];

      rankingData.forEach(r => lines.push([r.nome, r.ids_concluidas.toString(), r.ids_em_andamento.toString()]));

      const csvContent = "data:text/csv;charset=utf-8," + lines.map(e => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `mpr_analytics_export_${new Date().getTime()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error(e);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics Fabricações (MPR)</h1>
            <p className="text-gray-500 text-sm mt-1">Visão de Produção e Ciclo de Vida de Identidade Visual</p>
          </div>
          
          <button 
            onClick={handleExportCSV}
            disabled={exportLoading || !kpiData}
            className="flex items-center gap-2 bg-indigo-600 outline-none text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow"
          >
            <Download size={18} />
            {exportLoading ? 'Gerando...' : 'Exportar Relatório CSV'}
          </button>
        </div>

        <MPRFilterBar onFilterChange={handleFilterChange} />
        
        <MPRKPICards data={kpiData} config={config} isLoading={isLoading} />
        
        <MPRGraphs 
          volumeData={volumeData}
          cicloData={cicloData}
          motivosData={motivosData}
          rankingData={rankingData}
          impactoData={impactoData}
          isLoading={isLoading}
        />
        
        <MPRFilaAtivaTable />
      </div>
    </div>
  );
}
