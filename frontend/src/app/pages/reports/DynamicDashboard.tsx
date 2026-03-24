import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    ChevronLeft, Download, Share2, Calendar, Layout, 
    BarChart3, PieChart as PieIcon, LineChart as LineIcon, Activity,
    Loader2, AlertCircle, RefreshCw
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

const ChartWrapper = ({ chart, children }: { chart: any, children: React.ReactNode }) => (
    <div className={cn(
        "bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[400px]",
        chart.grid_span === 4 ? "lg:col-span-4" : 
        chart.grid_span === 3 ? "lg:col-span-3" : 
        chart.grid_span === 2 ? "lg:col-span-2" : "lg:col-span-1"
    )}>
        <div className="flex items-center justify-between mb-6">
            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                {chart.type === 'bar' && <BarChart3 size={18} className="text-blue-500" />}
                {chart.type === 'pie' && <PieIcon size={18} className="text-emerald-500" />}
                {chart.type === 'line' && <LineIcon size={18} className="text-amber-500" />}
                {chart.type === 'kpi_card' && <Activity size={18} className="text-rose-500" />}
                {chart.title}
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

            // Fetch data for each chart
            const dataPromises = reportData.layout_config.charts.map(async (chart: any) => {
                try {
                    const data = await api.get(chart.data_source_url);
                    // Adaptação: se a API retornar um objeto complexo e o recharts precisar de array
                    const finalData = Array.isArray(data) ? data : (data.data || [data]);
                    return { id: chart.title, data: finalData };
                } catch (e) {
                    return { id: chart.title, data: [], error: true };
                }
            });

            const results = await Promise.all(dataPromises);
            const newData: Record<string, any[]> = {};
            results.forEach(r => newData[r.id] = r.data);
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

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {report.layout_config.charts.map((chart: any, idx: number) => {
                    const data = chartData[chart.title] || [];
                    
                    if (chart.type === 'kpi_card') {
                        // Assuming the first item is the KPI value
                        const val = data[0]?.value || 'N/A';
                        const label = data[0]?.label || chart.title;
                        return (
                            <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center gap-2 lg:col-span-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{chart.title}</span>
                                <span className="text-3xl font-black text-slate-900 tabular-nums">{val}</span>
                                <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold bg-emerald-50 w-fit px-1.5 py-0.5 rounded">
                                    <Activity size={10} /> ESTÁVEL
                                </div>
                            </div>
                        );
                    }

                    return (
                        <ChartWrapper key={idx} chart={chart}>
                            <ResponsiveContainer width="100%" height="100%">
                                {chart.type === 'bar' ? (
                                    <BarChart data={data}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                        <Bar dataKey="value" fill={COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                ) : chart.type === 'line' ? (
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
            {report.layout_config.charts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100 italic text-slate-400">
                    <Layout size={40} className="mb-4 opacity-10" />
                    Este dashboard ainda não contém gráficos.
                </div>
            )}
        </div>
    );
};
