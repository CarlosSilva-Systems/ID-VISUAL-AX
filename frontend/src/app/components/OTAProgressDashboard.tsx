import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  Info,
  ChevronRight,
  Wifi,
  Network,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useBreakpoint } from '../../hooks/useBreakpoint';

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
  is_root: boolean;
  connection_type: string;
}

interface OTAProgressDashboardProps {
  onClose: () => void;
}

const SHOW_INITIAL = 10;

export function OTAProgressDashboard({ onClose }: OTAProgressDashboardProps) {
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [targetVersion, setTargetVersion] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [rootExpanded, setRootExpanded] = useState(true);
  const [meshExpanded, setMeshExpanded] = useState(true);
  const [showAllRoot, setShowAllRoot] = useState(false);
  const [showAllMesh, setShowAllMesh] = useState(false);

  const bp = useBreakpoint();
  const isMobile = bp === 'mobile' || bp === 'sm';

  useEffect(() => {
    fetchOTAStatus();

    // TODO: Substituir por WebSocket quando integração estiver pronta
    const interval = setInterval(fetchOTAStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchOTAStatus = async () => {
    try {
      const status = await api.getOTAStatus();
      setDevices(status.devices || []);

      const deviceWithTarget = status.devices?.find((d: DeviceStatus) => d.target_version);
      if (deviceWithTarget) {
        setTargetVersion(deviceWithTarget.target_version || '');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('Erro ao buscar status OTA:', err);
      toast.error('Erro ao atualizar status: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancelar a atualização OTA? Dispositivos que já iniciaram o download podem continuar.')) return;
    
    setCancelling(true);
    try {
      const result = await api.post('/ota/cancel', {});
      toast.success(result.message);
      await fetchOTAStatus();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Erro ao cancelar: ' + message);
    } finally {
      setCancelling(false);
    }
  };

  const stats = useMemo(() => ({
    completed: devices.filter(d => d.status === 'success').length,
    inProgress: devices.filter(d => ['downloading', 'installing'].includes(d.status)).length,
    failed: devices.filter(d => d.status === 'failed').length,
    total: devices.length
  }), [devices]);

  // Separar por tipo de conexão usando is_root e connection_type (não por nome)
  const rootDevices = devices.filter(d => d.is_root || d.connection_type === 'wifi');
  const meshDevices = devices.filter(d => !d.is_root && d.connection_type !== 'wifi');

  const visibleRoot = showAllRoot ? rootDevices : rootDevices.slice(0, SHOW_INITIAL);
  const visibleMesh = showAllMesh ? meshDevices : meshDevices.slice(0, SHOW_INITIAL);

  const allComplete = stats.inProgress === 0 && stats.total > 0;
  const hasActiveUpdates = stats.inProgress > 0;

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
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
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
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
              Atualização OTA em Andamento
            </h1>
            {targetVersion && (
              <p className="text-slate-600 mt-1">
                Versão Alvo: <span className="font-bold text-blue-600">{targetVersion}</span>
              </p>
            )}
          </div>

          {/* Botão de cancelamento — visível apenas quando há atualizações ativas */}
          {hasActiveUpdates && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold text-sm hover:bg-red-200 transition-all active:scale-95 disabled:opacity-50"
            >
              {cancelling ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <XCircle size={16} />
              )}
              Cancelar Atualização
            </button>
          )}
        </div>

        {/* Stats Summary — 2 cols mobile, 4 cols md+ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                  Concluídos
                </p>
                <p className="text-2xl sm:text-3xl font-black text-emerald-600">{stats.completed}</p>
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
                <p className="text-2xl sm:text-3xl font-black text-amber-600">{stats.inProgress}</p>
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
                <p className="text-2xl sm:text-3xl font-black text-red-600">{stats.failed}</p>
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
                <p className="text-2xl sm:text-3xl font-black text-slate-900">{stats.total}</p>
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <Info className="text-slate-600" size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* Nós Raiz (WiFi direto) */}
        {rootDevices.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setRootExpanded(!rootExpanded)}
              className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
            >
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Wifi size={18} className="text-blue-500" />
                Nós Raiz — WiFi Direto ({rootDevices.length})
              </h2>
              <ChevronDown
                className={cn(
                  "text-slate-400 transition-transform",
                  rootExpanded && "rotate-180"
                )}
                size={20}
              />
            </button>
            {rootExpanded && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {visibleRoot.map(device => (
                  <DeviceProgressItem key={device.device_id} device={device} isMobile={isMobile} />
                ))}
                {rootDevices.length > SHOW_INITIAL && !showAllRoot && (
                  <div className="p-4 flex justify-center">
                    <button
                      onClick={() => setShowAllRoot(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all active:scale-95"
                    >
                      <ChevronRight size={16} />
                      Ver mais {rootDevices.length - SHOW_INITIAL} dispositivos
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Nós Mesh */}
        {meshDevices.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setMeshExpanded(!meshExpanded)}
              className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
            >
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Network size={18} className="text-purple-500" />
                Nós Mesh ({meshDevices.length})
              </h2>
              <ChevronDown
                className={cn(
                  "text-slate-400 transition-transform",
                  meshExpanded && "rotate-180"
                )}
                size={20}
              />
            </button>
            {meshExpanded && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {visibleMesh.map(device => (
                  <DeviceProgressItem key={device.device_id} device={device} isMobile={isMobile} />
                ))}
                {meshDevices.length > SHOW_INITIAL && !showAllMesh && (
                  <div className="p-4 flex justify-center">
                    <button
                      onClick={() => setShowAllMesh(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all active:scale-95"
                    >
                      <ChevronRight size={16} />
                      Ver mais {meshDevices.length - SHOW_INITIAL} dispositivos
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Botão de fechar — aparece quando tudo terminou */}
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
  isMobile: boolean;
}

function DeviceProgressItem({ device, isMobile }: DeviceProgressItemProps) {
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

  const progressBar = isActive && (
    <div className={cn(isMobile ? "w-full mt-3" : "w-64 shrink-0")}>
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
  );

  return (
    <div className="p-6 hover:bg-slate-50 transition-colors">
      <div className={cn("flex gap-4", isMobile ? "flex-col" : "items-center")}>
        <div className={cn("flex gap-4", isMobile ? "items-start" : "items-center flex-1")}>
          {/* Status Icon */}
          <div className="shrink-0">
            {getStatusIcon()}
          </div>

          {/* Device Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <p className="font-bold text-slate-900 truncate">{device.device_name}</p>
              <span className={cn("text-xs font-bold uppercase tracking-wider", getStatusColor())}>
                {getStatusText()}
              </span>
              {/* Badge de tipo de conexão */}
              <span className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider",
                device.is_root || device.connection_type === 'wifi'
                  ? "bg-blue-100 text-blue-600"
                  : "bg-purple-100 text-purple-600"
              )}>
                {device.is_root || device.connection_type === 'wifi' ? 'WiFi' : 'Mesh'}
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

          {/* Success Icon — inline em desktop */}
          {!isMobile && device.status === 'success' && (
            <div className="shrink-0">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="text-emerald-600" size={20} />
              </div>
            </div>
          )}

          {/* Progress Bar — inline em desktop */}
          {!isMobile && progressBar}
        </div>

        {/* Progress Bar — abaixo em mobile */}
        {isMobile && progressBar}

        {/* Success Icon — abaixo em mobile */}
        {isMobile && device.status === 'success' && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
              <CheckCircle className="text-emerald-600" size={16} />
            </div>
            <span className="text-xs font-bold text-emerald-600">Atualização concluída</span>
          </div>
        )}
      </div>
    </div>
  );
}
