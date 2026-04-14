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
    Zap,
    Loader2,
    Factory,
    Scan,
    ShieldCheck,
    Wrench,
    FileText
} from "lucide-react";
import { cn, Button, Badge, Card, Input } from "./ui";
import { formatObraDisplayName } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { BottomSheet } from "./BottomSheet";
import { useBreakpoint } from "@/hooks/useBreakpoint";

interface MOResult {
    odoo_mo_id: number;
    mo_number: string;
    obra: string | null;
    product_qty: number;
    date_start: string | null;
    state: string;
    has_id_activity: boolean;
}

interface TaskOption {
    code: string;
    label: string;
}

interface Blueprints {
    panel_types: Record<string, TaskOption[]>;
    task_labels: Record<string, string>;
}

const PANEL_LABELS: Record<string, string> = {
    comando: 'Comando',
    distribuicao: 'Distribuição',
    apartamento: 'Apartamento',
    custom: 'Personalizado',
};

const STATE_LABELS: Record<string, string> = {
    draft:     'Rascunho',
    confirmed: 'Confirmado',
    progress:  'Em Produção',
    to_close:  'A Encerrar',
    done:      'Concluído',
    cancel:    'Cancelado',
};

interface ProductionViewUIProps {
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    onSearch: (e: React.FormEvent) => void;
    results: MOResult[];
    searching: boolean;
    hasSearched: boolean;
    selectedMO: MOResult | null;
    setSelectedMO: (mo: MOResult | null) => void;
    requesterName: string;
    setRequesterName: (val: string) => void;
    panelType: string | null;
    handleSelectPanel: (type: string) => void;
    selectedTypes: Set<string>;
    toggleType: (code: string) => void;
    notes: string;
    setNotes: (val: string) => void;
    handleSubmit: () => void;
    submitting: boolean;
    blueprints: Blueprints | null;
    history: any[];
}

