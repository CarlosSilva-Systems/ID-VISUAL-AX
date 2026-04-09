import React, { useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react';
import { ESPDeviceEnriched } from '../types';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type OTAStatus = 'iniciando' | 'baixando' | 'gravando' | 'reiniciando' | 'concluido' | 'falhou';

const STATUS_LABELS: Record<OTAStatus, string> = {
  iniciando: 'Iniciando...',
  baixando: 'Baixando firmware...',
  gravando: 'Gravando na memória...',
  reiniciando: 'Reiniciando dispositivo...',
  concluido: 'Atualização concluída!',
  falhou: 'Falha na atualização',
};

const STATUS_SEQUENCE: OTAStatus[] = ['iniciando', 'baixando', 'gravando', 'reiniciando', 'concluido'];

function mapApiStatus(apiStatus: string): OTAStatus {
  switch (apiStatus.toLowerCase()) {
    case 'downloading': return 'baixando';
    case 'installing': return 'gravando';
    case 'success': return 'concluido';
    case 'failed': return 'falhou';
    default: return 'iniciando';
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface OTAProgressModalProps {
  device: ESPDeviceEnriched;
  targetVersion: string;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const OTAProgressModal: React.FC<OTAProgressModalProps> = ({
  device,
  targetVersion,
  onClose,
}) => {
  const [status, setStatus] = useState<OTAStatus>('iniciando');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const isDone = status === 'concluido' || status === 'falhou';

  useEffect(() => {
    const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/devices/ws';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'ota_progress' && msg.mac === device.mac_address) {
          const mapped = mapApiStatus(msg.status ?? '');
          setStatus(mapped);
          setProgress(msg.progress ?? 0);
          if (msg.error) setErrorMessage(msg.error);
        }
      } catch { /* ignore */ }
    };

    // Simular progresso inicial enquanto aguarda resposta do device
    const timer = setTimeout(() => {
      setStatus(prev => prev === 'iniciando' ? 'baixando' : prev);
    }, 3000);

    return () => {
      clearTimeout(timer);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [device.mac_address]);

  const currentStep = STATUS_SEQUENCE.indexOf(status);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            <h2 className="font-black text-slate-900 text-sm">Atualização OTA</h2>
          </div>
          {isDone && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Device info */}
          <div className="text-center">
            <p className="font-bold text-slate-900">{device.device_name}</p>
            <p className="text-sm text-slate-500 mt-1">
              <span className="font-mono text-xs">{device.firmware_version ?? '?'}</span>
              <span className="mx-2 text-slate-300">→</span>
              <span className="font-mono text-xs font-bold text-blue-600">{targetVersion}</span>
            </p>
          </div>

          {/* Progress bar */}
          {status !== 'concluido' && status !== 'falhou' && (
            <div className="space-y-2">
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-center text-xs text-slate-500 font-bold">{progress}%</p>
            </div>
          )}

          {/* Status */}
          <div className="flex flex-col items-center gap-2">
            {status === 'concluido' ? (
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            ) : status === 'falhou' ? (
              <XCircle className="w-10 h-10 text-red-500" />
            ) : (
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            )}
            <p className={`text-sm font-bold ${
              status === 'concluido' ? 'text-emerald-600'
              : status === 'falhou' ? 'text-red-600'
              : 'text-slate-700'
            }`}>
              {STATUS_LABELS[status]}
            </p>
            {errorMessage && (
              <p className="text-xs text-red-500 text-center bg-red-50 px-3 py-2 rounded-lg">{errorMessage}</p>
            )}
          </div>

          {/* Steps indicator */}
          {!isDone && (
            <div className="flex items-center justify-center gap-1.5">
              {STATUS_SEQUENCE.slice(0, -1).map((step, i) => (
                <React.Fragment key={step}>
                  <div className={`w-2 h-2 rounded-full transition-colors ${
                    i < currentStep ? 'bg-blue-500'
                    : i === currentStep ? 'bg-blue-400 animate-pulse'
                    : 'bg-slate-200'
                  }`} />
                  {i < STATUS_SEQUENCE.length - 2 && (
                    <div className={`w-4 h-0.5 transition-colors ${i < currentStep ? 'bg-blue-400' : 'bg-slate-200'}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Warning */}
          {!isDone && (
            <p className="text-center text-xs text-slate-400 bg-slate-50 px-4 py-2 rounded-xl">
              Não desligue o dispositivo durante a atualização.
            </p>
          )}

          {/* Close button when done */}
          {isDone && (
            <button
              onClick={onClose}
              className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${
                status === 'concluido'
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                  : 'bg-red-500 text-white hover:bg-red-600'
              }`}
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
