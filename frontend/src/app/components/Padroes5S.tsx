import React, { useState } from 'react';
import { 
  BookOpen, 
  CheckSquare, 
  Tag, 
  AlertTriangle, 
  Lightbulb, 
  ChevronRight, 
  Copy, 
  CheckCircle2, 
  Layers,
  ArrowRight,
  ClipboardCheck,
  Info,
  X
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Padroes5S() {
  const [selectedStandard, setSelectedStandard] = useState<string | null>(null);

  const sections = [
    {
      id: 'ordem',
      title: 'Trabalho Padronizado — Ordem das Caixinhas',
      icon: Layers,
      color: 'blue',
      desc: 'Sequência oficial para garantir fluxo e evitar retrabalho.',
      content: [
        '1. Diagrama + Legenda (Sempre iniciar primeiro)',
        '2. Identificação Externa (Porta)',
        '3. Identificações Internas (Componentes/Bornes)',
        '4. Identificações de Fiação (EFZ)',
        '5. Conferência Final (QA)'
      ]
    },
    {
      id: 'nomenclatura',
      title: 'Nomenclatura e Convenções',
      icon: Tag,
      color: 'indigo',
      desc: 'Padrão de escrita para identificações visuais.',
      content: [
        'Disjuntores: QX-FXX (ex: Q1-F10)',
        'Bornes: X:Y (ex: X1:25)',
        'Fios: Origem/Destino (ex: K1:13/K2:A1)',
        'Placas: Fonte Arial Bold, Tamanho 12pt'
      ]
    },
    {
      id: 'bloqueios',
      title: 'Motivos de Bloqueio Padronizados',
      icon: AlertTriangle,
      color: 'rose',
      desc: 'Classificações oficiais para reportar problemas.',
      content: [
        'INF: Informação Incompleta no Projeto',
        'MAT: Falta de Insumo (Etiqueta/Fita)',
        'DOC: Diagrama desatualizado ou ilegível',
        'PRJ: Alteração de projeto em andamento'
      ]
    }
  ];

  const checklists = [
    { id: 'docs', label: 'Epson (Docs)', count: 3 },
    { id: '210-804', label: 'Wago 210-804', count: 4 },
    { id: '210-805', label: 'Wago 210-805', count: 3 },
    { id: 'efz', label: 'EFZ Tag Cabo', count: 5 },
    { id: 'qa', label: 'QA Final', count: 6 },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Padrões 5S & Trabalho Padronizado</h2>
          <p className="text-sm text-slate-500">Manual operacional vivo. O sucesso da produção depende da padronização.</p>
        </div>
        <button className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-white transition-colors">
          Editar (Admin)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Standards */}
        <div className="lg:col-span-2 space-y-6">
          {sections.map((section) => (
            <div 
              key={section.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden group hover:shadow-md transition-all"
            >
              <div className="p-6 flex items-start gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg",
                  section.color === 'blue' && "bg-blue-600 text-white shadow-blue-600/20",
                  section.color === 'indigo' && "bg-indigo-600 text-white shadow-indigo-600/20",
                  section.color === 'rose' && "bg-rose-600 text-white shadow-rose-600/20"
                )}>
                  <section.icon size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 text-lg mb-1">{section.title}</h3>
                  <p className="text-xs text-slate-500 mb-4">{section.desc}</p>
                  <div className="space-y-2 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    {section.content.map((line, idx) => (
                      <div key={idx} className="flex items-center justify-between group/line">
                        <span className="text-sm font-medium text-slate-700">{line}</span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(line);
                            toast.success('Copiado para área de transferência');
                          }}
                          className="p-1.5 opacity-0 group-hover/line:opacity-100 text-slate-400 hover:text-blue-600 transition-all"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Kaizen Section */}
          <div className="bg-emerald-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-600/20 flex items-center justify-between group cursor-pointer active:scale-[0.99] transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Lightbulb size={24} />
              </div>
              <div>
                <h3 className="font-bold text-lg">Kaizen / Melhoria Contínua</h3>
                <p className="text-emerald-100 text-xs">Viu algo que pode ser melhorado? Sugira aqui.</p>
              </div>
            </div>
            <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" />
          </div>
        </div>

        {/* Sidebar: Checklists */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <ClipboardCheck size={18} /> Checklists Padrão
            </h3>
            <div className="space-y-2">
              {checklists.map((check) => (
                <button 
                  key={check.id}
                  onClick={() => setSelectedStandard(check.label)}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors font-bold text-xs">
                      {check.count}
                    </div>
                    <span className="text-sm font-bold text-slate-700">{check.label}</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              <Info size={16} /> Dica de Produtividade
            </div>
            <p className="text-xs text-slate-600 leading-relaxed italic">
              "Sempre inicie a impressão do Diagrama e Legenda (Epson) no início de cada MO. Enquanto a impressora trabalha, você monta as tags na SmartScript. Reduz o tempo de espera em 40%."
            </p>
          </div>
        </div>
      </div>

      {/* Drawer: Standard Checklist */}
      {selectedStandard && (
        <StandardDrawer title={selectedStandard} onClose={() => setSelectedStandard(null)} />
      )}
    </div>
  );
}

function StandardDrawer({ title, onClose }: { title: string, onClose: () => void }) {
  const steps = [
    'Verificar arquivo PDF do diagrama',
    'Conferir se todas as páginas estão corretas',
    'Selecionar impressora Epson L3250',
    'Papel A4 gramatura padrão',
    'Marcar como "Imprimindo" no sistema'
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-300" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50">
          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Padrão Operacional</div>
            <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-4">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Passos do Checklist</h4>
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-4 p-4 rounded-xl border border-slate-50 bg-slate-50/30">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 font-bold text-[10px]">
                    {idx + 1}
                  </div>
                  <span className="text-sm font-medium text-slate-700">{step}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-[10px] font-black text-amber-600 uppercase mb-1">Atenção (Poka-yoke)</p>
            <p className="text-xs text-amber-800 font-medium leading-relaxed">
              Não pule etapas. A falta de conferência inicial causa perda de insumos e tempo na montagem do quadro.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-slate-50">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
