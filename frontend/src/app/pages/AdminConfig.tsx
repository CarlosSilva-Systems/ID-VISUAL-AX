import React, { useState } from "react";
import { 
  Printer, 
  LayoutTemplate, 
  ShieldCheck, 
  Zap, 
  Plus, 
  Search, 
  Wifi, 
  MoreVertical, 
  Settings2,
  AlertCircle
} from "lucide-react";
import { cn, Button, Badge, Card, Input } from "../components/ui";

export const AdminConfig = () => {
  const [activeTab, setActiveTab] = useState("printers");

  const tabs = [
    { id: "printers", label: "Impressoras", icon: Printer },
    { id: "templates", label: "Templates", icon: LayoutTemplate },
    { id: "rules", label: "Regras de Prioridade", icon: Zap },
    { id: "perms", label: "Permissões", icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900">Configurações do Sistema</h1>
        <div className="flex gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all",
                activeTab === tab.id 
                  ? "bg-white text-blue-600 shadow-sm border border-slate-200" 
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="min-h-[500px]">
        {activeTab === "printers" && <PrintersTab />}
        {activeTab === "templates" && <TemplatesTab />}
        {activeTab === "rules" && <RulesTab />}
        {activeTab === "perms" && <PermissionsTab />}
      </Card>
    </div>
  );
};

// --- Tab Components ---

function PrintersTab() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar impressora..." className="pl-10" />
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Adicionar Impressora
        </Button>
      </div>

      <div className="border border-slate-100 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome / Modelo</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Endereço IP / Host</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <PrinterRow name="Wago Smart Script #1" model="Wago 258-5000" ip="192.168.1.45" status="online" />
            <PrinterRow name="Wago Smart Script #2" model="Wago 258-5000" ip="192.168.1.46" status="online" />
            <PrinterRow name="Elesys Thermal #1" model="Elesys EF-100" ip="192.168.1.50" status="offline" />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PrinterRow({ name, model, ip, status }: any) {
  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-6 py-4">
        <div className="font-bold text-sm text-slate-800">{name}</div>
        <div className="text-xs text-slate-500">{model}</div>
      </td>
      <td className="px-6 py-4 font-mono text-xs text-slate-600">{ip}</td>
      <td className="px-6 py-4">
        <Badge variant={status === "online" ? "success" : "error"}>{status}</Badge>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm">Testar</Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
        </div>
      </td>
    </tr>
  );
}

function TemplatesTab() {
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TemplateCard name="Material 210-804" category="Wago" version="v2.4" />
        <TemplateCard name="Material 210-805" category="Wago" version="v1.1" />
        <TemplateCard name="Placa Porta 210-855" category="Wago" version="v3.0" />
        <TemplateCard name="Tag Cabo EFZ" category="Elesys" version="v1.0" />
        <div className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 text-slate-400 gap-2 hover:border-blue-300 hover:text-blue-500 transition-all cursor-pointer">
          <Plus className="w-8 h-8" />
          <span className="text-sm font-bold">Novo Template</span>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ name, category, version }: any) {
  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <Badge variant="info">{category}</Badge>
        <span className="text-[10px] font-bold text-slate-400">{version}</span>
      </div>
      <h4 className="font-bold text-slate-800 mb-6">{name}</h4>
      <div className="flex items-center justify-between border-t border-slate-50 pt-4">
        <Button variant="ghost" size="sm" className="text-xs">Visualizar</Button>
        <Button variant="secondary" size="sm" className="text-xs">Editar</Button>
      </div>
    </Card>
  );
}

function RulesTab() {
  return (
    <div className="p-8 max-w-2xl">
      <h3 className="text-lg font-bold mb-6">Regras de Prioridade Automática</h3>
      <div className="space-y-4">
        <RuleItem title="Semana Atual" desc="Fabricações agendadas para a semana ganham prioridade Alta" active />
        <RuleItem title="Atrasado" desc="Qualquer solicitação com mais de 3h de atraso vira Urgente" active />
        <RuleItem title="Parada de Linha" desc="Solicitações manuais marcadas como 'Urgente' furam a fila" active />
        <RuleItem title="Volume Grande" desc="Mais de 50 tags: notificar responsável por e-mail" />
      </div>
      <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 leading-relaxed">
          As regras de prioridade são processadas a cada sincronização com o Odoo (MRP). 
          Mudanças aqui impactam a fila de trabalho de todos os usuários.
        </p>
      </div>
    </div>
  );
}

function RuleItem({ title, desc, active }: any) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
      <div>
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      <div className={cn(
        "w-12 h-6 rounded-full relative cursor-pointer transition-all",
        active ? "bg-blue-600" : "bg-slate-300"
      )}>
        <div className={cn(
          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
          active ? "left-7" : "left-1"
        )} />
      </div>
    </div>
  );
}

function PermissionsTab() {
  return (
    <div className="p-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <RoleCard title="ID Responsável" users={2} permissions={["Acessar Dashboard", "Imprimir", "Configurar Impressoras", "Gerenciar Templates"]} />
        <RoleCard title="Produção" users={14} permissions={["Solicitar ID", "Ver Histórico", "Reportar Erro"]} />
        <RoleCard title="Visualizador" users={5} permissions={["Ver Dashboard", "Ver Relatórios"]} />
      </div>
    </div>
  );
}

function RoleCard({ title, users, permissions }: any) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-lg">{title}</h3>
        <Badge variant="neutral">{users} usuários</Badge>
      </div>
      <div className="space-y-2 mb-6">
        {permissions.map((p: string, idx: number) => (
          <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            {p}
          </div>
        ))}
      </div>
      <Button variant="secondary" className="w-full">Editar Permissões</Button>
    </Card>
  );
}
