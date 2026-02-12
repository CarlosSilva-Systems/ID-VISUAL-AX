import React, { useState } from "react";
import { 
  Search, 
  Filter, 
  Printer, 
  Lock,
  Zap,
  Check,
  RotateCcw,
  MoreVertical,
  ChevronDown,
  FileSearch,
  Download,
  Eye
} from "lucide-react";
import { cn, Button, Badge, Card, Input } from "../components/ui";
import { toast } from "sonner";

const MOCK_DATA = [
  { id: "FAB-4022", work: "Shopping Norte", client: "WEG", date: "09/02/2026", sla: "+3h", qty: 14, type: "Wago 210-804", printer: "Wago #1", status: "Em produção", priority: "Urgente" },
  { id: "FAB-3988", work: "Hospital Clínicas", client: "Suzano", date: "10/02/2026", sla: "6h", qty: 28, type: "Wago 210-855", printer: "Wago #2", status: "Nova", priority: "Alta" },
  { id: "FAB-4015", work: "Edifício Sky", client: "Nestlé", date: "11/02/2026", sla: "24h", qty: 8, type: "Elesys EFZ", printer: "Elesys", status: "Aguardando", priority: "Normal" },
  { id: "FAB-3950", work: "Fábrica Coca-Cola", client: "Coca-Cola", date: "08/02/2026", sla: "+24h", qty: 12, type: "Wago 210-804", printer: "Wago #1", status: "Impresso", priority: "Baixa" },
];

export const RequestsPage = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const handleAction = (action: string, id: string) => {
    toast.success(`${action} em ${id} realizado com sucesso.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Solicitações de Identificação</h1>
          <p className="text-sm text-slate-500 mt-1">Gestão de execução e rastreio de etiquetas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="gap-2"><Download className="w-4 h-4" /> Exportar</Button>
          <Button className="gap-2"><Printer className="w-4 h-4" /> Imprimir Lote</Button>
        </div>
      </div>

      {/* Filtros Fortes (Lean) */}
      <Card className="p-4 bg-slate-50 border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Buscar por Nº Fabricação, Obra, Cliente..." 
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all">
            <option>Status: Todos</option>
            <option>Nova</option>
            <option>Em produção</option>
            <option>Bloqueada</option>
          </select>
          <select className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all">
            <option>Prioridade: Todas</option>
            <option>Urgente</option>
            <option>Alta</option>
            <option>Normal</option>
          </select>
          <Button variant="secondary" className="gap-2">
            <Filter className="w-4 h-4" />
            Mais Filtros
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Badge variant="error" className="cursor-pointer">Atrasadas</Badge>
          <Badge variant="warning" className="cursor-pointer">Bloqueadas</Badge>
          <Badge variant="info" className="cursor-pointer">Hoje (SLA)</Badge>
          <Badge variant="neutral" className="cursor-pointer">Sem Documentos</Badge>
        </div>
      </Card>

      {/* Tabela Principal */}
      <Card className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status/Prioridade</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Identificação</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Obra / Cliente</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Agendamento/SLA</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalhes</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações Lean</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MOCK_DATA.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <Badge variant={row.status === "Bloqueada" ? "error" : (row.status === "Em produção" ? "warning" : "info")}>{row.status}</Badge>
                    <Badge variant={row.priority === "Urgente" ? "urgent" : "neutral"} className="w-fit">{row.priority}</Badge>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-sm text-slate-900">{row.id}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{row.type}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-slate-700">{row.work}</div>
                  <div className="text-[10px] text-slate-400">{row.client}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-bold text-slate-700">{row.date}</div>
                  <div className={cn("text-[11px] font-bold", row.sla.includes("+") ? "text-red-500" : "text-amber-600")}>
                    SLA: {row.sla}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-600 font-bold">{row.qty} pçs</span>
                    <span className="text-[10px] text-slate-400 italic">{row.printer}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ActionIconButton icon={Zap} tooltip="Iniciar" onClick={() => handleAction("Iniciado", row.id)} />
                    <ActionIconButton icon={Lock} tooltip="Bloquear" onClick={() => handleAction("Bloqueado", row.id)} color="text-red-500" />
                    <ActionIconButton icon={Printer} tooltip="Imprimir" onClick={() => handleAction("Enviado para impressora", row.id)} />
                    <ActionIconButton icon={RotateCcw} tooltip="Reimprimir" onClick={() => handleAction("Solicitado reimpressão", row.id)} />
                    <ActionIconButton icon={Check} tooltip="Concluir" onClick={() => handleAction("Concluído", row.id)} color="text-emerald-600" />
                    <div className="w-[1px] h-4 bg-slate-200 mx-1" />
                    <ActionIconButton icon={Eye} tooltip="Ver Detalhes" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

function ActionIconButton({ icon: Icon, tooltip, onClick, color }: { icon: any; tooltip: string; onClick?: () => void; color?: string }) {
  return (
    <button 
      onClick={onClick}
      title={tooltip}
      className={cn(
        "p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all active:scale-95 cursor-pointer",
        color ? color : "text-slate-500"
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
