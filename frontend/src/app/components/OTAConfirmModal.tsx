import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Loader2, Wifi, Network } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useNavigate } from 'react-router-dom';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FirmwareRelease {
  id: string;
  version: string;
  filename: string;
  file_size: number;
  source: 'github' | 'manual_upload';
  github_release_id: number | null;
  download_url: string | null;
  uploaded_at: string;
  uploaded_by: string;
  is_latest: boolean;
  device_count: number;
}

interface OnlineDeviceCount {
  total: number;
  online: number;
  offline: number;
  root_count: number;
  mesh_count: number;
}

interface OTAConfirmModalProps {
  open: boolean;
  release: FirmwareRelease | null;
  onClose: () => void;
}

export function OTAConfirmModal({ open, release, onClose }: OTAConfirmModalProps) {
  const navigate = useNavigate();
  const [onlineCount, setOnlineCount] = useState<OnlineDeviceCount>({ total: 0, online: 0, offline: 0, root_count: 0, mesh_count: 0 });
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      fetchOnlineCount();
    }
  }, [open]);

  const fetchOnlineCount = async () => {
    setLoading(true);
    try {
      const data = await api.get('/ota/devices/count');
      setOnlineCount(data);
    } catch (err: unknown) {
      console.error('Erro ao buscar dispositivos online:', err);
      setOnlineCount({ total: 0, online: 0, offline: 0, root_count: 0, mesh_count: 0 });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!release) return;

    setConfirming(true);
    try {
      const result = await api.triggerOTAUpdate(release.id);
      toast.success(result.message);
      onClose();
      
      // Navegar para o dashboard de progresso
      navigate('/admin/ota-progress');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Erro ao disparar atualização: ' + message);
    } finally {
      setConfirming(false);
    }
  };

  if (!open || !release) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="text-amber-600" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Confirmar Atualização OTA</h3>
              <p className="text-xs text-slate-500">Esta ação afetará todos os dispositivos online</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={confirming}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Warning Banner */}
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex gap-3">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div className="space-y-1">
              <p className="font-bold text-amber-900 text-sm">
                Atenção: Atualização em Massa
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                Esta operação iniciará o processo de atualização OTA em todos os dispositivos ESP32 
                <strong> online</strong>. Dispositivos offline não serão afetados. O processo pode 
                levar alguns minutos dependendo da rede Mesh.
              </p>
            </div>
          </div>

          {/* Update Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <span className="text-sm text-slate-600 font-medium">Versão Alvo</span>
              <span className="text-lg font-black text-slate-900">{release.version}</span>
            </div>

          {/* Dispositivos separados por status */}
            <div className="p-4 bg-slate-50 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 font-medium">Dispositivos Cadastrados</span>
                {loading ? (
                  <Loader2 className="animate-spin text-slate-400" size={20} />
                ) : (
                  <span className="text-lg font-black text-slate-900">{onlineCount.total}</span>
                )}
              </div>
              {!loading && onlineCount.total > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-bold text-emerald-700">
                      {onlineCount.online} Online
                    </span>
                  </div>
                  {onlineCount.offline > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-slate-400" />
                      <span className="text-xs font-bold text-slate-600">
                        {onlineCount.offline} Offline
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 rounded-lg">
                    <Wifi size={14} className="text-blue-600" />
                    <span className="text-xs font-bold text-blue-700">
                      {onlineCount.root_count} Raiz
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 rounded-lg">
                    <Network size={14} className="text-purple-600" />
                    <span className="text-xs font-bold text-purple-700">
                      {onlineCount.mesh_count} Mesh
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <span className="text-sm text-slate-600 font-medium">Origem do Firmware</span>
              <span className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold",
                release.source === 'github'
                  ? "bg-purple-100 text-purple-700"
                  : "bg-amber-100 text-amber-700"
              )}>
                {release.source === 'github' ? 'GitHub' : 'Upload Manual'}
              </span>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-900 leading-relaxed">
              Você está prestes a disparar OTA para <strong>{onlineCount.total} dispositivos cadastrados</strong> (versão{' '}
              <strong>{release.version}</strong>). O comando MQTT é broadcast — apenas os devices online no momento irão processar. 
              Nós raiz atualizam primeiro; nós mesh seguem via propagação.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={confirming}
            className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming || loading || onlineCount.total === 0}            className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
          >
            {confirming ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Disparando...
              </>
            ) : (
              'Confirmar Atualização'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
