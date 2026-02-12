import React from "react";
import { 
  Search, 
  Factory, 
  ChevronRight, 
  FileText, 
  Calendar,
  Layers,
  Info,
  PlusCircle,
  AlertTriangle,
  Check
} from "lucide-react";
import { cn, Button, Badge, Card, Input } from "../components/ui";
import { toast } from "sonner";

const MOCK_MRP = [
  { id: "FAB-4022", work: "Shopping Norte", product: "Quadro Geral de Distribuição", qty: 1, date: "09/02/2026", odooStatus: "Em Progresso", idStatus: "Em produção", docs: "OK" },
  { id: "FAB-3988", work: "Hospital Clínicas", product: "Painel Automação #4", qty: 2, date: "10/02/2026", odooStatus: "Confirmado", idStatus: "Nova", docs: "FALTA" },
  { id: "FAB-4015", work: "Edifício Sky", product: "Quadro 220V", qty: 1, date: "11/02/2026", odooStatus: "Confirmado", idStatus: "Aguardando", docs: "OK" },
  { id: "FAB-4050", work: "Arena Multiuse", product: "Quadro de Comando", qty: 4, date: "15/02/2026", odooStatus: "Esboço", idStatus: "--", docs: "FALTA" },
];

export const MRPPage = () => {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Fabricações (MRP Odoo)</h1>
          <p className="text-sm text-slate-500 mt-1">Sincronização em tempo real com ordens de produção</p>
        </div>
        <Button variant="secondary" className="gap-2">
          <Layers className="w-4 h-4" />
          Sincronizar Odoo
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filtros e Busca */}
        <Card className="lg:col-span-1 p-6 space-y-6 h-fit">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Nº Fab ou Obra..." className="pl-10" />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Filtros Odoo</label>
            <div className="flex flex-col gap-2">
              <FilterToggle label="Vencem esta semana" active />
              <FilterToggle label="Aguardando componentes" />
              <FilterToggle label="Somente confirmadas" />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-xl text-xs font-medium">
              <Info className="w-4 h-4 shrink-0" />
              Mostrando ordens com data agendada (date_start) até 16/02.
            </div>
          </div>
        </Card>

        {/* Lista de Fabricações */}
        <div className="lg:col-span-3 space-y-4">
          {MOCK_MRP.map((mrp) => (
            <Card key={mrp.id} className="p-5 hover:border-blue-300 transition-all group">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1 flex gap-4">
                  <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-blue-50 transition-colors shrink-0">
                    <Factory className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-800">{mrp.id}</h3>
                      <Badge variant="neutral" className="text-[10px]">{mrp.odooStatus}</Badge>
                    </div>
                    <p className="text-sm font-bold text-slate-700 truncate">{mrp.work}</p>
                    <p className="text-xs text-slate-500 mt-1">{mrp.product} • {mrp.qty} un</p>
                  </div>
                </div>

                <div className="flex items-center gap-8 px-6 border-x border-slate-50">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Agendado</span>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Calendar className="w-3.5 h-3.5 text-slate-300" />
                      {mrp.date}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Documentos</span>
                    <div className={cn(
                      "flex items-center gap-1.5 text-xs font-bold",
                      mrp.docs === "OK" ? "text-emerald-600" : "text-red-500"
                    )}>
                      {mrp.docs === "OK" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      {mrp.docs}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">ID Visual</span>
                    <Badge variant={mrp.idStatus === "--" ? "neutral" : "info"}>{mrp.idStatus}</Badge>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="icon" className="h-10 w-10">
                    <FileText className="w-4 h-4" />
                  </Button>
                  <Button className="gap-2 h-10 px-4">
                    {mrp.idStatus === "--" ? (
                      <>
                        <PlusCircle className="w-4 h-4" />
                        Criar Solicitação
                      </>
                    ) : (
                      <>
                        Ver Detalhes
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

function FilterToggle({ label, active }: { label: string; active?: boolean }) {
  return (
    <button className={cn(
      "flex items-center justify-between w-full p-3 rounded-xl border text-left text-xs font-bold transition-all",
      active 
        ? "bg-blue-600 border-blue-600 text-white shadow-md" 
        : "bg-white border-slate-100 text-slate-600 hover:border-slate-200"
    )}>
      {label}
      {active && <Check className="w-3.5 h-3.5" />}
    </button>
  );
}

function CheckCircle2({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>
    </svg>
  );
}
