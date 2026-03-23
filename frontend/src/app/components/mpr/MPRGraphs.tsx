import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, ComposedChart
} from 'recharts';
import {
  VolumePorPeriodoItem, EvolucaoTempoCicloItem,
  RankingResponsaveisItem, MotivoRevisaoItem, ImpactoFabricacaoItem
} from '../../../services/mprAnalytics';

interface MPRGraphsProps {
  volumeData: VolumePorPeriodoItem[];
  cicloData: EvolucaoTempoCicloItem[];
  rankingData: RankingResponsaveisItem[];
  motivosData: MotivoRevisaoItem[];
  impactoData: ImpactoFabricacaoItem[];
  isLoading: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658'];

export function MPRGraphs({
  volumeData, cicloData, rankingData, motivosData, impactoData, isLoading
}: MPRGraphsProps) {

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-4 shadow h-80 animate-pulse flex items-center justify-center">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 mb-6">
      
      {/* 1ª Linha: Volume e Evolução */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Evolução Volume (BARRAS BÁSICAS MÚLTIPLAS) */}
        <div className="bg-white p-4 rounded-lg shadow border border-gray-100 h-96 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Volume de Solicitações vs Entregas e No Prazo</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="solicitadas" name="Solicitadas" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="entregues" name="Entregues" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="no_prazo" name="No Prazo" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Evolução Tempos (LINHAS DUPLAS) */}
        <div className="bg-white p-4 rounded-lg shadow border border-gray-100 h-96 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Evolução do Tempo de Concepção e Ciclo (horas)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cicloData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                <Tooltip cursor={{ stroke: '#F3F4F6', strokeWidth: 2 }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="tempo_medio_concepcao_min" name="Concepção (min)" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="tempo_medio_ciclo_min" name="Ciclo Completo (min)" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 2ª Linha: Ranking e Motivos Pizza */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico 3: Ranking de Responsáveis (BARRAS HORIZONTAIS) */}
        <div className="bg-white p-4 rounded-lg shadow border border-gray-100 h-96 flex flex-col lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Ranking de Produtividade (Entregas por Utilizador)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rankingData} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E5E7EB" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                <YAxis dataKey="nome" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#4B5563', fontWeight: 500 }} />
                <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="ids_concluidas" name="Entregas Finalizadas" fill="#6366F1" radius={[0, 4, 4, 0]} barSize={24} />
                <Bar dataKey="ids_em_andamento" name="WIP (Lote/Progresso)" fill="#9CA3AF" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 4: Motivos Retrabalho (PIZZA/DONUT) */}
        <div className="bg-white p-4 rounded-lg shadow border border-gray-100 h-96 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Motivos de Retrabalho (Taxa de Rejeição)</h3>
          <div className="flex-1 min-h-0">
            {motivosData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 italic">Sem dados de retrabalho.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={motivosData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="quantidade"
                    nameKey="motivo"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {motivosData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px', lineHeight: '14px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 3ª Linha: Impacto de Paradas (COMPOSTO BARRAS + LINHA) */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-100 h-96 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Impacto em Produção (OFs Paradas vs Tempo Bloqueado P/ IDVisual)</h3>
          <div className="flex-1 min-h-0">
            {impactoData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 italic">Nenhum evento de bloqueio.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={impactoData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                  <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar yAxisId="left" dataKey="horas_paradas_total" name="Total Horas Paradas" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="ofs_afetadas" name="Nº OFs Bloqueadas" stroke="#4B5563" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

    </div>
  );
}
