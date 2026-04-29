/**
 * ProductionViewUI — Tela "Produção"
 *
 * Layout:
 *   - Barra de busca proeminente (hero)
 *   - Resultados de busca com botão de docs e seleção
 *   - Lista de pedidos recentes com status e ação "Não Consta"
 *   - Modal de solicitação (BottomSheet mobile / modal desktop) — mantido
 *   - Modal "Não Consta" — novo, abre a partir de um pedido recente
 */
import React from "react";
import {
    Search,
    ChevronRight,
    Info,
    X,
    Send,
    Zap,
    Loader2,
    Factory,
    ShieldCheck,
    Wrench,
    FileText,
    AlertTriangle,
    Clock,
    CheckCircle2,
    PackageX,
    Package,
    ArrowRight,
} from "lucide-react";
import { cn, Button, Badge, Card, Input } from "./ui";
import { formatObraDisplayName } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { BottomSheet } from "./BottomSheet";
import { useDocViewer } from "../../components/DocViewerModal";
import { useBreakpoint } from "@/hooks/useBreakpoint";

// ── Types ─────────────────────────────────────────────────────────

interface WorkcenterOption {
    id: number;
    name: string;
}

interface MOResult {
    odoo_mo_id: number;
    mo_number: string;
    product_name?: string; // Nome do produto (sem código AX)
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
    comando: "Comando",
    distribuicao: "Distribuição",
    apartamento: "Apartamento",
    custom: "Personalizado",
};

const STATE_LABELS: Record<string, string> = {
    draft:     "Rascunho",
    confirmed: "Confirmado",
    progress:  "Em Produção",
    to_close:  "A Encerrar",
    done:      "Concluído",
    cancel:    "Cancelado",
};

// Status visual dos pedidos recentes
const PROD_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
    waiting:     { label: "Aguardando",   color: "text-amber-600 bg-amber-50 border-amber-200",  dot: "bg-amber-500 animate-pulse" },
    in_progress: { label: "Em Produção",  color: "text-blue-600 bg-blue-50 border-blue-200",     dot: "bg-blue-500" },
    done:        { label: "Concluído",    color: "text-emerald-600 bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
};

// ── Props ─────────────────────────────────────────────────────────

interface ProductionViewUIProps {
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    onSearch: (e: React.FormEvent) => void;
    results: MOResult[];
    searching: boolean;
    hasSearched: boolean;
    selectedMO: MOResult | null;
    setSelectedMO: (mo: MOResult | null) => void;
    workcenters: WorkcenterOption[];
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
    // Novo: callback para registrar "Não Consta"
    onNaoConsta: (requestId: string, items: string[], registradoPor: string) => Promise<void>;
}

// ── NaoConstaModal ────────────────────────────────────────────────

interface NaoConstaModalProps {
    request: any;
    blueprints: Blueprints | null;
    onConfirm: (items: string[], registradoPor: string) => Promise<void>;
    onClose: () => void;
}

