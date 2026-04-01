import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
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

interface OTAConfirmModalProps {
  open: boolean;
  release: FirmwareRelease | null;
  onClose: () => void;
}

export function OTAConfirmModal({ open, release, onClose }: OTAConfirmModalProps) {
  const navigate = useNavigate();
  const [deviceCount, setDeviceCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      fetchDeviceCount();
    }
  }, [open]);

  const fetchDeviceCount = async () => {
    setLoading(true);
    try {
      const devices = await api.getDevices();
      setDeviceCount(devices.length);
    } catch (err: any) {
      console.error('Erro ao buscar dispositivos:', err);
      setDeviceCount(0);
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
      
      // Navigate to progress dashboard
      navigate('/admin/ota-progress');
    } catch (err: any) {
      toast.error('Erro ao disparar atualização: ' + err.message);
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
              <p className="text-xs text-slate-500">Esta ação afetará todos os dispositivos</p>
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
                conectados. O processo pode levar alguns minutos dependendo da rede Mesh.
              </p>
            </div>
          </div>

          {/* Update Details */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <span className="text-sm text-slate-600 font-medium">Versão Alvo</span>
              <span className="text-lg font-black text-slate-900">{release.version}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <span className="text-sm text-slate-600 font-medium">Dispositivos Afetados</span>
              {loading ? (
                <Loader2 className="animate-spin text-slate-400" size={20} />
              ) : (
                <span className="text-lg font-black text-slate-900">{deviceCount}</span>
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

          {/* Confirmation Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-900 leading-relaxed">
              Você está prestes a atualizar <strong>{deviceCount} dispositivos</strong> para a versão{' '}
              <strong>{release.version}</strong>. Este processo pode levar alguns minutos via rede Mesh. 
              Deseja continuar?
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
            disabled={confirming || loading || deviceCount === 0}
            className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
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
