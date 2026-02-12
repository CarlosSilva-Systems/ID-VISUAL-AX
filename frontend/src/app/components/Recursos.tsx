import React, { useState } from 'react';
import {
  Printer,
  ClipboardCheck,
  BarChart3,
  Calendar,
  Plus,
  ChevronRight,
  History,
  ShieldAlert,
  Save,
  X
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Recursos() {
  const [isElesysModalOpen, setIsElesysModalOpen] = useState(false);
  const [elesysHistory, setElesysHistory] = useState<any[]>([]);

  const handleSaveElesys = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Registro de impressão Elesys salvo!');
    setIsElesysModalOpen(false);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Top Grid: Checklists */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ResourceCard
          title="Checklist Epson (Docs)"
          desc="Verificações diárias de papel e níveis de tinta."
          icon={Printer}
          items={[
            'Verificar bandeja de papel A4',
            'Checar níveis de tinta (C/M/Y/K)',
            'Limpeza de cabeçote (se necessário)'
          ]}
        />
        <ResourceCard
          title="Setup do Lote (Smart Script)"
          desc="Garantir que a impressora está pronta para o lote."
          icon={ClipboardCheck}
          items={[
            'Conectar Wago Smart Script',
            'Carregar rolo de etiquetas correto',
            'Calibrar sensor de etiquetas'
          ]}
        />
        <ResourceCard
          title="Padrão 5S (Bancada)"
          desc="Manutenção da ordem e limpeza digital/física."
          icon={ShieldAlert}
          items={[
            'Arquivos de identificação organizados',
            'Bancada limpa e sem sobras',
            'Ferramentas de aplicação no lugar'
          ]}
        />
      </div>

      {/* Elesys Balance Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <BarChart3 size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Balanço Anual — Sinalizações Elesys</h2>
              <p className="text-sm text-slate-500">Controle de triângulos de atenção e etiquetas raras.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option>Ano 2026</option>
              <option>Ano 2025</option>
            </select>
            <button
              onClick={() => setIsElesysModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-md active:scale-95"
            >
              <Plus size={18} /> Registrar Impressão em Lote
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Stats */}
          <div className="space-y-4">
            <div className="p-6 rounded-2xl border-2 border-indigo-50 bg-indigo-50/30 flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1">ETA T58 460 211 F</p>
                <p className="text-3xl font-black text-slate-800">0 <span className="text-sm font-medium text-slate-400">un/ano</span></p>
              </div>
              <div className="w-16 h-1 bg-indigo-200 rounded-full" />
            </div>
            <div className="p-6 rounded-2xl border-2 border-slate-50 bg-slate-50/30 flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">ETA T96 460 211 F</p>
                <p className="text-3xl font-black text-slate-800">0 <span className="text-sm font-medium text-slate-400">un/ano</span></p>
              </div>
              <div className="w-16 h-1 bg-slate-200 rounded-full" />
            </div>
          </div>

          {/* History */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <History size={18} className="text-slate-400" />
              Histórico de Impressão (2026)
            </div>
            <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-100">
              {elesysHistory.map(log => (
                <div key={log.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-500">{log.date}</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-bold">{log.code}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-black text-slate-800">Qtd: {log.qty}</span>
                    <span className="text-slate-400 italic">{log.obs}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Elesys */}
      {isElesysModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Registrar Lote Elesys</h3>
              <button onClick={() => setIsElesysModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveElesys} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data</label>
                <input type="date" className="w-full p-2 rounded-lg border border-gray-200 font-medium" defaultValue="2026-02-09" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Código de Sinalização</label>
                <select className="w-full p-2 rounded-lg border border-gray-200 font-medium">
                  <option>ETA T58 460 211 F</option>
                  <option>ETA T96 460 211 F</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quantidade</label>
                <input type="number" className="w-full p-2 rounded-lg border border-gray-200 font-medium" placeholder="0" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Observação</label>
                <textarea className="w-full p-2 rounded-lg border border-gray-200 font-medium h-20" placeholder="Motivo da impressão..." />
              </div>
              <button className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all">
                <Save size={18} /> Salvar Registro
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ResourceCard({ title, desc, icon: Icon, items }: { title: string, desc: string, icon: any, items: string[] }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <Icon size={20} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 leading-tight">{title}</h3>
          <p className="text-[11px] text-slate-500">{desc}</p>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-3 group">
            <div className="mt-1 w-4 h-4 rounded-full border-2 border-blue-200 flex items-center justify-center group-hover:border-blue-500 transition-colors">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 opacity-0 group-hover:opacity-100" />
            </div>
            <span className="text-xs font-medium text-slate-600">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
