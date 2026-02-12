import React, { useState } from "react";
import { 
  Search, 
  Filter, 
  Clock, 
  AlertTriangle, 
  Printer, 
  CheckCircle2, 
  ChevronRight, 
  Lock,
  Bolt,
  X,
  ExternalLink,
  Zap,
  Check,
  RotateCcw,
  FileText,
  ClipboardList,
  User,
  Factory,
  Calendar,
  AlertCircle,
  MoreVertical
} from "lucide-react";
import { cn, Button, Badge, Card, KPICard } from "../components/ui";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

// --- Mock Data ---
const MOCK_REQUESTS = [
  {
    id: "FAB-4022",
    workName: "Shopping Center Norte",
    client: "WEG Motores",
    panel: "QD-Geral-P01",
    status: "Triagem",
    priority: "Urgente",
    dateStart: "09/02/2026",
    sla: "SLA: +3h atrasado",
    qty: 14,
    blocked: false,
    section: "urgent",
    type: "Wago 210-804"
  },
  {
    id: "FAB-3988",
    workName: "Hospital das Clínicas",
    client: "Suzano Celulose",
    panel: "Painel Automação #4",
    status: "Nova",
    priority: "Alta",
    dateStart: "10/02/2026",
    sla: "SLA: vence em 6h",
    qty: 28,
    blocked: true,
    section: "this_week",
    type: "Wago 210-855"
  },
  {
    id: "FAB-4015",
    workName: "Prédio Residencial Sky",
    client: "Nestlé Alimentos",
    panel: "Quadro de Distribuição 220V",
    status: "Em produção",
    priority: "Normal",
    dateStart: "11/02/2026",
    sla: "SLA: vence em 24h",
    qty: 8,
    blocked: false,
    section: "this_week",
    type: "Elesys EFZ"
  }
];

const MOCK_PRINTERS = [
  { name: "Wago #1", status: "Online", queue: 2, lastJob: "FAB-4022", alerts: null },
  { name: "Wago #2", status: "Online", queue: 0, lastJob: "FAB-4010", alerts: "Pouca tinta" },
  { name: "Elesys", status: "Offline", queue: 5, lastJob: "FAB-3990", alerts: "Impressora offline" },
];