function NaoConstaModal({ request, blueprints, onConfirm, onClose }: NaoConstaModalProps) {
    const [selectedItems, setSelectedItems] = React.useState<Set<string>>(new Set());
    const [registradoPor, setRegistradoPor] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);

    // Obtém os task_codes disponíveis para o panel_type do pedido
    const availableTasks: TaskOption[] = React.useMemo(() => {
        if (!blueprints) return [];
        const panel = request?.package_code || "custom";
        return (blueprints.panel_types[panel] || []).filter(t => t.code !== "QA_FINAL");
    }, [blueprints, request]);

    const toggleItem = (code: string) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const canConfirm = selectedItems.size > 0 && registradoPor.trim().length >= 2;

    const handleConfirm = async () => {
        if (!canConfirm) return;
        setSubmitting(true);
        try {
            await onConfirm(Array.from(selectedItems), registradoPor.trim());
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white w-[92vw] max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-amber-50 shrink-0">
                    <div className="flex items-center gap-2">
                        <PackageX size={18} className="text-amber-600 shrink-0" />
                        <div>
                            <p className="text-sm font-black text-amber-900">Registrar Não Consta</p>
                            <p className="text-xs text-amber-700 font-medium">{request?.mo_number}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-5 space-y-5">
                    {/* Instrução */}
                    <p className="text-sm text-slate-600">
                        Selecione os itens que <strong>não chegaram</strong> ao seu posto de trabalho:
                    </p>

                    {/* Lista de itens */}
                    <div className="space-y-2">
                        {availableTasks.map(task => (
                            <button
                                key={task.code}
                                onClick={() => toggleItem(task.code)}
                                className={cn(
                                    "w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all text-left",
                                    selectedItems.has(task.code)
                                        ? "bg-amber-50 border-amber-400 text-amber-900"
                                        : "bg-white border-slate-100 hover:border-slate-200 text-slate-700"
                                )}
                            >
                                <span className="text-sm font-bold">{task.label}</span>
                                <div className={cn(
                                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0",
                                    selectedItems.has(task.code)
                                        ? "bg-amber-500 border-amber-500"
                                        : "border-slate-300"
                                )}>
                                    {selectedItems.has(task.code) && <X size={12} className="text-white" />}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Nome do operador */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                            Seu nome *
                        </label>
                        <Input
                            placeholder="Nome completo"
                            value={registradoPor}
                            onChange={e => setRegistradoPor(e.target.value)}
                            className="h-11"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 font-bold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors text-sm"
                    >
                        Cancelar
                    </button>
                    <button
                        disabled={!canConfirm || submitting}
                        onClick={handleConfirm}
                        className={cn(
                            "flex-[2] px-4 py-2.5 font-bold text-white rounded-xl transition-colors text-sm flex items-center justify-center gap-2",
                            canConfirm && !submitting
                                ? "bg-amber-500 hover:bg-amber-600"
                                : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        )}
                    >
                        {submitting
                            ? <Loader2 size={16} className="animate-spin" />
                            : <><PackageX size={15} /> Confirmar Não Consta</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────

export const ProductionViewUI: React.FC<ProductionViewUIProps> = ({
    searchTerm,
    setSearchTerm,
    onSearch,
    results,
    searching,
    hasSearched,
    selectedMO,
    setSelectedMO,
    workcenters,
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
    history,
    onNaoConsta,
}) => {
    const currentTasks: TaskOption[] = panelType && blueprints
        ? (blueprints.panel_types[panelType] || []).filter(t => t.code !== "QA_FINAL")
        : [];

    const canSubmit = !!selectedMO && !!panelType && !!requesterName && selectedTypes.size > 0;

    const { openDocs, isLoading: docsLoading, DocViewer } = useDocViewer();
    const bp = useBreakpoint();
    const isMobile = bp === "mobile";

    // Estado do modal "Não Consta"
    const [naoConstaTarget, setNaoConstaTarget] = React.useState<any | null>(null);

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-300">

            {/* ── Hero: Busca ── */}
            <div className="space-y-2">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                        <Factory size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 leading-tight">Produção</h1>
                        <p className="text-sm text-slate-500">Solicite identificações para fabricações em andamento</p>
                    </div>
                </div>

                <form onSubmit={onSearch} className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                    <input
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Digite o número da fabricação (ex: 1659 ou WH/FAB/01659)..."
                        className="w-full pl-12 pr-12 py-4 text-base font-medium bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400 shadow-sm"
                        autoFocus
                    />
                    {searching && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <Loader2 size={20} className="animate-spin text-blue-500" />
                        </div>
                    )}
                </form>
            </div>

            {/* ── Resultados de busca ── */}
            <AnimatePresence>
                {hasSearched && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                    >
                        {results.length > 0 ? (
                            <div className="space-y-2">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">
                                    {results.length} resultado{results.length !== 1 ? "s" : ""} encontrado{results.length !== 1 ? "s" : ""}
                                </p>
                                {results.map(mo => (
                                    <div
                                        key={mo.odoo_mo_id}
                                        className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 hover:border-blue-300 hover:shadow-md transition-all group"
                                    >
                                        {/* Info */}
                                        <button
                                            onClick={() => setSelectedMO(mo)}
                                            className="flex-1 text-left min-w-0"
                                        >
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className="font-black text-slate-900">{mo.mo_number}</span>
                                                {mo.product_name && (
                                                    <span className="text-xs text-slate-600">• {mo.product_name}</span>
                                                )}
                                                <Badge variant={
                                                    mo.state === "confirmed" ? "info" :
                                                    mo.state === "progress"  ? "warning" :
                                                    mo.state === "done"      ? "success" :
                                                    mo.state === "cancel"    ? "destructive" : "neutral"
                                                }>
                                                    {STATE_LABELS[mo.state] || mo.state}
                                                </Badge>
                                                {mo.has_id_activity ? (
                                                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                                        <ShieldCheck size={10} /> Na fila ID
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-orange-500 font-bold flex items-center gap-1 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
                                                        <AlertTriangle size={10} /> Fora da fila
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-500 truncate">
                                                {formatObraDisplayName(mo.obra) || "Sem obra definida"}
                                            </p>
                                        </button>

                                        {/* Ações */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={e => { e.stopPropagation(); openDocs(mo.odoo_mo_id, mo.mo_number); }}
                                                disabled={docsLoading(mo.odoo_mo_id)}
                                                title="Ver documentos"
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors disabled:opacity-50"
                                            >
                                                {docsLoading(mo.odoo_mo_id)
                                                    ? <Loader2 size={16} className="animate-spin" />
                                                    : <FileText size={16} />
                                                }
                                            </button>
                                            <button
                                                onClick={() => setSelectedMO(mo)}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/20"
                                            >
                                                Solicitar <ArrowRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : !searching ? (
                            <div className="text-center py-12 text-slate-400">
                                <Search size={40} className="mx-auto mb-3 opacity-20" />
                                <p className="font-bold">Nenhuma fabricação encontrada</p>
                                <p className="text-sm mt-1">Verifique o número e tente novamente</p>
                            </div>
                        ) : null}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Pedidos Recentes ── */}
            {!hasSearched && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest">
                            Meus Pedidos Recentes
                        </h2>
                        {history.length > 0 && (
                            <span className="text-xs font-bold text-slate-400">{history.length} pedido{history.length !== 1 ? "s" : ""}</span>
                        )}
                    </div>

                    {history.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
                            <Package size={40} className="mx-auto mb-3 text-slate-300" />
                            <p className="font-bold text-slate-500">Nenhum pedido ainda</p>
                            <p className="text-sm text-slate-400 mt-1">
                                Busque uma fabricação acima para solicitar identificações
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {history.map((req: any) => {
                                const cfg = PROD_STATUS_CONFIG[req.production_status] || PROD_STATUS_CONFIG.waiting;
                                const hasNaoConsta = !!req.nao_consta_em;
                                const isOpen = req.production_status !== "done";

                                return (
                                    <div
                                        key={req.id}
                                        className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 hover:shadow-sm transition-all"
                                    >
                                        {/* Status dot */}
                                        <div className={cn("w-2.5 h-2.5 rounded-full shrink-0 mt-0.5", cfg.dot)} />

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <span className="font-black text-slate-900 text-sm">{req.mo_number}</span>
                                                {req.product_name && (
                                                    <span className="text-xs text-slate-600">• {req.product_name}</span>
                                                )}
                                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", cfg.color)}>
                                                    {cfg.label}
                                                </span>
                                                {req.priority === "urgente" && (
                                                    <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                                                        URGENTE
                                                    </span>
                                                )}
                                                {hasNaoConsta && (
                                                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                                                        <PackageX size={9} /> Não Consta
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 truncate">
                                                {PANEL_LABELS[req.package_code] || req.package_code}
                                                {req.obra && req.obra !== "Sem Obra" ? ` · ${req.obra}` : ""}
                                            </p>
                                        </div>

                                        {/* Ação "Não Consta" — só para pedidos abertos sem registro anterior */}
                                        {isOpen && !hasNaoConsta && (
                                            <button
                                                onClick={() => setNaoConstaTarget(req)}
                                                title="Registrar que a ID não chegou"
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors shrink-0"
                                            >
                                                <PackageX size={13} />
                                                Não Consta
                                            </button>
                                        )}

                                        {/* Concluído */}
                                        {req.production_status === "done" && (
                                            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Modal de Solicitação (mantido) ── */}
            {isMobile ? (
                <BottomSheet
                    isOpen={!!selectedMO}
                    onClose={() => setSelectedMO(null)}
                    title="Nova Solicitação"
                    maxHeight="95vh"
                >
                    <RequestForm
                        selectedMO={selectedMO}
                        workcenters={workcenters}
                        requesterName={requesterName}
                        setRequesterName={setRequesterName}
                        panelType={panelType}
                        handleSelectPanel={handleSelectPanel}
                        selectedTypes={selectedTypes}
                        toggleType={toggleType}
                        notes={notes}
                        setNotes={setNotes}
                        handleSubmit={handleSubmit}
                        submitting={submitting}
                        blueprints={blueprints}
                        currentTasks={currentTasks}
                        canSubmit={canSubmit}
                        onClose={() => setSelectedMO(null)}
                    />
                </BottomSheet>
            ) : (
                <AnimatePresence>
                    {selectedMO && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100]"
                                onClick={() => setSelectedMO(null)}
                            />
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl z-[101] overflow-hidden flex flex-col max-h-[90vh]"
                            >
                                <RequestForm
                                    selectedMO={selectedMO}
                                    workcenters={workcenters}
                                    requesterName={requesterName}
                                    setRequesterName={setRequesterName}
                                    panelType={panelType}
                                    handleSelectPanel={handleSelectPanel}
                                    selectedTypes={selectedTypes}
                                    toggleType={toggleType}
                                    notes={notes}
                                    setNotes={setNotes}
                                    handleSubmit={handleSubmit}
                                    submitting={submitting}
                                    blueprints={blueprints}
                                    currentTasks={currentTasks}
                                    canSubmit={canSubmit}
                                    onClose={() => setSelectedMO(null)}
                                />
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            )}

            {/* ── Modal Não Consta ── */}
            {naoConstaTarget && (
                <NaoConstaModal
                    request={naoConstaTarget}
                    blueprints={blueprints}
                    onConfirm={(items, registradoPor) =>
                        onNaoConsta(naoConstaTarget.id, items, registradoPor)
                    }
                    onClose={() => setNaoConstaTarget(null)}
                />
            )}

            <DocViewer />
        </div>
    );
};

// ── RequestForm (extraído do modal para reutilização mobile/desktop) ──

interface RequestFormProps {
    selectedMO: MOResult | null;
    workcenters: WorkcenterOption[];
    requesterName: string;
    setRequesterName: (v: string) => void;
    panelType: string | null;
    handleSelectPanel: (v: string) => void;
    selectedTypes: Set<string>;
    toggleType: (v: string) => void;
    notes: string;
    setNotes: (v: string) => void;
    handleSubmit: () => void;
    submitting: boolean;
    blueprints: Blueprints | null;
    currentTasks: TaskOption[];
    canSubmit: boolean;
    onClose: () => void;
}

function RequestForm({
    selectedMO,
    workcenters,
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
    currentTasks,
    canSubmit,
    onClose,
}: RequestFormProps) {
    return (
        <div className="p-8 space-y-6 overflow-y-auto flex-1">
            {/* Header do modal */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900">Nova Solicitação</h2>
                    {selectedMO && (
                        <p className="text-sm text-slate-500 font-bold mt-0.5">
                            {selectedMO.mo_number} — {formatObraDisplayName(selectedMO.obra) || "Sem obra"}
                        </p>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Aviso fora da fila */}
            {selectedMO && !selectedMO.has_id_activity && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-amber-800">Fora da fila padrão</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                            Essa MO não tem atividade "Identificação" ativa no Odoo.
                        </p>
                    </div>
                </div>
            )}

            {/* Solicitante */}
            <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Quem está solicitando? *
                </label>
                {workcenters.length === 0 ? (
                    <div className="h-12 flex items-center px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-400 font-medium">
                        <Loader2 size={14} className="animate-spin mr-2 shrink-0" />
                        Carregando mesas...
                    </div>
                ) : (
                    <div className="relative">
                        <select
                            value={requesterName}
                            onChange={e => setRequesterName(e.target.value)}
                            className={cn(
                                "w-full h-12 pl-4 pr-10 rounded-xl border-2 font-bold text-sm appearance-none transition-all outline-none cursor-pointer",
                                requesterName
                                    ? "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-100"
                                    : "border-slate-200 bg-white text-slate-500 hover:border-blue-300"
                            )}
                        >
                            <option value="">Selecione a mesa...</option>
                            {workcenters.map(wc => (
                                <option key={wc.id} value={wc.name}>
                                    {wc.name}
                                </option>
                            ))}
                        </select>
                        {/* Ícone de seta customizado */}
                        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                            <svg className={cn("w-4 h-4 transition-colors", requesterName ? "text-blue-500" : "text-slate-400")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                )}
            </div>

            {/* Tipo do quadro */}
            <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Tipo do Quadro *
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {Object.entries(PANEL_LABELS).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => handleSelectPanel(key)}
                            className={cn(
                                "p-4 min-h-[44px] rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between",
                                panelType === key
                                    ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100"
                                    : "border-slate-100 text-slate-700 hover:border-blue-200 hover:bg-slate-50"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Wrench size={15} className={panelType === key ? "text-blue-500" : "text-slate-400"} />
                                {label}
                            </div>
                            <div className={cn(
                                "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                                panelType === key ? "bg-blue-600 border-blue-600" : "border-slate-200"
                            )}>
                                {panelType === key && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Itens necessários */}
            {panelType && currentTasks.length > 0 && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        Itens Necessários ({selectedTypes.size})
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {currentTasks.map(task => (
                            <button
                                key={task.code}
                                onClick={() => toggleType(task.code)}
                                className={cn(
                                    "px-4 py-3 min-h-[44px] text-xs font-bold rounded-xl border transition-all text-left flex items-center justify-between",
                                    selectedTypes.has(task.code)
                                        ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20"
                                        : "bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300"
                                )}
                            >
                                {task.label}
                                {selectedTypes.has(task.code) && <CheckCircle2 size={14} />}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Observação */}
            <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Observação Adicional
                </label>
                <Input
                    placeholder="Ex: Urgente, cliente na fábrica..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="h-12"
                />
            </div>

            {/* Badge express */}
            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 flex items-center gap-3">
                <div className="p-2 bg-rose-100 rounded-xl">
                    <Zap className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                    <p className="text-sm font-black text-rose-900">Entrega Express</p>
                    <p className="text-[10px] text-rose-600 font-bold uppercase tracking-widest">
                        Prioridade Máxima em Fila
                    </p>
                </div>
            </div>

            {/* CTA */}
            <div className="sticky bottom-0 bg-white pt-2 pb-1">
                <Button
                    className="w-full h-14 rounded-[1.5rem] text-xl font-black uppercase tracking-tight gap-3 shadow-2xl shadow-blue-500/30"
                    onClick={handleSubmit}
                    disabled={!canSubmit || submitting}
                >
                    {submitting
                        ? <><Loader2 className="animate-spin" size={22} /> Enviando...</>
                        : <><Send className="w-5 h-5" /> Solicitar AGORA</>
                    }
                </Button>
            </div>
        </div>
    );
}
