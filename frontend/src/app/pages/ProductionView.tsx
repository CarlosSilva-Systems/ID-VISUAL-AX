import React, { useState } from "react";
import { 
  PlusCircle, 
  Search, 
  History, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ChevronRight,
  Info,
  X,
  Send,
  Zap
} from "lucide-react";
import { cn, Button, Badge, Card, Input } from "../components/ui";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

export const ProductionView = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [requestStatus, setRequestStatus] = useState<"none" | "sent">("none");
  const [searchTerm, setSearchTerm] = useState("FAB-4022");

  const handleRequest = () => {
    setIsModalOpen(false);
    setRequestStatus("sent");
    toast.success("Solicitação enviada com alta prioridade!");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header com busca de Fabricação */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Solicitar Identificação</h1>
          <p className="text-slate-500 mt-1">Produção de Quadros Elétricos</p>
        </div>
        <div className="w-full sm:w-80 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Digite o nº da fabricação..." 
            className="pl-10 h-12 text-base font-bold"
          />
        </div>
      </div>

      {/* Card Principal de Ação */}
      <Card className="overflow-visible relative border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
        <div className="p-8">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant="info">Fabricação #{searchTerm}</Badge>
                {requestStatus === "sent" && <Badge variant="success">Solicitado</Badge>}
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Precisa de identificação visual para este quadro?</h2>
              <p className="text-slate-600 max-w-lg">
                Se os diagramas mudaram ou se faltam etiquetas na linha, solicite aqui. 
                O responsável pelo ID Visual receberá uma notificação instantânea.
              </p>
              
              <div className="pt-4 flex flex-wrap gap-4">
                <Button 
                  size="lg" 
                  className="h-14 px-8 rounded-2xl text-lg shadow-xl shadow-blue-500/20 gap-3"
                  onClick={() => setIsModalOpen(true)}
                  disabled={requestStatus === "sent"}
                >
                  <PlusCircle className="w-6 h-6" />
                  {requestStatus === "sent" ? "Solicitação em Fila" : "Solicitar ID"}
                </Button>
                
                {requestStatus === "sent" && (
                  <div className="flex items-center gap-2 text-emerald-600 font-bold px-4">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Enviado para Triagem</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="hidden lg:block w-48 shrink-0">
              <div className="relative">
                <div className="w-40 h-40 bg-blue-100 rounded-full flex items-center justify-center">
                  <PlusCircle className="w-20 h-20 text-blue-500 opacity-20" />
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                  <div className="text-3xl font-bold text-blue-600">1-Click</div>
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-1">Lean Process</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Lado Esquerdo: Checklist de Recebimento */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Checklist de Recebimento
          </h3>
          <Card className="p-6 space-y-4">
            <p className="text-sm text-slate-500">Confirme se o kit de identificação recebido está correto:</p>
            <div className="space-y-3">
              <RecebimentoItem label="Etiquetas de Componentes (Wago)" />
              <RecebimentoItem label="Tags de Cabos (Elesys)" />
              <RecebimentoItem label="Placas da Porta (210-855)" />
              <RecebimentoItem label="Sinalizações de Segurança" />
            </div>
            <div className="pt-4 border-t border-slate-100">
              <Button variant="secondary" className="w-full gap-2 text-rose-600 hover:bg-rose-50 hover:border-rose-100 transition-all">
                <AlertTriangle className="w-4 h-4" />
                Reportar Item Faltando / Errado
              </Button>
            </div>
          </Card>
        </section>

        {/* Lado Direito: Histórico Rápido */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <History className="w-4 h-4 text-blue-500" />
            Últimas Solicitações
          </h3>
          <div className="space-y-3">
            <HistoryCard 
              id="FAB-4015" 
              status="Entregue" 
              time="Há 2 horas" 
              items="8 tags" 
            />
            <HistoryCard 
              id="FAB-3988" 
              status="Aguardando Impressão" 
              time="Há 5 horas" 
              items="28 tags" 
              isWarning
            />
            <HistoryCard 
              id="FAB-3950" 
              status="Entregue" 
              time="Ontem" 
              items="12 tags" 
            />
          </div>
        </section>
      </div>

      {/* Modal de Solicitação */}
      <AnimatePresence>
        {isModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100]"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-3xl shadow-2xl z-[101] overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Nova Solicitação</h2>
                    <p className="text-sm text-slate-500">Fabricação #{searchTerm}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">O que está faltando?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <SelectOption label="Tags de Cabo" />
                      <SelectOption label="Régua de Borne" />
                      <SelectOption label="Porta do Quadro" />
                      <SelectOption label="Sinalização" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Observação Rápida</label>
                    <Input placeholder="Ex: Alteração de projeto no disjuntor geral..." />
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-100 rounded-lg">
                        <Zap className="w-4 h-4 text-red-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">Urgente</p>
                        <p className="text-[10px] text-slate-500">Marcar se houver parada de linha</p>
                      </div>
                    </div>
                    <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-pointer">
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all" />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <Button variant="secondary" className="flex-1 h-12 rounded-xl" onClick={() => setIsModalOpen(false)}>
                      Cancelar
                    </Button>
                    <Button className="flex-1 h-12 rounded-xl gap-2" onClick={handleRequest}>
                      <Send className="w-4 h-4" />
                      Enviar Solicitação
                    </Button>
                  </div>
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

function RecebimentoItem({ label }: { label: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <button 
      onClick={() => setChecked(!checked)}
      className={cn(
        "flex items-center justify-between p-4 w-full rounded-2xl border transition-all",
        checked ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100 hover:border-slate-200"
      )}
    >
      <span className={cn("text-sm font-medium", checked ? "text-emerald-700" : "text-slate-600")}>{label}</span>
      <div className={cn(
        "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
        checked ? "bg-emerald-500 border-emerald-500" : "bg-slate-100 border-slate-200"
      )}>
        {checked && <CheckCircle2 className="w-4 h-4 text-white" />}
      </div>
    </button>
  );
}

function HistoryCard({ id, status, time, items, isWarning }: { id: string; status: string; time: string; items: string; isWarning?: boolean }) {
  return (
    <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl hover:shadow-sm transition-shadow group">
      <div className="flex items-center gap-4">
        <div className={cn(
          "p-2.5 rounded-xl",
          isWarning ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"
        )}>
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">{id}</h4>
          <p className="text-[11px] text-slate-500">{time} • {items}</p>
        </div>
      </div>
      <div className="text-right">
        <Badge variant={isWarning ? "warning" : "success"} className="mb-1">{status}</Badge>
        <div className="text-[10px] text-slate-400 group-hover:text-blue-600 flex items-center justify-end gap-1 cursor-pointer">
          Ver detalhes <ChevronRight className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}

function SelectOption({ label }: { label: string }) {
  const [selected, setSelected] = useState(false);
  return (
    <button
      onClick={() => setSelected(!selected)}
      className={cn(
        "px-4 py-2 text-xs font-bold rounded-xl border transition-all text-center",
        selected ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300"
      )}
    >
      {label}
    </button>
  );
}
