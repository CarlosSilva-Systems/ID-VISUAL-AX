import React from "react";
import { 
  Printer, 
  RotateCcw, 
  XCircle, 
  Settings, 
  AlertTriangle, 
  CheckCircle2, 
  Activity,
  History,
  Droplets
} from "lucide-react";
import { cn, Button, Badge, Card, KPICard } from "../components/ui";

const MOCK_PRINTERS = [
  { id: "W1", name: "Wago Smart Script #1", type: "Wago 258-5000", status: "Online", queue: 2, ink: 85, roll: 40, lastJob: "FAB-4022", errorRate: "0.2%" },
  { id: "W2", name: "Wago Smart Script #2", type: "Wago 258-5000", status: "Online", queue: 0, ink: 42, roll: 12, lastJob: "FAB-4010", errorRate: "1.5%" },
  { id: "E1", name: "Elesys Thermal #1", type: "Elesys EF-100", status: "Offline", queue: 5, ink: 98, roll: 80, lastJob: "FAB-3990", errorRate: "0.8%" },
];

export const PrintersPage = () => {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Gestão de Impressoras</h1>
        <p className="text-sm text-slate-500 mt-1">Downtime Zero: monitoramento de consumíveis e fila</p>
      </div>

      {/* KPI da Operação */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard label="Jobs na Fila" value={7} variant="info" />
        <KPICard label="Taxa de Erro" value="0.5%" subtext="Últimos 7 dias" variant="success" />
        <KPICard label="Tempo Ativo" value="98.2%" variant="success" />
        <KPICard label="Downtime" value="42 min" subtext="Esta semana" variant="warning" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {MOCK_PRINTERS.map((p) => (
          <Card key={p.id} className="relative overflow-hidden group">
            <div className={cn("h-1.5 w-full", p.status === "Online" ? "bg-emerald-500" : "bg-red-500")} />
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-50 rounded-xl group-hover:bg-blue-50 transition-colors">
                    <Printer className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">{p.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{p.type}</p>
                  </div>
                </div>
                <Badge variant={p.status === "Online" ? "success" : "error"}>{p.status}</Badge>
              </div>

              {/* Consumíveis (5S Visual) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                    <span className="flex items-center gap-1"><Droplets className="w-3 h-3" /> TINTA / RIBBON</span>
                    <span className={cn(p.ink < 50 ? "text-amber-500" : "text-emerald-500")}>{p.ink}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn("h-full transition-all", p.ink < 50 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${p.ink}%` }} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                    <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> ROLO / MÍDIA</span>
                    <span className={cn(p.roll < 20 ? "text-red-500" : "text-emerald-500")}>{p.roll}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn("h-full transition-all", p.roll < 20 ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${p.roll}%` }} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Fila Atual</p>
                  <p className="text-sm font-bold text-slate-700">{p.queue} jobs</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Taxa de Erro</p>
                  <p className="text-sm font-bold text-slate-700">{p.errorRate}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-blue-600">
                    <Settings className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-blue-600">
                    <History className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm">Testar</Button>
                  <Button size="sm" className="gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Fila de Impressão Global */}
      <Card>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Fila de Impressão Global</h3>
          <Button variant="ghost" size="sm" className="text-red-600 gap-2">
            <XCircle className="w-4 h-4" />
            Limpar Todas as Filas
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="px-6 py-3">Hora</th>
                <th className="px-6 py-3">Solicitação</th>
                <th className="px-6 py-3">Fabricação / Obra</th>
                <th className="px-6 py-3">Material</th>
                <th className="px-6 py-3">Status Job</th>
                <th className="px-6 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-50">
              <PrintJobRow time="09:12" id="REQ-882" fab="FAB-4022" work="Shopping Norte" material="Wago 210-804" status="Imprimindo" />
              <PrintJobRow time="09:15" id="REQ-883" fab="FAB-4022" work="Shopping Norte" material="Wago 210-855" status="Na Fila" />
              <PrintJobRow time="09:10" id="REQ-881" fab="FAB-3988" work="Hospital Clínicas" material="Elesys EFZ" status="Erro: S/ Papel" error />
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

function PrintJobRow({ time, id, fab, work, material, status, error }: any) {
  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-6 py-4 font-medium text-slate-400">{time}</td>
      <td className="px-6 py-4 font-bold text-slate-700">{id}</td>
      <td className="px-6 py-4">
        <div className="font-bold text-slate-700">{fab}</div>
        <div className="text-[11px] text-slate-400">{work}</div>
      </td>
      <td className="px-6 py-4 text-slate-500">{material}</td>
      <td className="px-6 py-4">
        <Badge variant={error ? "error" : (status === "Imprimindo" ? "warning" : "neutral")}>{status}</Badge>
      </td>
      <td className="px-6 py-4 text-right">
        <Button variant="ghost" size="icon" className="h-8 w-8"><RotateCcw className="w-4 h-4" /></Button>
      </td>
    </tr>
  );
}
