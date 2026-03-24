import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    ChevronLeft, Download, Share2, Calendar, Layout, 
    BarChart3, PieChart as PieIcon, LineChart as LineIcon, Activity,
    Loader2, AlertCircle, RefreshCw, Sparkles
} from 'lucide-react';
import { 
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { Button, cn, Card, Badge } from '../../components/ui';
import { api } from '../../../services/api';
import { toast } from 'sonner';

// --- Helper Components ---

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

const ChartWrapper = ({ widget, children }: { widget: any, children: React.ReactNode }) => (
    <div className={cn(
        "bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[400px]",
        widget.grid_size === 'full' ? "lg:col-span-4" : 
        widget.grid_size === 'half' ? "lg:col-span-2" : "lg:col-span-1"
    )}>
        <div className="flex items-center justify-between mb-6">
            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                {widget.type === 'bar' && <BarChart3 size={18} className="text-blue-500" />}
                {widget.type === 'pie' && <PieIcon size={18} className="text-emerald-500" />}
                {widget.type === 'line' && <LineIcon size={18} className="text-amber-500" />}
                {widget.type === 'kpi' && <Activity size={18} className="text-rose-500" />}
                {widget.title}
            </h4>
            <Badge variant="neutral">Auto-Sync</Badge>
        </div>
        <div className="flex-1 min-h-0">
            {children}
        </div>
    </div>
);

// --- Main Dashboard Component ---

export const DynamicDashboard = () => {
    const { reportId } = useParams();
    const navigate = useNavigate();
    const [report, setReport] = useState<any>(null);
    const [chartData, setChartData] = useState<Record<string, any[]>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const reportData = await api.getCustomReport(reportId!);
            setReport(reportData);

            // Fetch data for each widget
            const items = reportData.layout_config.widgets || reportData.layout_config.charts || [];
            const dataPromises = items.map(async (widget: any) => {
                try {
                    const endpoint = widget.data_source_endpoint || widget.data_source_url;
                    const queryString = widget.params ? '?' + new URLSearchParams(widget.params).toString() : '';
                    const data = await api.get(`${endpoint}${queryString}`);
                    const finalData = Array.isArray(data) ? data : (data.data || [data]);
                    return { id: widget.title, data: finalData };
                } catch (e) {
                    return { id: widget.title, data: [], error: true };
                }
            });

            const results = await Promise.all(dataPromises);
            const newData: Record<string, any[]> = {};
            results.forEach(r => {
                // Normalização inteligente para Recharts (necessita label/value)
                const normalized = r.data.map((item: any) => {
                    const newItem = { ...item };
                    // Se não tem label, tenta chaves comuns
                    if (!newItem.label) {
                        newItem.label = item.nome || item.name || item.dia || item.date || item.motivo || item.category || 'N/A';
                    }
                    // Se não tem value, tenta chaves numéricas comuns
                    if (newItem.value === undefined) {
                        newItem.value = item.ids_concluidas || item.solicitadas || item.total || item.quantidade || item.qtd || item.horas_paradas_total || 0;
                    }
                    return newItem;
                });
                newData[r.id] = normalized;
            });
            setChartData(newData);
        } catch (e) {
            toast.error("Erro ao carregar dashboard");
            navigate('/relatorios/meus');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [reportId]);

    if (isLoading) {
        return (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-slate-400">
                <Loader2 size={48} className="animate-spin text-blue-500" />
                <p className="font-medium animate-pulse">Sincronizando fontes de dados operacionais...</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto pb-20">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                <div className="space-y-4">
                    <button 
                        onClick={() => navigate('/relatorios/meus')}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-blue-600 transition-colors text-sm font-bold uppercase tracking-widest"
                    >
                        <ChevronLeft size={16} />
                        Voltar para Meus Relatórios
                    </button>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                             <h1 className="text-4xl font-black text-slate-900 tracking-tight">{report.title}</h1>
                             <Badge variant="info">IA Generated</Badge>
                        </div>
                        <p className="text-slate-500 text-lg max-w-3xl">{report.description}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={loadData} className="rounded-xl shadow-sm">
                        <RefreshCw size={18} className="mr-2" />
                        Atualizar
                    </Button>
                    <Button className="rounded-xl shadow-lg">
                        <Download size={18} className="mr-2" />
                        Exportar PDF
                    </Button>
                </div>
            </div>

            {/* Proactive Insights Section (BI v3) */}
            {report.layout_config.proactive_insights && report.layout_config.proactive_insights.length > 0 && (
                <div className="mb-10 space-y-4">
                    <div className="flex items-center gap-2 text-blue-700 font-bold text-sm uppercase tracking-widest mb-4 px-1">
                        <Sparkles size={16} />
                        Consultoria Proativa Lean & Odoo
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {report.layout_config.proactive_insights.map((insight: any, idx: number) => (
                            <div key={idx} className={cn(
                                "p-6 rounded-2xl border transition-all hover:translate-y-[-4px]",
                                insight.type === 'warning' ? "bg-red-50 border-red-100 text-red-900 shadow-sm shadow-red-500/10" :
                                insight.type === 'odoo_tip' ? "bg-blue-50 border-blue-100 text-blue-900 shadow-sm shadow-blue-500/10" :
                                "bg-emerald-50 border-emerald-100 text-emerald-900 shadow-sm shadow-emerald-500/10"
                            )}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={cn(
                                        "p-2 rounded-lg",
                                        insight.type === 'warning' ? "bg-red-500 text-white" :
                                        insight.type === 'odoo_tip' ? "bg-blue-600 text-white" :
                                        "bg-emerald-600 text-white"
                                    )}>
                                        {insight.type === 'warning' ? <AlertCircle size={18} /> : 
                                         insight.type === 'odoo_tip' ? <Layout size={18} /> : <Sparkles size={18} />}
                                    </div>
                                    <h5 className="font-bold text-lg">{insight.title}</h5>
                                </div>
                                <p className="text-sm opacity-80 mb-4 leading-relaxed">{insight.description}</p>
                                <div className={cn(
                                    "p-3 rounded-xl text-xs font-medium border",
                                    insight.type === 'warning' ? "bg-white/50 border-red-200" :
                                    insight.type === 'odoo_tip' ? "bg-white/50 border-blue-200" :
                                    "bg-white/50 border-emerald-200"
                                )}>
                                    <span className="font-bold uppercase tracking-tighter mr-2">Ação Sugerida:</span>
                                    {insight.actionable_suggestion}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {(report.layout_config.widgets || report.layout_config.charts || []).map((widget: any, idx: number) => {
                    const data = chartData[widget.title] || [];
                    
                    if (widget.type === 'kpi' || widget.type === 'kpi_card') {
                        const val = data[0]?.value || 'N/A';
                        return (
                            <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center gap-2 lg:col-span-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{widget.title}</span>
                                <span className="text-3xl font-black text-slate-900 tabular-nums">{val}</span>
                                <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold bg-emerald-50 w-fit px-1.5 py-0.5 rounded">
                                    <Activity size={10} /> ESTÁVEL
                                </div>
                            </div>
                        );
                    }

                    return (
                        <ChartWrapper key={idx} widget={widget}>
                            <ResponsiveContainer width="100%" height="100%">
                                {widget.type === 'bar' ? (
                                    <BarChart data={data}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                        <Bar dataKey="value" fill={COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                ) : widget.type === 'line' ? (
                                    <AreaChart data={data}>
                                        <defs>
                                            <linearGradient id={`color-${idx}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.1}/>
                                                <stop offset="95%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                        <Area type="monotone" dataKey="value" stroke={COLORS[idx % COLORS.length]} fillOpacity={1} fill={`url(#color-${idx})`} strokeWidth={3} />
                                    </AreaChart>
                                ) : (
                                    <PieChart>
                                        <Pie
                                            data={data}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                            nameKey="label"
                                        >
                                            {data.map((_entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                        <Legend />
                                    </PieChart>
                                )}
                            </ResponsiveContainer>
                        </ChartWrapper>
                    );
                })}
            </div>

            {/* Empty State / Footer */}
            {(report.layout_config.widgets || report.layout_config.charts || []).length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100 italic text-slate-400">
                    <Layout size={40} className="mb-4 opacity-10" />
                    Este dashboard ainda não contém gráficos.
                </div>
            )}
        </div>
    );
};
