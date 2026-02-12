import React from "react";
import { Button, Badge, Card, Input } from "../components/ui";
import { 
  Plus, 
  Trash2, 
  Check, 
  AlertTriangle, 
  Info, 
  Printer, 
  Clock, 
  User, 
  ChevronRight,
  Zap,
  Lock,
  Search
} from "lucide-react";

export const DesignSystem = () => {
  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-20">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold text-slate-900">Design System</h1>
        <p className="text-slate-500">Padrão visual para ID Visual - Quadros Elétricos (Lean + 5S)</p>
        <div className="h-1 w-20 bg-blue-600 rounded-full" />
      </section>

      {/* Buttons */}
      <section className="space-y-6">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Botões (Variantes e Tamanhos)</h2>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary">Principal</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="tertiary">Terciário</Button>
          <Button variant="destructive">Destrutivo</Button>
          <Button variant="ghost" size="icon"><Printer className="w-5 h-5" /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button size="sm">Pequeno</Button>
          <Button size="md">Médio (Padrão)</Button>
          <Button size="lg">Grande</Button>
        </div>
      </section>

      {/* Badges / Chips */}
      <section className="space-y-6">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Badges & Status</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="neutral">Nova</Badge>
          <Badge variant="info">Triagem</Badge>
          <Badge variant="warning">Em produção</Badge>
          <Badge variant="success">Impresso</Badge>
          <Badge variant="error">Cancelado</Badge>
          <Badge variant="urgent">Urgente</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="info">Wago</Badge>
          <Badge variant="neutral">Elesys</Badge>
          <Badge variant="neutral">SLA 24h</Badge>
          <Badge variant="warning">Atrasado</Badge>
        </div>
      </section>

      {/* Form Elements */}
      <section className="space-y-6">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Inputs & Formulários</h2>
        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600">Busca Global</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Buscar por fabricação..." className="pl-10" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600">Observação</label>
            <Input placeholder="Descreva o problema ou solicitação..." />
          </div>
        </div>
      </section>

      {/* Cards & Table Row */}
      <section className="space-y-6">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Cards & Layout</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">FAB-4022</span>
              <Lock className="w-3.5 h-3.5 text-red-500" />
            </div>
            <h4 className="font-bold text-slate-800 mb-1">WEG Motores S/A</h4>
            <p className="text-xs text-slate-500 mb-4">Quadro de Automação P01</p>
            <div className="flex items-center justify-between">
              <Badge variant="urgent">Urgente</Badge>
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                14 itens <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </Card>

          <Card className="p-5 border-blue-100 bg-blue-50/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-600 rounded-lg text-white">
                <Printer className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-800">Status Impressora</h4>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-500">Wago #1</span>
                <span className="text-emerald-600">Online</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-full w-[80%]" />
              </div>
              <p className="text-[10px] text-slate-400 text-right">80% Tinta restante</p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col items-center justify-center text-center gap-3">
            <div className="p-3 bg-slate-100 rounded-full">
              <Plus className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">Adicionar novo template</p>
          </Card>
        </div>
      </section>

      {/* Colors */}
      <section className="space-y-6">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-2">Tokens de Cores</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <ColorToken name="Primary Blue" hex="#2563EB" bg="bg-blue-600" />
          <ColorToken name="Success Green" hex="#10B981" bg="bg-emerald-500" />
          <ColorToken name="Warning Amber" hex="#F59E0B" bg="bg-amber-500" />
          <ColorToken name="Error Red" hex="#EF4444" bg="bg-red-500" />
          <ColorToken name="Slate 900" hex="#0F172A" bg="bg-slate-900" />
          <ColorToken name="Slate 100" hex="#F1F5F9" bg="bg-slate-100" />
        </div>
      </section>
    </div>
  );
};

function ColorToken({ name, hex, bg }: { name: string; hex: string; bg: string }) {
  return (
    <div className="space-y-2">
      <div className={cn("h-16 w-full rounded-2xl shadow-inner", bg)} />
      <div>
        <div className="text-xs font-bold text-slate-800">{name}</div>
        <div className="text-[10px] font-mono text-slate-400 uppercase">{hex}</div>
      </div>
    </div>
  );
}