export const DashboardID = () => {
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleCardClick = (req: any) => {
    setSelectedReq(req);
    setIsDrawerOpen(true);
  };

  return (
    <div className="flex flex-col gap-8 h-full">
      {/* A) TOPO: Painel da Semana (Gestão Visual) */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Urgentes Hoje" value={3} subtext="SLA Crítico" variant="error" />
        <KPICard label="Esta Semana" value={12} subtext="Por data agendada" variant="info" />
        <KPICard label="Atrasadas" value={2} subtext="Ação necessária" variant="warning" />
        <KPICard label="Bloqueadas" value={5} subtext="Falta de dados" variant="error" />
        <KPICard label="Reimpressões" value={1} subtext="Solicitado p/ Prod" variant="default" />
        <KPICard label="Impressoras" value="2/3" subtext="Status: Online" variant="success" />
      </section>

      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
        {/* B) CENTRO: Fila de Trabalho (Swimlanes) */}
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              Fila de Trabalho (Swimlanes)
            </h2>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="gap-2">
                <Filter className="w-4 h-4" />
                Filtros
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-8">
            {/* Swimlane: Urgente */}
            <Swimlane title="Urgente (SLA Hoje)" color="bg-red-500" count={1}>
              {MOCK_REQUESTS.filter(r => r.section === "urgent").map(req => (
                <KanbanCard key={req.id} req={req} onClick={() => handleCardClick(req)} />
              ))}
            </Swimlane>

            {/* Swimlane: Esta Semana */}
            <Swimlane title="Esta Semana (date_start)" color="bg-blue-500" count={2}>
              {MOCK_REQUESTS.filter(r => r.section === "this_week").map(req => (
                <KanbanCard key={req.id} req={req} onClick={() => handleCardClick(req)} />
              ))}
            </Swimlane>

            {/* Swimlane: Próximas */}
            <Swimlane title="Próximas" color="bg-slate-300" count={0}>
              <div className="col-span-full py-8 border-2 border-dashed border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-sm">
                Nenhuma solicitação agendada para as próximas semanas
              </div>
            </Swimlane>
          </div>
        </div>

        {/* C) DIREITA: Andon + Impressoras */}
        <div className="lg:w-80 flex flex-col gap-8 shrink-0">
          {/* Andon / Alertas */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Andon (Alertas)
            </h3>
            <div className="space-y-3">
              <AndonAlert 
                title="Faltam dados do disjuntor" 
                desc="Fabricação #FAB-3988 (Suzano)" 
                type="error" 
              />
              <AndonAlert 
                title="Impressora Offline" 
                desc="Elesys Thermal #1 sem conexão" 
                type="warning" 
              />
              <AndonAlert 
                title="Reimpressão solicitada" 
                desc="Adesivo de porta FAB-3950" 
                type="info" 
              />
            </div>
          </section>

          {/* Status das Impressoras */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Printer className="w-4 h-4 text-blue-500" />
              Status Impressoras
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {MOCK_PRINTERS.map((p, idx) => (
                <PrinterStatusCard key={idx} printer={p} />
              ))}
            </div>
          </section>

          {/* Agenda do Dia (D) */}
          <section className="mt-auto pt-6 border-t border-slate-200">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Agenda do Dia</h3>
            <div className="space-y-3">
              <div className="flex gap-3 text-xs">
                <span className="font-bold text-slate-800">09:00</span>
                <span className="text-slate-500">Imprimir FAB-4022 (Crítico)</span>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="font-bold text-slate-800">14:00</span>
                <span className="text-slate-500">Configuração Elesys</span>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="font-bold text-red-600 underline">Conflito:</span>
                <span className="text-slate-500 italic">Excesso de carga p/ tarde</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Drawer Detalhes (Reaproveitado) */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50"
              onClick={() => setIsDrawerOpen(false)}
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-lg font-bold">Resumo da Solicitação</h2>
                    <p className="text-sm text-slate-500">{selectedReq?.id}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setIsDrawerOpen(false)}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>

                <div className="space-y-8">
                  <section className="p-4 bg-slate-50 rounded-2xl space-y-4">
                    <div className="flex justify-between">
                      <span className="text-xs font-bold text-slate-400">OBRA</span>
                      <span className="text-xs font-bold text-slate-800 uppercase">{selectedReq?.workName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs font-bold text-slate-400">DATA AGENDADA</span>
                      <span className="text-xs font-bold text-slate-800">{selectedReq?.dateStart}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs font-bold text-slate-400">SLA</span>
                      <span className="text-xs font-bold text-amber-600">{selectedReq?.sla}</span>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Itens de Impressão</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 border border-slate-100 rounded-xl">
                        <span className="text-sm text-slate-700">{selectedReq?.type}</span>
                        <Badge variant="neutral">{selectedReq?.qty} un</Badge>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Ações Rápidas</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Button className="gap-2"><Zap className="w-4 h-4" /> Iniciar</Button>
                      <Button variant="secondary" className="gap-2"><Printer className="w-4 h-4" /> Imprimir</Button>
                      <Button variant="secondary" className="gap-2 text-red-600 hover:bg-red-50"><Lock className="w-4 h-4" /> Bloquear</Button>
                      <Button variant="primary" className="bg-emerald-600 hover:bg-emerald-700 gap-2"><Check className="w-4 h-4" /> Concluir</Button>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Documentos</h3>
                    <div className="grid grid-cols-1 gap-2">
                      <DocButton label="Diagrama Elétrico" status="OK" />
                      <DocButton label="Lista de Legendas" status="FALTA" />
                    </div>
                  </section>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Sub-components ---

function Swimlane({ title, color, count, children }: { title: string; color: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={cn("w-1.5 h-6 rounded-full", color)} />
        <h3 className="font-bold text-slate-700">{title}</h3>
        <Badge variant="neutral" className="bg-slate-100 text-slate-500">{count}</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {children}
      </div>
    </div>
  );
}

function KanbanCard({ req, onClick }: { req: any; onClick: () => void }) {
  return (
    <Card className="p-4 hover:shadow-lg transition-all border-slate-200 group cursor-pointer relative overflow-hidden" onClick={onClick}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{req.id}</span>
          <h4 className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-blue-600 transition-colors">{req.workName}</h4>
        </div>
        {req.blocked && (
          <div className="p-1 bg-red-100 rounded text-red-600">
            <Lock className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      
      <p className="text-xs text-slate-500 mb-4 line-clamp-1">{req.client} / {req.panel}</p>
      
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          {req.dateStart}
        </div>
        <div className={cn(
          "text-[11px] font-bold flex items-center gap-2",
          req.sla.includes("atrasado") ? "text-red-500" : "text-amber-600"
        )}>
          <Clock className="w-3.5 h-3.5" />
          {req.sla}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-50">
        <div className="flex gap-1.5 flex-wrap">
          <Badge variant={req.priority === "Urgente" ? "urgent" : "info"}>{req.priority}</Badge>
          <Badge variant="neutral" className="lowercase">{req.type}</Badge>
        </div>
        <span className="text-[10px] font-bold text-slate-400">{req.qty} pçs</span>
      </div>
    </Card>
  );
}

function AndonAlert({ title, desc, type }: { title: string; desc: string; type: "error" | "warning" | "info" }) {
  const styles = {
    error: "bg-red-50 border-red-100 text-red-800 icon-red-500",
    warning: "bg-amber-50 border-amber-100 text-amber-800 icon-amber-500",
    info: "bg-blue-50 border-blue-100 text-blue-800 icon-blue-500",
  };

  return (
    <div className={cn("p-4 border rounded-xl flex gap-3 transition-all hover:shadow-sm", styles[type])}>
      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold leading-tight truncate">{title}</p>
        <p className="text-[10px] opacity-70 mt-1 line-clamp-1">{desc}</p>
        <div className="flex gap-3 mt-3">
          <button className="text-[10px] font-bold underline">Resolver</button>
          <button className="text-[10px] font-bold underline opacity-50">Atribuir</button>
        </div>
      </div>
    </div>
  );
}

function PrinterStatusCard({ printer }: { printer: any }) {
  const isOnline = printer.status === "Online";
  return (
    <div className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-200 transition-all group">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Printer className={cn("w-4 h-4", isOnline ? "text-blue-500" : "text-slate-300")} />
          <span className="text-sm font-bold text-slate-800">{printer.name}</span>
        </div>
        <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-emerald-500" : "bg-red-500")} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-bold">
          <span className="text-slate-400">FILA: {printer.queue} jobs</span>
          <span className="text-slate-400">LAST: {printer.lastJob}</span>
        </div>
        {printer.alerts && (
          <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">
            <AlertTriangle className="w-3 h-3" />
            {printer.alerts}
          </div>
        )}
      </div>
    </div>
  );
}

function DocButton({ label, status }: { label: string; status: "OK" | "FALTA" }) {
  return (
    <button className="flex items-center justify-between w-full p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all">
      <div className="flex items-center gap-3">
        <FileText className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <Badge variant={status === "OK" ? "success" : "error"}>{status}</Badge>
    </button>
  );
}
