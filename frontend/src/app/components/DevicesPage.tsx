import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Cpu,
  RefreshCw,
  Trash2,
  Edit3,
  ClipboardList,
  RotateCcw,
  Power,
  Wifi,
  WifiOff,
  Network,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { ESPDeviceEnriched, FirmwareVersion } from '../types';
import { DeviceDrawer } from './DeviceDrawer';
import { ConfirmModal } from './ConfirmModal';
import { SkeletonTableRow } from './SkeletonLoader';
import { ActionMenu, ActionMenuItem } from '@/app/components/ActionMenu';
import { BottomSheet } from '@/app/components/BottomSheet';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface ConfirmState<T> {
  isOpen: boolean;
  payload: T | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rssiColor(quality: string | null): string {
  switch (quality) {
    case 'Ótimo': return 'text-emerald-600 bg-emerald-50';
    case 'Bom': return 'text-blue-600 bg-blue-50';
    case 'Fraco': return 'text-amber-600 bg-amber-50';
    case 'Crítico': return 'text-red-600 bg-red-50';
    default: return 'text-slate-400 bg-slate-50';
  }
}

function formatLastSeen(lastSeenAt: string | null, offlineMinutes: number | null): string {
  if (!lastSeenAt) return '—';
  const date = new Date(lastSeenAt + 'Z');
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  return `${Math.floor(diffH / 24)}d atrás`;
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

interface SummaryCardsProps {
  devices: ESPDeviceEnriched[];
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ devices }) => {
  const total = devices.length;
  const online = devices.filter(d => d.status === 'online').length;
  const offline = devices.filter(d => d.status === 'offline').length;
  const outdated = devices.filter(d => d.firmware_outdated).length;

  const cards = [
    { label: 'Total', value: total, icon: Cpu, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
    { label: 'Online', value: online, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { label: 'Offline', value: offline, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
    { label: 'Desatualizados', value: outdated, icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map(card => (
        <div key={card.label} className={`rounded-2xl border ${card.border} ${card.bg} p-4 flex items-center gap-4`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.bg}`}>
            <card.icon className={`w-5 h-5 ${card.color}`} />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900">{card.value}</p>
            <p className="text-xs text-slate-500 font-medium">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Status Badge ──────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ device: ESPDeviceEnriched }> = ({ device }) => {
  if (device.status === 'online') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Online
      </span>
    );
  }
  if (device.workcenter_id === null) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Sem vínculo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      Offline
    </span>
  );
};

// ── Firmware Badge ────────────────────────────────────────────────────────────

const FirmwareBadge: React.FC<{ device: ESPDeviceEnriched }> = ({ device }) => {
  if (!device.firmware_version) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono font-bold ${device.firmware_outdated ? 'text-amber-600' : 'text-slate-700'}`}>
      {device.firmware_version}
      {device.firmware_outdated && <AlertTriangle className="w-3 h-3 text-amber-500" />}
    </span>
  );
};

// ── Device Card (mobile/tablet) ───────────────────────────────────────────────

interface DeviceCardProps {
  device: ESPDeviceEnriched;
  syncing: string | null;
  deleting: string | null;
  restarting: string | null;
  onEdit: () => void;
  onLogs: () => void;
  onSync: () => void;
  onRestart: () => void;
  onDelete: () => void;
}

const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  syncing,
  deleting,
  restarting,
  onEdit,
  onLogs,
  onSync,
  onRestart,
  onDelete,
}) => {
  const menuItems: ActionMenuItem[] = [
    {
      label: 'Editar',
      icon: Edit3,
      onClick: onEdit,
    },
    {
      label: 'Ver Logs',
      icon: ClipboardList,
      onClick: onLogs,
    },
    {
      label: syncing === device.id ? 'Sincronizando…' : 'Sincronizar',
      icon: RotateCcw,
      onClick: onSync,
      disabled: syncing === device.id,
    },
    {
      label: restarting === device.id ? 'Reiniciando…' : 'Reiniciar',
      icon: Power,
      onClick: onRestart,
      disabled: device.status === 'offline' || restarting === device.id,
    },
    {
      label: deleting === device.id ? 'Removendo…' : 'Remover',
      icon: Trash2,
      onClick: onDelete,
      variant: 'destructive',
      disabled: device.status === 'online' || deleting === device.id,
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 shadow-sm">
      {/* Header: nome + ActionMenu */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${device.status === 'online' ? 'bg-emerald-100' : 'bg-slate-100'}`}>
            <Cpu className={`w-5 h-5 ${device.status === 'online' ? 'text-emerald-600' : 'text-slate-400'}`} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-sm truncate">{device.device_name}</p>
            <p className="text-xs text-slate-400 font-mono truncate">{device.mac_address}</p>
          </div>
        </div>
        <ActionMenu items={menuItems} align="end" triggerLabel="Ações do dispositivo" />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <p className="text-slate-400 font-medium mb-0.5">Status</p>
          <StatusBadge device={device} />
        </div>
        <div>
          <p className="text-slate-400 font-medium mb-0.5">Firmware</p>
          <FirmwareBadge device={device} />
        </div>
        <div className="col-span-2">
          <p className="text-slate-400 font-medium mb-0.5">Workcenter</p>
          {device.workcenter_name ? (
            <span className="text-slate-700 font-medium">{device.workcenter_name}</span>
          ) : (
            <span className="text-slate-400 italic">Sem vínculo</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const DevicesPage: React.FC = () => {
  const [devices, setDevices] = useState<ESPDeviceEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [restarting, setRestarting] = useState<string | null>(null);
  const [drawerDevice, setDrawerDevice] = useState<ESPDeviceEnriched | null>(null);
  const [drawerTab, setDrawerTab] = useState<'info' | 'logs'>('info');
  const [firmwareVersions, setFirmwareVersions] = useState<FirmwareVersion[]>([]);
  const [confirmRestart, setConfirmRestart] = useState<ConfirmState<ESPDeviceEnriched>>({ isOpen: false, payload: null });
  const [confirmDelete, setConfirmDelete] = useState<ConfirmState<ESPDeviceEnriched>>({ isOpen: false, payload: null });
  const wsRef = useRef<WebSocket | null>(null);

  const bp = useBreakpoint();
  const isBelowLg = bp === 'mobile' || bp === 'sm' || bp === 'md';
  const isBelowMd = bp === 'mobile' || bp === 'sm';

  const loadDevices = useCallback(async () => {
    try {
      const data = await api.getDevices();
      setDevices(data);
    } catch {
      toast.error('Erro ao carregar dispositivos');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFirmwareVersions = useCallback(async () => {
    try {
      const data = await api.getFirmwareVersions();
      setFirmwareVersions(data);
    } catch {
      // silencioso — não crítico
    }
  }, []);

  useEffect(() => {
    loadDevices();
    loadFirmwareVersions();
  }, [loadDevices, loadFirmwareVersions]);

  // WebSocket para atualizações em tempo real
  useEffect(() => {
    const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/devices/ws';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const relevantEvents = ['device_discovery', 'device_status', 'device_removed', 'device_offline_alert', 'device_bound', 'device_unbound'];
        if (relevantEvents.includes(msg.event)) {
          loadDevices();
        }
      } catch { /* ignore */ }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [loadDevices]);

  const handleSync = async (device: ESPDeviceEnriched) => {
    setSyncing(device.id);
    try {
      await api.syncDevice(device.id);
      toast.success(`Sync solicitado para ${device.device_name}`);
    } catch {
      toast.error('Falha ao solicitar sync');
    } finally {
      setSyncing(null);
    }
  };

  const handleRestart = async (device: ESPDeviceEnriched) => {
    setRestarting(device.id);
    try {
      await api.restartDevice(device.id);
      toast.success(`Restart enviado para ${device.device_name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reiniciar dispositivo';
      toast.error(msg);
    } finally {
      setRestarting(null);
    }
  };

  const handleDelete = async (device: ESPDeviceEnriched) => {
    setDeleting(device.id);
    try {
      await api.deleteDevice(device.id);
      toast.success(`${device.device_name} removido`);
      loadDevices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover dispositivo';
      toast.error(msg);
    } finally {
      setDeleting(null);
    }
  };

  const openDrawer = (device: ESPDeviceEnriched, tab: 'info' | 'logs' = 'info') => {
    setDrawerDevice(device);
    setDrawerTab(tab);
  };

  // Conteúdo do DeviceDrawer — reutilizado em ambos os modos (lateral e bottom sheet)
  const drawerContent = drawerDevice ? (
    <DeviceDrawer
      device={drawerDevice}
      initialTab={drawerTab}
      firmwareVersions={firmwareVersions}
      onClose={() => setDrawerDevice(null)}
      onUpdated={() => {
        loadDevices();
        loadFirmwareVersions();
      }}
    />
  ) : null;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Cpu className="w-6 h-6 text-blue-600" />
            Dispositivos IoT
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestão de dispositivos ESP32 da fábrica</p>
        </div>
        <button
          onClick={() => { setLoading(true); loadDevices(); }}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors w-full sm:w-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Summary Cards */}
      <SummaryCards devices={devices} />

      {/* Content: Card View (< lg) ou Table (>= lg) */}
      {loading ? (
        /* Skeleton — tabela sempre para o skeleton */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Device</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Mesa Vinculada</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Sinal</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Firmware</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Último Contato</th>
                  <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {[...Array(5)].map((_, i) => <SkeletonTableRow key={i} />)}
              </tbody>
            </table>
          </div>
        </div>
      ) : devices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-20 text-slate-400">
          <WifiOff className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium">Nenhum dispositivo cadastrado</p>
          <p className="text-sm mt-1">Aguardando descoberta via MQTT</p>
        </div>
      ) : isBelowLg ? (
        /* ── Card View (mobile / tablet < lg) ── */
        <div className="flex flex-col gap-3">
          {devices.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              syncing={syncing}
              deleting={deleting}
              restarting={restarting}
              onEdit={() => openDrawer(device, 'info')}
              onLogs={() => openDrawer(device, 'logs')}
              onSync={() => handleSync(device)}
              onRestart={() => setConfirmRestart({ isOpen: true, payload: device })}
              onDelete={() => setConfirmDelete({ isOpen: true, payload: device })}
            />
          ))}
        </div>
      ) : (
        /* ── Table View (desktop >= lg) ── */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Device</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Mesa Vinculada</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Sinal</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Firmware</th>
                  <th className="text-left px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Último Contato</th>
                  <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map(device => (
                  <tr key={device.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Device */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${device.status === 'online' ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                          <Cpu className={`w-4 h-4 ${device.status === 'online' ? 'text-emerald-600' : 'text-slate-400'}`} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{device.device_name}</p>
                          <p className="text-xs text-slate-400 font-mono">{device.mac_address}</p>
                        </div>
                      </div>
                    </td>
                    {/* Mesa */}
                    <td className="px-4 py-4">
                      {device.workcenter_name ? (
                        <span className="text-slate-700 font-medium">{device.workcenter_name}</span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Sem vínculo</span>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-4">
                      <StatusBadge device={device} />
                    </td>
                    {/* Sinal */}
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        {device.connection_type === 'wifi' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 w-fit">
                            <Wifi className="w-2.5 h-2.5" />WiFi
                          </span>
                        ) : device.connection_type === 'mesh' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 w-fit">
                            <Network className="w-2.5 h-2.5" />Mesh
                          </span>
                        ) : null}
                        {device.rssi_quality ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${rssiColor(device.rssi_quality)}`}>
                            <Wifi className="w-3 h-3" />
                            {device.rssi_quality}
                            {device.rssi !== null && <span className="opacity-60">({device.rssi})</span>}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </div>
                    </td>
                    {/* Firmware */}
                    <td className="px-4 py-4">
                      <FirmwareBadge device={device} />
                    </td>
                    {/* Último Contato */}
                    <td className="px-4 py-4">
                      <span className="text-slate-500 text-xs">
                        {formatLastSeen(device.last_seen_at, device.offline_minutes)}
                      </span>
                    </td>
                    {/* Ações */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openDrawer(device, 'info')}
                          title="Editar"
                          className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDrawer(device, 'logs')}
                          title="Ver Logs"
                          className="p-2 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                        >
                          <ClipboardList className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleSync(device)}
                          title="Sincronizar"
                          disabled={syncing === device.id}
                          className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                        >
                          <RotateCcw className={`w-4 h-4 ${syncing === device.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => setConfirmRestart({ isOpen: true, payload: device })}
                          title={device.status === 'offline' ? 'Dispositivo offline — não pode reiniciar' : 'Reiniciar ESP32'}
                          disabled={device.status === 'offline' || restarting === device.id}
                          className="p-2 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {restarting === device.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Power className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ isOpen: true, payload: device })}
                          title={device.status === 'online' ? 'Dispositivo online — não pode remover' : 'Remover'}
                          disabled={device.status === 'online' || deleting === device.id}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {deleting === device.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Device Drawer — 4.6: BottomSheet em < md, drawer lateral em >= md */}
      {isBelowMd ? (
        <BottomSheet
          isOpen={drawerDevice !== null}
          onClose={() => setDrawerDevice(null)}
          maxHeight="90vh"
          level={1}
        >
          {drawerContent}
        </BottomSheet>
      ) : (
        drawerContent
      )}

      <ConfirmModal
        isOpen={confirmRestart.isOpen}
        title={`Reiniciar ${confirmRestart.payload?.device_name ?? 'dispositivo'}?`}
        description="O dispositivo ficará offline por alguns segundos durante o restart."
        confirmLabel="Reiniciar"
        variant="warning"
        isLoading={restarting === confirmRestart.payload?.id}
        onConfirm={() => {
          if (confirmRestart.payload) handleRestart(confirmRestart.payload);
          setConfirmRestart({ isOpen: false, payload: null });
        }}
        onCancel={() => setConfirmRestart({ isOpen: false, payload: null })}
      />

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title={`Remover ${confirmDelete.payload?.device_name ?? 'dispositivo'}?`}
        description="Esta ação não pode ser desfeita. O dispositivo precisará ser redescoberto via MQTT."
        confirmLabel="Remover"
        variant="destructive"
        isLoading={deleting === confirmDelete.payload?.id}
        onConfirm={() => {
          if (confirmDelete.payload) handleDelete(confirmDelete.payload);
          setConfirmDelete({ isOpen: false, payload: null });
        }}
        onCancel={() => setConfirmDelete({ isOpen: false, payload: null })}
      />
    </div>
  );
};
