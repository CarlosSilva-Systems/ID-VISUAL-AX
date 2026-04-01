import React, { useState, useEffect } from 'react';
import {
  Upload,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  HardDrive,
  Github,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { OTAUploadModal } from './OTAUploadModal';
import { OTAConfirmModal } from './OTAConfirmModal';

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

export function OTASettings() {
  const [releases, setReleases] = useState<FirmwareRelease[]>([]);
  const [fleetVersion, setFleetVersion] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingGitHub, setCheckingGitHub] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<FirmwareRelease | null>(null);

  useEffect(() => {
    fetchReleases();
    fetchFleetStatus();
  }, []);

  const fetchReleases = async () => {
    setLoading(true);
    try {
      const data = await api.getFirmwareReleases();
      setReleases(data);
    } catch (err: any) {
      toast.error('Erro ao carregar releases: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchFleetStatus = async () => {
    try {
      const status = await api.getOTAStatus();
      // Calcular versão mais comum
      const versionCounts: Record<string, number> = {};
      status.devices.forEach((device: any) => {
        if (device.current_version) {
          versionCounts[device.current_version] = (versionCounts[device.current_version] || 0) + 1;
        }
      });
      
      const mostCommon = Object.entries(versionCounts).sort((a, b) => b[1] - a[1])[0];
      if (mostCommon) {
        setFleetVersion(mostCommon[0]);
      }
    } catch (err: any) {
      console.error('Erro ao carregar status da frota:', err);
    }
  };

  const checkGitHub = async () => {
    setCheckingGitHub(true);
    try {
      const result = await api.checkGitHub();
      if (result.update_available) {
        setAvailableUpdate(result.version || null);
        toast.success(`Nova versão ${result.version} disponível no GitHub!`);
      } else {
        toast.info('Sistema está atualizado');
        setAvailableUpdate(null);
      }
    } catch (err: any) {
      toast.error('Erro ao verificar GitHub: ' + err.message);
    } finally {
      setCheckingGitHub(false);
    }
  };

  const downloadFromGitHub = async (version?: string) => {
    setLoading(true);
    try {
      await api.downloadFromGitHub(version);
      toast.success(`Firmware ${version || 'mais recente'} baixado com sucesso!`);
      setAvailableUpdate(null);
      await fetchReleases();
    } catch (err: any) {
      toast.error('Erro ao baixar firmware: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Fleet Status Card */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-[2rem] border border-blue-200 p-8 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-2">
              Versão Atual da Frota
            </p>
            <p className="text-4xl font-black text-blue-900">
              {fleetVersion || '—'}
            </p>
          </div>
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center">
            <HardDrive className="text-white" size={32} />
          </div>
        </div>
      </div>

      {/* Available Update Card */}
      {availableUpdate && (
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-[2rem] border border-emerald-200 p-8 shadow-sm animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                <CheckCircle size={14} /> Nova Versão Disponível
              </p>
              <p className="text-4xl font-black text-emerald-900 mb-4">
                {availableUpdate}
              </p>
              <button
                onClick={() => downloadFromGitHub(availableUpdate)}
                disabled={loading}
                className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
              >
                <Download size={18} />
                Baixar Versão {availableUpdate}
              </button>
            </div>
            <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center">
              <Github className="text-white" size={32} />
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={checkGitHub}
          disabled={checkingGitHub}
          className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
        >
          {checkingGitHub ? (
            <RefreshCw className="animate-spin" size={18} />
          ) : (
            <Github size={18} />
          )}
          Verificar GitHub
        </button>
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95"
        >
          <Upload size={18} />
          Upload Manual
        </button>
      </div>

      {/* Releases List */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Clock size={18} /> Versões Disponíveis
          </h3>
        </div>

        {loading && releases.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="animate-spin mx-auto mb-4" size={32} />
            <p className="font-bold">Carregando releases...</p>
          </div>
        ) : releases.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <AlertTriangle className="mx-auto mb-4" size={32} />
            <p className="font-bold">Nenhuma versão disponível</p>
            <p className="text-sm mt-2">Faça upload manual ou baixe do GitHub</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">
                    Versão
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">
                    Data
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">
                    Origem
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">
                    Tamanho
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">
                    Dispositivos
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {releases.map((release) => (
                  <tr key={release.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{release.version}</span>
                        {release.is_latest && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black uppercase">
                            Mais Recente
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatDate(release.uploaded_at)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-lg text-xs font-bold",
                        release.source === 'github'
                          ? "bg-purple-100 text-purple-700"
                          : "bg-amber-100 text-amber-700"
                      )}>
                        {release.source === 'github' ? 'GitHub' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                      {formatBytes(release.file_size)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold">
                        {release.device_count}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => {
                          setSelectedRelease(release);
                          setShowConfirmModal(true);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-all active:scale-95"
                      >
                        Atualizar Todos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <OTAUploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={() => {
          fetchReleases();
          fetchFleetStatus();
        }}
      />

      <OTAConfirmModal
        open={showConfirmModal}
        release={selectedRelease}
        onClose={() => {
          setShowConfirmModal(false);
          setSelectedRelease(null);
        }}
      />
    </div>
  );
}
