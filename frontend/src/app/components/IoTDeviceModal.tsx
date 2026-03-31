import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, Link, Unlink, X, Cpu } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner';

export interface ESPDevice {
  id: string;
  mac_address: string;
  device_name: string;
  workcenter_id: number | null;
  status: 'online' | 'offline';
  last_seen_at: string | null;
  created_at: string;
}

interface Props {
  workcenterId: number;
  workcenterName: string;
  boundDevice: ESPDevice | null;
  onClose: () => void;
  onChanged: () => void;
}

export const IoTDeviceModal: React.FC<Props> = ({
  workcenterId,
  workcenterName,
  boundDevice,
  onClose,
  onChanged,
}) => {
  const [availableDevices, setAvailableDevices] = useState<ESPDevice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!boundDevice) {
      setLoading(true);
      api.getDevices()
        .then((devices: ESPDevice[]) => {
          setAvailableDevices(devices.filter((d) => d.workcenter_id === null));
        })
        .catch(() => toast.error('Erro ao carregar dispositivos'))
        .finally(() => setLoading(false));
    }
  }, [boundDevice]);

  const handleBind = async (mac: string) => {
    try {
      await api.bindDevice(mac, workcenterId);
      toast.success('Dispositivo vinculado com sucesso!');
      onChanged();
      onClose();
    } catch {
      toast.error('Erro ao vincular dispositivo');
    }
  };

  const handleUnbind = async () => {
    if (!boundDevice) return;
    try {
      await api.unbindDevice(boundDevice.mac_address);
      toast.success('Dispositivo desvinculado');
      onChanged();
      onClose();
    } catch {
      toast.error('Erro ao desvincular dispositivo');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="font-black text-slate-900 text-sm">Dispositivo IoT</h2>
              <p className="text-xs text-slate-500">{workcenterName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6">
          {boundDevice ? (
            /* Modo: dispositivo vinculado — mostrar detalhes */
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${boundDevice.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-sm truncate">{boundDevice.device_name}</p>
                  <p className="text-xs text-slate-400 font-mono">{boundDevice.mac_address}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${boundDevice.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {boundDevice.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>

              {boundDevice.last_seen_at && (
                <p className="text-xs text-slate-400 text-center">
                  Último contato: {new Date(boundDevice.last_seen_at).toLocaleString('pt-BR')}
                </p>
              )}

              <button
                onClick={handleUnbind}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold text-sm hover:bg-red-100 transition-colors"
              >
                <Unlink className="w-4 h-4" />
                Desvincular dispositivo
              </button>
            </div>
          ) : (
            /* Modo: sem vínculo — listar dispositivos disponíveis */
            <div className="space-y-3">
              <p className="text-sm text-slate-500 mb-4">
                Selecione um dispositivo para vincular a esta mesa:
              </p>

              {loading && (
                <p className="text-center text-slate-400 text-sm py-4">Carregando dispositivos...</p>
              )}

              {!loading && availableDevices.length === 0 && (
                <div className="text-center py-6 text-slate-400">
                  <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhum dispositivo disponível</p>
                  <p className="text-xs mt-1">Aguardando descoberta via MQTT</p>
                </div>
              )}

              {availableDevices.map((device) => (
                <div
                  key={device.mac_address}
                  className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all"
                >
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${device.status === 'online' ? 'bg-emerald-500' : 'bg-red-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm">{device.device_name}</p>
                    <p className="text-xs text-slate-400 font-mono">{device.mac_address}</p>
                  </div>
                  <button
                    onClick={() => handleBind(device.mac_address)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors flex-shrink-0"
                  >
                    <Link className="w-3 h-3" />
                    Vincular
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