export const ProductionViewUI: React.FC<ProductionViewUIProps> = ({
    searchTerm,
    setSearchTerm,
    onSearch,
    results,
    searching,
    hasSearched,
    selectedMO,
    setSelectedMO,
    requesterName,
    setRequesterName,
    panelType,
    handleSelectPanel,
    selectedTypes,
    toggleType,
    notes,
    setNotes,
    handleSubmit,
    submitting,
    blueprints,
    history
}) => {
    const currentTasks: TaskOption[] = panelType && blueprints
        ? (blueprints.panel_types[panelType] || []).filter(t => t.code !== 'QA_FINAL')
        : [];

    const canSubmit = !!selectedMO && !!panelType && requesterName.trim().length >= 2 && selectedTypes.size > 0;

    // Docs modal state
    const [docsMO, setDocsMO] = useState<{ id: number; number: string } | null>(null);

    const bp = useBreakpoint();
    const isMobile = bp === 'mobile';

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header com busca de Fabricação */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Solicitar Identificação</h1>
                    <p className="text-slate-500 mt-1">Produção de Quadros Elétricos</p>
                </div>
                <form onSubmit={onSearch} className="w-full relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Digite o nº da fabricação..."
                        className="pl-10 h-12 text-base font-bold"
                    />
                    {searching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 size={18} className="animate-spin text-blue-600" />
                        </div>
                    )}
                </form>
            </div>

            {/* Search Results Area */}
            {hasSearched && results.length > 0 && (
                <Card className="p-6 space-y-4 border-blue-100 bg-blue-50/10">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-emerald-500" /> {results.length} resultado(s) encontrados
                    </h3>
                    <div className="grid gap-3">
                        {results.map((mo) => (
                            <div
                                key={mo.odoo_mo_id}
                                className="w-full bg-white p-4 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all flex items-center justify-between group"
                            >
                                <button
                                    onClick={() => setSelectedMO(mo)}
                                    className="flex items-center gap-4 flex-1 text-left"
                                >
                                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                        <Factory size={20} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="font-bold text-slate-900">{mo.mo_number}</span>
                                            <Badge variant={
                                                mo.state === 'confirmed' ? 'info' :
                                                mo.state === 'progress'  ? 'warning' :
                                                mo.state === 'to_close'  ? 'warning' :
                                                mo.state === 'done'      ? 'success' :
                                                mo.state === 'cancel'    ? 'destructive' :
                                                'neutral'
                                            }>
                                                {STATE_LABELS[mo.state] || mo.state}
                                            </Badge>
                                            {mo.has_id_activity ? (
                                                <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                    <ShieldCheck size={10} /> Na fila ID
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-orange-500 font-bold flex items-center gap-1 bg-orange-50 px-2 py-0.5 rounded-full">
                                                    <AlertTriangle size={10} /> Fora da fila
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium truncate max-w-[250px]">{formatObraDisplayName(mo.obra) || 'Sem obra definida'}</p>
                                    </div>
                                </button>
                                <div className="flex items-center gap-2 shrink-0 ml-4">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setDocsMO({ id: mo.odoo_mo_id, number: mo.mo_number }); }}
                                        title="Ver Documentos do Produto"
                                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-500 text-xs font-bold rounded-xl transition-colors"
                                    >
                                        <FileText size={14} />
                                        Docs
                                    </button>
                                    <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {hasSearched && results.length === 0 && !searching && (
                <Card className="p-12 text-center text-slate-400 border-dashed">
                    <Search size={48} className="mx-auto mb-3 opacity-20" />
                    <p className="font-bold text-lg">Nenhuma fabricação encontrada</p>
                    <p className="text-sm">Verifique o número e tente novamente</p>
                </Card>
            )}

            {/* Hero Card - 1-Click Request */}
            {!hasSearched && (
                <Card className="overflow-visible relative border-blue-200 bg-gradient-to-br from-blue-50/50 to-white shadow-xl shadow-blue-500/5">
                    <div className="p-8">
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="flex-1 space-y-4">
                                <div className="flex items-center gap-3">
                                    <Badge variant="info">Início Rápido</Badge>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-800">Pronto para liberar o kit de identificação?</h2>
                                <p className="text-slate-600 max-w-lg">
                                    Busque o número da fabricação acima para iniciar uma solicitação urgente para o setor de ID Visual.
                                    Garantimos o checklist 5S e a prontidão dos diagramas.
                                </p>

                                <div className="pt-4 flex items-center gap-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                                            <Scan size={24} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">Scan & Go</p>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Processo Lean</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="hidden lg:block w-48 shrink-0">
                                <div className="relative">
                                    <div className="w-40 h-40 bg-blue-100 rounded-full flex items-center justify-center">
                                        <PlusCircle className="w-20 h-20 text-blue-500 opacity-20" />
                                    </div>
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                                        <div className="text-3xl font-bold text-blue-600 italic tracking-tighter">Real-time</div>
                                        <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-1">Odoo Sync</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Lado Esquerdo: Checklist de Recebimento */}
                <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        Checklist de Recebimento
                    </h3>
                    <Card className="p-6 space-y-4">
                        <p className="text-sm text-slate-500 font-medium">Confirme se o kit de identificação recebido está correto:</p>
                        <div className="space-y-3">
                            <RecebimentoItem label="Etiquetas de Componentes (Wago)" />
                            <RecebimentoItem label="Tags de Cabos (Elesys)" />
                            <RecebimentoItem label="Placas da Porta (210-855)" />
                            <RecebimentoItem label="Sinalizações de Segurança" />
                        </div>
                        <div className="pt-4 border-t border-slate-100">
                            <Button variant="secondary" className="w-full gap-2 text-rose-600 hover:bg-rose-50 hover:border-rose-100 transition-all font-bold">
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
                        Meus Pedidos Recentes
                    </h3>
                    <div className="space-y-3">
                        {history.length > 0 ? (
                            history.map((req) => (
                                <HistoryCard
                                    key={req.id}
                                    id={req.mo_number}
                                    status={req.production_status === 'done' ? 'Entregue' : req.production_status === 'in_progress' ? 'Em Produção' : 'Aguardando'}
                                    time={new Date(req.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    items={PANEL_LABELS[req.package_code] || req.package_code}
                                    isWarning={req.production_status !== 'done'}
                                />
                            ))
                        ) : (
                            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                                <Clock className="mx-auto mb-2 opacity-20" size={32} />
                                <p className="text-xs font-medium">Nenhuma solicitação recente encontrada.</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {/* Modal de Solicitação — BottomSheet em mobile, modal centralizado em >= sm */}
            {isMobile ? (
                <BottomSheet
                    isOpen={!!selectedMO}
                    onClose={() => setSelectedMO(null)}
                    title="Nova Solicitação"
                    maxHeight="95vh"
                >
                    <div className="p-6 space-y-6">
                        {selectedMO && (
                            <p className="text-sm text-slate-500 font-bold">
                                Fabricação #{selectedMO.mo_number} — {formatObraDisplayName(selectedMO.obra) || 'Sem obra'}
                            </p>
                        )}

                        {selectedMO && !selectedMO.has_id_activity && (
                            <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                                <Info size={20} className="text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-bold text-amber-800">Fora da fila padrão</p>
                                    <p className="text-xs text-amber-600 mt-0.5">Essa MO não tem atividade "Identificação" ativa no Odoo.</p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Quem está solicitando? *</label>
                            <Input placeholder="Seu nome completo" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} className="h-12 font-bold px-4" />
                        </div>

                        <div className="space-y-3">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Tipo do Quadro *</label>
                            <div className="grid grid-cols-2 gap-3">
                                {Object.entries(PANEL_LABELS).map(([key, label]) => (
                                    <button key={key} onClick={() => handleSelectPanel(key)}
                                        className={cn("p-4 min-h-[44px] rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between",
                                            panelType === key ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100" : "border-slate-100 text-slate-700 hover:border-blue-200 hover:bg-slate-50")}>
                                        <div className="flex items-center gap-2"><Wrench size={16} className={panelType === key ? 'text-blue-500' : 'text-slate-400'} />{label}</div>
                                        <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", panelType === key ? "bg-blue-600 border-blue-600" : "border-slate-200")}>
                                            {panelType === key && <div className="w-2 h-2 bg-white rounded-full" />}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {panelType && currentTasks.length > 0 && (
                            <div className="space-y-3">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Itens Necessários ({selectedTypes.size})</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {currentTasks.map((task) => (
                                        <button key={task.code} onClick={() => toggleType(task.code)}
                                            className={cn("px-4 py-3 min-h-[44px] text-xs font-bold rounded-xl border transition-all text-left flex items-center justify-between",
                                                selectedTypes.has(task.code) ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300")}>
                                            {task.label}{selectedTypes.has(task.code) && <CheckCircle2 size={14} />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Observação Adicional</label>
                            <Input placeholder="Ex: Urgente, cliente na fábrica..." value={notes} onChange={(e) => setNotes(e.target.value)} className="h-12" />
                        </div>

                        <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 flex items-center gap-3">
                            <div className="p-2 bg-rose-100 rounded-xl"><Zap className="w-5 h-5 text-rose-600" /></div>
                            <div>
                                <p className="text-sm font-black text-rose-900">Entrega Express</p>
                                <p className="text-[10px] text-rose-600 font-bold uppercase tracking-widest">Prioridade Máxima em Fila</p>
                            </div>
                        </div>

                        {/* CTA sticky dentro do scroll container */}
                        <div className="sticky bottom-0 bg-white pt-2 pb-2">
                            <Button className="w-full h-14 rounded-[1.5rem] text-xl font-black uppercase tracking-tight gap-3 shadow-2xl shadow-blue-500/30"
                                onClick={handleSubmit} disabled={!canSubmit || submitting}>
                                {submitting ? (<><Loader2 className="animate-spin" size={24} /> Enviando...</>) : (<>Solicitar AGORA <Send className="w-6 h-6" /></>)}
                            </Button>
                        </div>
                    </div>
                </BottomSheet>
            ) : (
                <AnimatePresence>
                    {selectedMO && (
                        <>
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100]" onClick={() => setSelectedMO(null)} />
                            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl z-[101] overflow-hidden flex flex-col max-h-[90vh]">
                                <div className="p-8 space-y-6 overflow-y-auto">
                                    <div className="flex items-center justify-between mb-2">
                                        <div>
                                            <h2 className="text-2xl font-black text-slate-900">Nova Solicitação</h2>
                                            <p className="text-sm text-slate-500 font-bold">Fabricação #{selectedMO.mo_number} — {formatObraDisplayName(selectedMO.obra) || 'Sem obra'}</p>
                                        </div>
                                        <Button variant="ghost" size="icon" className="p-2 hover:bg-slate-100 rounded-full" onClick={() => setSelectedMO(null)}>
                                            <X className="w-6 h-6 text-slate-400" />
                                        </Button>
                                    </div>

                                    {!selectedMO.has_id_activity && (
                                        <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                                            <Info size={20} className="text-amber-500 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-sm font-bold text-amber-800">Fora da fila padrão</p>
                                                <p className="text-xs text-amber-600 mt-0.5">Essa MO não tem atividade "Identificação" ativa no Odoo.</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Quem está solicitando? *</label>
                                        <Input placeholder="Seu nome completo" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} className="h-12 font-bold px-4" />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Tipo do Quadro *</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {Object.entries(PANEL_LABELS).map(([key, label]) => (
                                                <button key={key} onClick={() => handleSelectPanel(key)}
                                                    className={cn("p-4 min-h-[44px] rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between group",
                                                        panelType === key ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100" : "border-slate-100 text-slate-700 hover:border-blue-200 hover:bg-slate-50")}>
                                                    <div className="flex items-center gap-2"><Wrench size={16} className={panelType === key ? 'text-blue-500' : 'text-slate-400'} />{label}</div>
                                                    <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all", panelType === key ? "bg-blue-600 border-blue-600" : "border-slate-200")}>
                                                        {panelType === key && <div className="w-2 h-2 bg-white rounded-full" />}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {panelType && currentTasks.length > 0 && (
                                        <div className="space-y-3 animate-in slide-in-from-top-2">
                                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Itens Necessários ({selectedTypes.size})</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {currentTasks.map((task) => (
                                                    <button key={task.code} onClick={() => toggleType(task.code)}
                                                        className={cn("px-4 py-3 min-h-[44px] text-xs font-bold rounded-xl border transition-all text-left flex items-center justify-between",
                                                            selectedTypes.has(task.code) ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300")}>
                                                        {task.label}{selectedTypes.has(task.code) && <CheckCircle2 size={14} />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Observação Adicional</label>
                                        <Input placeholder="Ex: Urgente, cliente na fábrica..." value={notes} onChange={(e) => setNotes(e.target.value)} className="h-12" />
                                    </div>

                                    <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 flex items-center gap-3">
                                        <div className="p-2 bg-rose-100 rounded-xl"><Zap className="w-5 h-5 text-rose-600" /></div>
                                        <div>
                                            <p className="text-sm font-black text-rose-900">Entrega Express</p>
                                            <p className="text-[10px] text-rose-600 font-bold uppercase tracking-widest">Prioridade Máxima em Fila</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-8 pt-4 sticky bottom-0 bg-white">
                                    <Button className="w-full h-14 rounded-[1.5rem] text-xl font-black uppercase tracking-tight gap-3 shadow-2xl shadow-blue-500/30"
                                        onClick={handleSubmit} disabled={!canSubmit || submitting}>
                                        {submitting ? (<><Loader2 className="animate-spin" size={24} /> Enviando...</>) : (<>Solicitar AGORA <Send className="w-6 h-6" /></>)}
                                    </Button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            )}

            {/* Modal de Documentos do Produto */}
            {docsMO && (
                <DocumentPreviewModal
                    moId={String(docsMO.id)}
                    moNumber={docsMO.number}
                    onClose={() => setDocsMO(null)}
                />
            )}
        </div>
    );
};

// --- Sub-components (Aesthetics Only) ---

function RecebimentoItem({ label }: { label: string }) {
    const [checked, setChecked] = React.useState(false);
    return (
        <button
            onClick={() => setChecked(!checked)}
            className={cn(
                "flex items-center justify-between p-4 w-full rounded-2xl border transition-all",
                checked ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100 hover:border-slate-200"
            )}
        >
            <span className={cn("text-sm font-bold", checked ? "text-emerald-700" : "text-slate-600")}>{label}</span>
            <div className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                checked ? "bg-emerald-500 border-emerald-500" : "bg-slate-50 border-slate-200"
            )}>
                {checked && <CheckCircle2 className="w-4 h-4 text-white" />}
            </div>
        </button>
    );
}

function HistoryCard({ id, status, time, items, isWarning }: { id: string; status: string; time: string; items: string; isWarning?: boolean }) {
    return (
        <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl hover:shadow-lg hover:shadow-slate-100 transition-all group">
            <div className="flex items-center gap-4">
                <div className={cn(
                    "p-2.5 rounded-xl transition-colors",
                    isWarning ? "bg-amber-100 text-amber-600" : "bg-blue-50 text-blue-600"
                )}>
                    <Clock className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="text-sm font-black text-slate-800 tracking-tight">{id}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{time} • {items}</p>
                </div>
            </div>
            <div className="text-right">
                <Badge variant={isWarning ? "warning" : "success"} className="mb-1">{status}</Badge>
                <div className="text-[10px] text-slate-400 group-hover:text-blue-600 flex items-center justify-end gap-1 cursor-pointer font-bold">
                    Rastrear <ChevronRight className="w-3 h-3" />
                </div>
            </div>
        </div>
    );
}
