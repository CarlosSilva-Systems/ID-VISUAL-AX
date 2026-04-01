import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type OTAStatus = 'downloading' | 'installing' | 'success' | 'failed' | 'idle';

interface DeviceStatus {
  device_id: string;
  mac_address: string;
  device_name: string;
  current_version: string | null;
  target_version: string | null;
  status: OTAStatus;
  progress_percent: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface OTAProgressDashboardProps {
  onClose: () => void;
}

export function OTAProgressDashboard({ onClose }: OTAProgressDashboardProps) {
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [targetVersion, setTargetVersion] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [gatewaysExpanded, setGatewaysExpanded] = useState(true);
  const [nodesExpanded, setNodesExpanded] = useState(true);

  useEffect(() => {
    fetchOTAStatus();
    
    // TODO: Subscribe to WebSocket events for real-time updates
    // This will be implemented when WebSocket integration is ready
    // const ws = useWebSocket();
    // const unsubscribe = ws.subscribe('ota_progress', handleProgressUpdate);
    // return unsubscribe;

    // For now, poll every 5 seconds
    const interval = setInterval(fetchOTAStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchOTAStatus = async () => {
    try {
      const status = await api.getOTAStatus();
      setDevices(status.devices || []);
      
      // Get target version from first device with target_version
      const deviceWithTarget = status.devices?.find((d: DeviceStatus) => d.target_version);
      if (deviceWithTarget) {
        setTargetVersion(deviceWithTarget.target_version || '');
      }
    } catch (err: any) {
      console.error('Erro ao buscar status OTA:', err);
      toast.error('Erro ao atualizar status: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProgressUpdate = (data: any) => {
    setDevices(prev => prev.map(device => 
      device.mac_address === data.mac
        ? {
            ...device,
            status: data.status,
            progress_percent: data.progress,
            error_message: data.error
          }
        : device
    ));
  };

  const stats = useMemo(() => ({
    completed: devices.filter(d => d.status === 'success').length,
    inProgress: devices.filter(d => ['downloading', 'installing'].includes(d.status)).length,
    failed: devices.filter(d => d.status === 'failed').length,
    total: devices.length
  }), [devices]);

  // Separate gateways and nodes (for now, all devices are treated as nodes)
  // In a real implementation, you would check device.is_gateway or similar
  const gateways = devices.filter(d => d.device_name.toLowerCase().includes('gateway'));
  const nodes = devices.filter(d => !d.device_name.toLowerCase().includes('gateway'));

  const allComplete = stats.inProgress === 0 && stats.total > 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-blue-600" size={48} />
          <p className="font-bold text-slate-700">Carregando status OTA...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold mb-2 transition-colors"
            >
              <ArrowLeft size={20} />
              Voltar
            </button>
            <h1 className="text-3xl font-black text-slate-900">
              Atualização OTA em Andamento
            </h1>
            {targetVersion && (
              <p className="text-slate-600 mt-1">
                Versão Alvo: <span className="font-bold text-blue-600">{targetVersion}</span>
              </p>
            )}
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                  Concluídos
                </p>
                <p className="text-3xl font-black text-emerald-600">{stats.completed}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="text-emerald-600" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                  Em Progresso
                </p>
                <p className="text-3xl font-black text-amber-600">{stats.inProgress}</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <Loader2 className="text-amber-600 animate-spin" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                  Falharam
                </p>
                <p className="text-3xl font-black text-red-600">{stats.failed}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertCircle className="text-red-600" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                  Total
                </p>
                <p className="text-3xl font-black text-slate-900">{stats.total}</p>
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <Info className="text-slate-600" size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* Gateways Section */}
        {gateways.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setGatewaysExpanded(!gatewaysExpanded)}
              className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
            >
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                Gateways Mesh ({gateways.length})
              </h2>
              <ChevronDown
                className={cn(
                  "text-slate-400 transition-transform",
                  gatewaysExpanded && "rotate-180"
                )}
                size={20}
              />
            </button>
            {gatewaysExpanded && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {gateways.map(device => (
                  <DeviceProgressItem key={device.device_id} device={device} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Nodes Section */}
        {nodes.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setNodesExpanded(!nodesExpanded)}
              className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
            >
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                Nós Mesh ({nodes.length})
              </h2>
              <ChevronDown
                className={cn(
                  "text-slate-400 transition-transform",
                  nodesExpanded && "rotate-180"
                )}
                size={20}
              />
            </button>
            {nodesExpanded && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {nodes.map(device => (
                  <DeviceProgressItem key={device.device_id} device={device} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Close Button */}
        {allComplete && (
          <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button
              onClick={onClose}
              className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
            >
              Fechar Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface DeviceProgressItemProps {
  device: DeviceStatus;
}

function DeviceProgressItem({ device }: DeviceProgressItemProps) {
  const getStatusIcon = () => {
    switch (device.status) {
      case 'success':
        return <CheckCircle className="text-emerald-600" size={24} />;
      case 'downloading':
      case 'installing':
        return <Loader2 className="text-amber-600 animate-spin" size={24} />;
      case 'failed':
        return <AlertCircle className="text-red-600" size={24} />;
      default:
        return <div className="w-6 h-6 rounded-full bg-slate-200" />;
    }
  };

  const getStatusText = () => {
    switch (device.status) {
      case 'downloading': return 'Baixando';
      case 'installing': return 'Instalando';
      case 'success': return 'Concluído';
      case 'failed': return 'Falhou';
      default: return 'Aguardando';
    }
  };

  const getStatusColor = () => {
    switch (device.status) {
      case 'success': return 'text-emerald-600';
      case 'downloading':
      case 'installing': return 'text-amber-600';
      case 'failed': return 'text-red-600';
      default: return 'text-slate-400';
    }
  };

  const isActive = ['downloading', 'installing'].includes(device.status);

  return (
    <div className="p-6 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-4">
        {/* Status Icon */}
        <div className="shrink-0">
          {getStatusIcon()}
        </div>

        {/* Device Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <p className="font-bold text-slate-900 truncate">{device.device_name}</p>
            <span className={cn("text-xs font-bold uppercase tracking-wider", getStatusColor())}>
              {getStatusText()}
            </span>
          </div>
          <p className="text-sm text-slate-500 font-mono">{device.mac_address}</p>
          
          {/* Error Message */}
          {device.error_message && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-700 font-medium">{device.error_message}</p>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {isActive && (
          <div className="w-64 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-600">Progresso</span>
              <span className="text-xs font-bold text-slate-900">{device.progress_percent}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-300 rounded-full",
                  "bg-gradient-to-r from-blue-500 to-blue-600",
                  "animate-pulse"
                )}
                style={{ width: `${device.progress_percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Success Icon */}
        {device.status === 'success' && (
          <div className="shrink-0">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <CheckCircle className="text-emerald-600" size={20} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
