import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Trash2, Eye, Calendar, Clock, Sparkles, Loader2, Search } from 'lucide-react';
import { Button, cn, Badge, Card } from '../../components/ui';
import { api } from '../../../services/api';
import { toast } from 'sonner';

export const MyReports = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [prompt, setPrompt] = useState('');

    const fetchReports = async () => {
        try {
            setIsLoading(true);
            const data = await api.getCustomReports();
            setReports(data);
        } catch (e) {
            toast.error("Erro ao carregar relatórios");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        try {
            setIsGenerating(true);
            toast.info("A IA está processando seu pedido e montando o layout...");
            const res = await api.generateIAReport(prompt);
            toast.success(`Relatório "${res.title}" gerado com sucesso!`);
            setPrompt('');
            fetchReports();
        } catch (e) {
            toast.error("Erro ao gerar relatório com IA");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Deseja realmente excluir este relatório?")) return;
        try {
            await api.deleteCustomReport(id);
            toast.success("Relatório excluído");
            fetchReports();
        } catch (e) {
            toast.error("Erro ao excluir");
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <header className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-600 text-white rounded-lg shadow-lg">
                        <Sparkles size={24} />
                    </div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Meus Relatórios Dinâmicos</h1>
                </div>
                <p className="text-slate-500 max-w-2xl text-lg">
                    Dashboards personalizados gerados instantaneamente por Inteligência Artificial a partir dos seus dados operacionais.
                </p>
            </header>

            {/* AI Generator Bar */}
            <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-xl shadow-blue-500/5 mb-10 transition-all hover:shadow-blue-500/10">
                <form onSubmit={handleGenerate} className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-blue-700 font-bold text-sm uppercase tracking-wider">
                        <Plus size={16} />
                        Nova Geração Imediata
                    </div>
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="text"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Ex: 'Crie um dashboard Mensal de produtividade por operador com foco em retrabalho'"
                                className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-800 placeholder:text-slate-400"
                            />
                        </div>
                        <Button 
                            type="submit" 
                            disabled={isGenerating || !prompt.trim()}
                            className="md:w-48 h-auto py-4 rounded-xl flex items-center justify-center gap-2 lg:text-base"
                        >
                            {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />}
                            {isGenerating ? 'Gerando...' : 'Gerar com IA'}
                        </Button>
                    </div>
                    <p className="text-xs text-slate-400 ml-1 italic">
                        Dica: Tente ser específico sobre o período e quais indicadores quer priorizar.
                    </p>
                </form>
            </div>

            {/* Reports Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    [...Array(6)].map((_, i) => (
                        <div key={i} className="h-48 bg-white rounded-2xl border border-slate-200 animate-pulse" />
                    ))
                ) : reports.length === 0 ? (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-300">
                        <FileText size={48} className="mb-4 opacity-20" />
                        <p className="font-medium text-slate-600">Nenhum relatório gerado ainda.</p>
                        <p className="text-sm mt-1">Use a barra acima para criar seu primeiro dashboard com IA.</p>
                    </div>
                ) : (
                    reports.map(report => (
                        <Card key={report.id} className="group hover:border-blue-300 hover:shadow-lg transition-all flex flex-col h-full border-slate-200">
                            <div className="p-6 flex-1 flex flex-col">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-2 bg-slate-100 text-slate-600 rounded-lg group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                        <FileText size={20} />
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => handleDelete(report.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                            title="Excluir"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2 truncate" title={report.title}>
                                    {report.title}
                                </h3>
                                <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-1">
                                    {report.description || 'Sem descrição.'}
                                </p>
                                <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                            <Calendar size={12} />
                                            {new Date(report.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <Button 
                                        variant="secondary"
                                        size="sm"
                                        className="rounded-lg h-9"
                                        onClick={() => navigate(`/relatorios/visualizar/${report.id}`)}
                                    >
                                        <Eye size={16} className="mr-1.5" />
                                        Abrir
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};
