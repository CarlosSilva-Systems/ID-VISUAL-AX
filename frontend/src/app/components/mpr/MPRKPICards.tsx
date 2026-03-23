import React from 'react';
import { Clock, CheckCircle, AlertTriangle, Activity, PenTool, Hash } from 'lucide-react';
import { KPIResumo, MPRConfigResponse } from '../../../services/mprAnalytics';

interface MPRKPICardsProps {
  data: KPIResumo | null;
  config: MPRConfigResponse | null;
  isLoading: boolean;
}

export function MPRKPICards({ data, config, isLoading }: MPRKPICardsProps) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-4 shadow h-28 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  // Formatadores
  const formatMinToHours = (min: number | null) => min !== null ? `${(min / 60).toFixed(1)}h` : 'N/A';
  const formatPct = (pct: number | null) => pct !== null ? `${pct.toFixed(1)}%` : 'N/A';

  // Componente interno para reuso
  const Card = ({ title, value, icon, subtitle, color, alert }: any) => (
    <div className={`bg-white rounded-lg p-4 shadow border-l-4 ${color} relative overflow-hidden`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-md ${color.replace('border-', 'bg-').replace('-500', '-100')} text-${color.split('-')[1]}-600`}>
          {icon}
        </div>
      </div>
      {alert && (
        <div className="absolute bottom-0 right-0 left-0 bg-red-100 text-red-700 text-xs text-center py-0.5 font-medium">
          {alert}
        </div>
      )}
    </div>
  );

  // SLA Lógica
  const alertCycle = config && data.tempo_medio_ciclo_completo_min 
    ? (data.tempo_medio_ciclo_completo_min / 60) > config.sla_critico_horas
    : false;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
      <Card 
        title="Volumetria (Ids)"
        value={data.total_ids_solicitadas.toString()}
        subtitle={`${data.total_ids_entregues} entregues`}
        icon={<Hash size={20} />}
        color="border-blue-500"
      />
      
      <Card 
        title="Tempo de Concepção"
        value={formatMinToHours(data.tempo_medio_concepcao_min)}
        icon={<PenTool size={20} />}
        color="border-purple-500"
      />

      <Card 
        title="Tempo Médio de Ciclo"
        value={formatMinToHours(data.tempo_medio_ciclo_completo_min)}
        subtitle={config ? `SLA: ${config.sla_critico_horas}h` : 'Carregando SLA...'}
        icon={<Clock size={20} />}
        color={alertCycle ? 'border-red-500' : 'border-emerald-500'}
        alert={alertCycle ? 'SLA Estourado' : null}
      />

      <Card 
        title="Entregas no Prazo (%)"
        value={formatPct(data.taxa_entrega_no_prazo_pct)}
        icon={<CheckCircle size={20} />}
        color="border-green-500"
      />

      <Card 
        title="Taxa de Retrabalho"
        value={formatPct(data.taxa_retrabalho_pct)}
        icon={<AlertTriangle size={20} />}
        color={data.taxa_retrabalho_pct && data.taxa_retrabalho_pct > 15 ? 'border-orange-500' : 'border-blue-400'}
      />

      <Card 
        title="Impacto na Produção (OF)"
        value={formatMinToHours(data.tempo_medio_parada_of_min)}
        subtitle={`${data.ofs_impactadas} OFs afetadas`}
        icon={<Activity size={20} />}
        color={data.ofs_impactadas > 0 ? 'border-red-400' : 'border-gray-400'}
      />
    </div>
  );
}
