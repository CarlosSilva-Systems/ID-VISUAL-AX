import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Play,
  Plus,
  Trash2,
  Edit3,
  Info,
  CheckCircle2,
  Clock,
  AlertCircle,
  Package,
  FileText,
  Tag,
  Check
} from 'lucide-react';
import { Fabrication, PACKAGES_CONFIG, Caixinha, PackageType } from '../types';
import { DrawerCaixinha } from './DrawerCaixinha';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { useParams } from 'react-router-dom';

interface LoteDoDiaProps {
  initialFabrications: Fabrication[];
  onBack: () => void;
}

export function LoteDoDia({ initialFabrications, onBack }: LoteDoDiaProps) {
  const { batchId } = useParams<{ batchId: string }>();
  const [view, setView] = useState<'pre-inicio' | 'matriz'>('pre-inicio');
  const [items, setItems] = useState<Fabrication[]>([]);
  const [selectedTask, setSelectedTask] = useState<{ fabId: string; task: Caixinha } | null>(null);

  // Document preview modal state
  const [docModalMoId, setDocModalMoId] = useState<string | null>(null);
  const [docModalMoNumber, setDocModalMoNumber] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      // If we have a real batchId (not "new"), fetch from server
      let baseItems = initialFabrications;

      if (batchId && batchId !== 'new') {
        try {
          const api = await import('../../services/api').then(m => m.api);
          const matrix = await api.getBatchMatrix(batchId);

          // Force view to Matriz if it's an existing saved batch
          setView('matriz');

          // Map Matrix data into Fabrication objects with Tasks
          baseItems = matrix.rows.map((row: any) => {
            const tasks: Caixinha[] = matrix.columns.map((col: any) => {
              const cell = row.cells[col.task_code];
              return {
                id: `${row.request_id}-${col.task_code}`,
                taskCode: col.task_code,
                label: col.label,
                status: cell.status === 'nao_iniciado' ? 'Neutro' :
                  cell.status === 'montado' ? 'Em Andamento' :
                    cell.status === 'impresso' ? 'Concluído' :
                      cell.status === 'bloqueado' ? 'Bloqueado' : 'Neutro',
                type: col.task_code === 'DOCS_Epson' ? 'Epson' : col.task_code === 'QA_FINAL' ? 'QA' : 'SmartScript',
                blockedReason: cell.blocked_reason,
                version: cell.version
              };
            });

            return {
              id: row.request_id,
              odoo_mo_id: row.odoo_mo_id ? String(row.odoo_mo_id) : undefined,
              mo_number: row.mo_number,
              obra: row.obra_nome || 'Sem Obra',
              product_qty: row.quantity,
              date_start: row.date_start ? new Date(row.date_start).toLocaleDateString('pt-BR') : '-',
              sla: row.sla_text || '24h',
              status: 'Em Lote',
              mrp_state: 'Em Produção',
              tasks: tasks,
              docs: { diagrama: false, legenda: false }
            };
          });

          setItems(baseItems);
          // If it's a batch from DB, we can skip pre-inicio if desired
          // setView('matriz'); 
          return;
        } catch (error) {
          console.error('Failed to fetch batch matrix:', error);
        }
      }

      // Fallback/Initial Logic for newly selected items
      const initializedItems = baseItems.map(fab => {
        const packageType = fab.packageType || 'COMANDO';
        const taskLabels = PACKAGES_CONFIG[packageType];
        const tasks: Caixinha[] = taskLabels.map(label => ({
          id: `${fab.id}-${label}`,
          label,
          status: 'Neutro',
          type: label === 'Diagrama+Legenda' ? 'Epson' : label === 'QA Final' ? 'QA' : 'SmartScript'
        }));

        if (!tasks.find(t => t.label === 'QA Final')) {
          tasks.push({
            id: `${fab.id}-QA`,
            label: 'QA Final',
            status: 'Neutro',
            type: 'QA'
          });
        }

        return { ...fab, packageType, tasks };
      });
      setItems(initializedItems);
    };

    initialize();
  }, [initialFabrications, batchId]);

  const handleStartBatch = () => {
    setView('matriz');
    toast.success('Lote iniciado com sucesso! Bom trabalho.');
  };

  const handleUpdateTaskStatus = async (fabId: string, taskId: string, status: Caixinha['status'], blockedReason?: string) => {
    const currentFab = items.find(f => f.id === fabId);
    const currentTask = currentFab?.tasks.find(t => t.id === taskId);
    if (!currentTask) return;

    // 1. Local Update for responsiveness (Optimistic)
    setItems(prev => prev.map(fab => {
      if (fab.id !== fabId) return fab;
      return {
        ...fab,
        tasks: fab.tasks.map(task =>
          task.id === taskId
            ? { ...task, status, blockedReason, lastUpdate: new Date().toLocaleTimeString() }
            : task
        )
      };
    }));

    if (selectedTask && selectedTask.task.id === taskId) {
      setSelectedTask(prev => prev ? {
        ...prev,
        task: { ...prev.task, status, blockedReason }
      } : null);
    }

    // 2. Remote Sync if batch exists
    if (batchId && batchId !== 'new') {
      try {
        const api = await import('../../services/api').then(m => m.api);

        // Map status to Backend Enum
        const backendStatus = status === 'Concluído' ? 'impresso' :
          status === 'Em Andamento' ? 'montado' :
            status === 'Bloqueado' ? 'bloqueado' : 'nao_iniciado';

        // More robust mapping based on labels if code is label-based
        const labelToCode: Record<string, string> = {
          'Diagrama+Legenda': 'DOCS_Epson',
          'Documentos Epson': 'DOCS_Epson',
          'Componente 210-804': 'WAGO_210_804',
          'Adesivo 210-805': 'WAGO_210_805',
          'Tag EFZ': 'ELESYS_EFZ',
          'Régua 2009-110': 'WAGO_2009_110',
          'Adesivo 210-855': 'WAGO_210_855',
          'QA Final': 'QA_FINAL',
          '210-804': 'WAGO_210_804',
          '210-805': 'WAGO_210_805',
          'EFZ Tag Cabo': 'ELESYS_EFZ',
          '2009-110': 'WAGO_2009_110',
          '210-855': 'WAGO_210_855'
        };

        const taskCode = currentTask.taskCode || labelToCode[currentTask.label] || '';

        const response = await api.updateBatchTask(batchId, {
          request_id: fabId,
          task_code: taskCode,
          new_status: backendStatus,
          blocked_reason: blockedReason,
          version: currentTask.version || 1
        });

        // Sync version back
        setItems(prev => prev.map(fab => {
          if (fab.id !== fabId) return fab;
          return {
            ...fab,
            tasks: fab.tasks.map(task =>
              task.id === taskId
                ? { ...task, version: response.updated_cell?.version || task.version }
                : task
            )
          };
        }));
        
        if (selectedTask && selectedTask.task.id === taskId) {
          setSelectedTask(prev => prev ? {
            ...prev,
            task: { ...prev.task, version: response.updated_cell?.version || prev.task.version }
          } : null);
        }

        toast.info(`Status atualizado: ${currentTask.label}`);
      } catch (error: any) {
        console.error('Remote sync failed:', error);
        toast.error('Erro ao sincronizar com servidor: ' + (error.message || 'Erro desconhecido'));
        
        // Rollback local state
        setItems(prev => prev.map(fab => {
          if (fab.id !== fabId) return fab;
          return {
            ...fab,
            tasks: fab.tasks.map(task =>
              task.id === taskId
                ? { ...task, status: currentTask.status, blockedReason: currentTask.blockedReason }
                : task
            )
          };
        }));
        
        if (selectedTask && selectedTask.task.id === taskId) {
          setSelectedTask(prev => prev ? {
            ...prev,
            task: { ...prev.task, status: currentTask.status, blockedReason: currentTask.blockedReason }
          } : null);
        }
      }
    }
  };


  if (view === 'pre-inicio') {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => { toast.success('Lote salvo automaticamente. Retome pelo Dashboard quando quiser.'); onBack(); }} className="p-2 hover:bg-white rounded-full transition-colors text-slate-500">
              <ChevronLeft size={24} />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 uppercase font-bold tracking-widest">
                <span>Dashboard</span> <ChevronLeft size={12} className="rotate-180" /> <span>Lote do Dia</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Confirmar Lote</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-600 hover:bg-white transition-colors flex items-center gap-2">
              <Plus size={18} /> Adicionar Fabricações
            </button>
            <button
              onClick={handleStartBatch}
              className="px-8 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95 flex items-center gap-2"
            >
              Iniciar Lote <Play size={16} fill="currentColor" />
            </button>
          </div>
        </div>

        {/* Selected List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-tight">Fabricações Selecionadas ({items.length})</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {items.map(item => (
              <div key={item.id} className="p-4 flex items-center gap-6 group hover:bg-slate-50 transition-colors">
                <div className="w-24">
                  <span className="font-bold text-slate-900">{item.mo_number}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{item.obra}</div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span>Qtd: {item.product_qty}</span>
                    <span>•</span>
                    <span>SLA: {item.sla}</span>
                    <span>•</span>
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded font-bold uppercase tracking-tighter text-[10px]">
                      {item.packageType}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { const moId = item.odoo_mo_id || item.id; setDocModalMoId(moId); setDocModalMoNumber(item.mo_number); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    title="Ver documentos"
                  >
                    <FileText size={14} />
                    Docs
                  </button>
                  <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="Editar Pacote">
                    <Edit3 size={18} />
                  </button>
                  <button className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Remover do Lote">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#F8F9FA] animate-in fade-in duration-300">
      {/* Visual Management Bar */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between gap-6 shadow-sm z-20">
        <div className="flex items-center gap-6 overflow-x-auto">
          <IndicatorCard
            label="Documentos (Epson)"
            value={items.reduce((acc, f) => acc + (f.tasks.find(t => t.type === 'Epson')?.status === 'Neutro' ? 1 : 0), 0)}
            total={items.length}
            icon={FileText}
            color="amber"
          />
          <IndicatorCard
            label="Hoje"
            value={items.length} // Simplified
            icon={Clock}
            color="blue"
          />
          <IndicatorCard
            label="Bloqueios"
            value={items.reduce((acc, f) => acc + f.tasks.filter(t => t.status === 'Bloqueado').length, 0)}
            icon={AlertCircle}
            color="red"
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="h-8 w-[1px] bg-gray-200 mx-2" />
          <button
            onClick={() => { toast.success('Lote salvo automaticamente. Retome pelo Dashboard quando quiser.'); onBack(); }}
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
          >
            Sair e Salvar
          </button>
        </div>
      </div>

      {/* Matrix Area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 inline-block min-w-full">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 text-left border-b border-gray-200">
                <th className="p-4 sticky left-0 z-30 bg-slate-50 border-r border-gray-200 w-64 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fabricação</div>
                </th>
                <th className="p-4 border-r border-gray-200 min-w-[300px]">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Etapas de Identificação (Fluxo de Trabalho)</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((fab) => (
                <tr key={fab.id} className="group hover:bg-blue-50/10 transition-colors">
                  <td className="p-4 sticky left-0 z-20 bg-white group-hover:bg-[#FCFDFF] border-r border-gray-200 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{fab.mo_number}</span>
                        <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-black uppercase tracking-tighter">
                          {fab.packageType}
                        </span>
                        <button
                          onClick={() => { const moId = fab.odoo_mo_id || fab.id; setDocModalMoId(moId); setDocModalMoNumber(fab.mo_number); }}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                          title="Ver documentos"
                        >
                          <FileText size={11} />
                          Docs
                        </button>
                      </div>
                      <div className="text-[11px] font-bold text-slate-700 truncate w-56">{fab.obra}</div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span className="font-bold">Qtd: {fab.product_qty}</span>
                        <span>•</span>
                        <span className="font-bold text-slate-800">{fab.date_start}</span>
                        <span>•</span>
                        <span className={cn("font-black", fab.sla === 'Vencida' ? 'text-red-500' : 'text-slate-600')}>SLA: {fab.sla}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-3">
                      {fab.tasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => setSelectedTask({ fabId: fab.id, task })}
                          className={cn(
                            "relative w-20 h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all group/box",
                            task.status === 'Concluído' && "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm",
                            task.status === 'Bloqueado' && "bg-rose-50 border-rose-400 text-rose-600 shadow-sm"
                          )}
                        >
                          {task.status === 'Concluído' ? (
                            <CheckCircle2 size={24} />
                          ) : task.status === 'Bloqueado' ? (
                            <AlertCircle size={24} />
                          ) : task.type === 'Epson' ? (
                            <FileText size={24} />
                          ) : task.type === 'QA' ? (
                            <CheckCircle2 size={24} className="opacity-40" />
                          ) : (
                            <Tag size={24} />
                          )}
                          <span className="text-[9px] font-black uppercase text-center px-1 leading-tight tracking-tight">
                            {task.label}
                          </span>

                          {/* Tooltip on hover */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-slate-800 text-white text-[10px] rounded p-2 opacity-0 group-hover/box:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                            <p className="font-bold">{task.label}</p>
                            <p className="text-slate-400">Status: {task.status}</p>
                            {task.lastUpdate && <p className="text-slate-500 mt-1">Atualizado: {task.lastUpdate}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      {selectedTask && (
        <DrawerCaixinha
          fabrication={items.find(f => f.id === selectedTask.fabId)!}
          task={selectedTask.task}
          onClose={() => setSelectedTask(null)}
          onUpdateStatus={(status, reason) => handleUpdateTaskStatus(selectedTask.fabId, selectedTask.task.id, status, reason)}
        />
      )}

      {docModalMoId && docModalMoNumber && (
        <DocumentPreviewModal
          moId={docModalMoId}
          moNumber={docModalMoNumber}
          onClose={() => { setDocModalMoId(null); setDocModalMoNumber(null); }}
        />
      )}
    </div>
  );
}

function IndicatorCard({ label, value, total, icon: Icon, color }: { label: string, value: number, total?: number, icon: any, color: 'blue' | 'amber' | 'red' }) {
  const styles = {
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    amber: 'text-amber-600 bg-amber-50 border-amber-100',
    red: 'text-rose-600 bg-rose-50 border-rose-100',
  };

  return (
    <div className={cn("px-4 py-2 rounded-lg border flex items-center gap-3 shrink-0", styles[color])}>
      <Icon size={18} />
      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-tight opacity-70 leading-none mb-1">{label}</span>
        <span className="text-sm font-black leading-none">
          {value} {total !== undefined && <span className="text-xs opacity-50 font-medium">/ {total}</span>}
        </span>
      </div>
    </div>
  );
}

