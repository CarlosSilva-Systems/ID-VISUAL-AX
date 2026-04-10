import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Cpu,
  Wifi,
  AlertTriangle,
  Save,
  Zap,
  Info,
  ClipboardList,
  Loader2,
  RefreshCw,
  Network,
  Clock,
  MapPin,
  Tag,
  StickyNote,
  Power,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { DeviceLog, ESPDeviceEnriched, FirmwareVersion } from '../types';
import { OTAProgressModal } from './OTAProgressModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  return new Date(iso + 'Z').toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return '—';
  const date = new Date(lastSeenAt + 'Z');
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'há menos de 1 minuto';
  if (diffMin < 60) return `há ${diffMin} minuto${diffMin > 1 ? 's' : ''}`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} hora${diffH > 1 ? 's' : ''}`;
  return `há ${Math.floor(diffH / 24)} dia(s)`;
}

function rssiLabel(quality: string | null, rssi: number | null): string {
  if (!quality || rssi === null) return '—';
  return `${rssi} dBm (${quality})`;
}

function levelStyle(level: string): string {
  switch (level) {
    case 'ERROR': return 'text-red-600 bg-red-50 border-red-200';
    case 'WARN': return 'text-amber-600 bg-amber-50 border-amber-200';
    default: return 'text-slate-500 bg-slate-50 border-slate-200';
  }
}

function levelRowStyle(level: string): string {
  switch (level) {
    case 'ERROR': return 'bg-red-50/40 border-l-2 border-red-400';
    case 'WARN': return 'bg-amber-50/40 border-l-2 border-amber-400';
    default: return 'border-l-2 border-transparent';
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface DeviceDrawerProps {
  device: ESPDeviceEnriched;
  initialTab: 'info' | 'logs';
  firmwareVersions: FirmwareVersion[];
  onClose: () => void;
  onUpdated: () => void;
}

// ── Aba Informações ───────────────────────────────────────────────────────────

const InfoTab: React.FC<{
  device: ESPDeviceEnriched;
  firmwareVersions: FirmwareVersion[];
  onUpdated: () => void;
  onOTAStart: (targetVersion: string) => void;
  onRestart: () => void;
}> = ({ device, firmwareVersions, onUpdated, onOTAStart, onRestart }) => {
  const [name, setName] = useState(device.device_name);
  const [location, setLocation] = useState(device.location);
  const [notes, setNotes] = useState(device.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [otaLoading, setOtaLoading] = useState(false);
  const [selectedFwId, setSelectedFwId] = useState<number | null>(
    firmwareVersions.find(f => f.is_stable)?.id ?? firmwareVersions[0]?.id ?? null
  );

  const isDirty = name !== device.device_name || location !== device.location || notes !== (device.notes ?? '');

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateDevice(device.id, {
        device_name: name,
        location,
        notes: notes || undefined,
      });
      toast.success('Dispositivo atualizado');
      onUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleOTA = async () => {
    if (!selectedFwId) return;
    setOtaLoading(true);
    try {
      const res = await api.triggerDeviceOTA(device.id, {
        firmware_version_id: selectedFwId,
        triggered_by: 'frontend',
      });
      const targetFw = firmwareVersions.find(f => f.id === selectedFwId);
      toast.success(res.message || 'OTA disparado');
      onOTAStart(targetFw?.version ?? '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao disparar OTA';
      toast.error(msg);
    } finally {
      setOtaLoading(false);
    }
  };

  return (
    <div className="p-5 space-y-5">
      {/* Campos editáveis */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
            <Tag className="w-3 h-3 inline mr-1" />Nome
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
            <MapPin className="w-3 h-3 inline mr-1" />Localização
          </label>
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
            <StickyNote className="w-3 h-3 inline mr-1" />Observações
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100" />

      {/* Campos somente leitura */}
      <div className="space-y-2.5">
        <ReadonlyField label="MAC Address" value={device.mac_address} mono />
        <ReadonlyField
          label="Conexão"
          value={device.connection_type === 'wifi' ? '📶 WiFi Direto' : device.connection_type === 'mesh' ? '🕸️ Mesh (sem WiFi)' : '—'}
        />
        <ReadonlyField
          label="Firmware"
          value={device.firmware_version ?? '—'}
          badge={device.firmware_outdated ? (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-bold">
              <AlertTriangle className="w-3 h-3" />
              desatualizado (última: {device.latest_firmware})
            </span>
          ) : undefined}
        />
        <ReadonlyField label="Sinal WiFi" value={rssiLabel(device.rssi_quality, device.rssi)} />
        <ReadonlyField
          label="Tipo"
          value={device.is_root
            ? `Nó raiz${device.mesh_node_count ? ` — ${device.mesh_node_count} device(s) na mesh` : ''}`
            : 'Nó folha'}
        />
        {device.ip_address && <ReadonlyField label="IP Local" value={device.ip_address} mono />}
        <ReadonlyField label="Último contato" value={formatLastSeen(device.last_seen_at)} />
      </div>

      {/* Restart Section */}
      <div className="border-t border-slate-100" />
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-3">
          <Power className="w-3 h-3" />Controle do Dispositivo
        </p>
        <button
          onClick={onRestart}
          disabled={device.status === 'offline'}
          className="w-full flex items-center justify-center gap-2 py-2 bg-orange-50 text-orange-600 border border-orange-200 rounded-xl text-sm font-bold hover:bg-orange-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Power className="w-4 h-4" />
          {device.status === 'offline' ? 'Offline — restart indisponível' : 'Reiniciar ESP32'}
        </button>
      </div>

      {/* OTA Section */}
      {device.firmware_outdated && firmwareVersions.length > 0 && (
        <>
          <div className="border-t border-slate-100" />
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3 h-3" />Atualização OTA
            </p>
            <select
              value={selectedFwId ?? ''}
              onChange={e => setSelectedFwId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              {firmwareVersions.map(fw => (
                <option key={fw.id} value={fw.id}>
                  v{fw.version}{fw.is_stable ? ' ✓ estável' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={handleOTA}
              disabled={!selectedFwId || otaLoading || device.status === 'offline'}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {otaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {device.status === 'offline' ? 'Device offline — OTA indisponível' : 'Disparar OTA'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const ReadonlyField: React.FC<{ label: string; value: string; mono?: boolean; badge?: React.ReactNode }> = ({ label, value, mono, badge }) => (
  <div className="flex items-start justify-between gap-4 py-1.5">
    <span className="text-xs text-slate-400 font-medium shrink-0 w-28">{label}</span>
    <div className="text-right">
      <span className={`text-sm text-slate-700 font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
      {badge && <div className="mt-0.5">{badge}</div>}
    </div>
  </div>
);

// ── Aba Logs ──────────────────────────────────────────────────────────────────

const LogsTab: React.FC<{ device: ESPDeviceEnriched }> = ({ device }) => {
  const [logs, setLogs] = useState<DeviceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [hasErrors, setHasErrors] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDeviceLogs(device.id, levelFilter || undefined, 100);
      setLogs(data);
      setHasErrors(data.some((l: DeviceLog) => l.level === 'ERROR'));
    } catch {
      toast.error('Erro ao carregar logs');
    } finally {
      setLoading(false);
    }
  }, [device.id, levelFilter]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // WebSocket para logs em tempo real
  useEffect(() => {
    const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + '/devices/ws';
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'device_log' && msg.mac_address === device.mac_address) {
          const newLog: DeviceLog = {
            id: crypto.randomUUID(),
            level: msg.level ?? 'INFO',
            message: msg.message,
            created_at: new Date().toISOString(),
          };
          setLogs(prev => [newLog, ...prev].slice(0, 100));
          if (newLog.level === 'ERROR') setHasErrors(true);
        }
      } catch { /* ignore */ }
    };

    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, [device.mac_address]);

  const levels = ['', 'INFO', 'WARN', 'ERROR'];

  return (
    <div className="flex flex-col h-full">
      {/* Filtros */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
        {levels.map(l => (
          <button
            key={l || 'all'}
            onClick={() => setLevelFilter(l)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
              levelFilter === l
                ? l === 'ERROR' ? 'bg-red-500 text-white'
                  : l === 'WARN' ? 'bg-amber-500 text-white'
                  : l === 'INFO' ? 'bg-blue-500 text-white'
                  : 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {l || 'Todos'}
          </button>
        ))}
        <button onClick={loadLogs} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Carregando logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <ClipboardList className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Nenhum log encontrado</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {logs.map(log => (
              <div key={log.id} className={`px-5 py-2.5 ${levelRowStyle(log.level)}`}>
                <div className="flex items-start gap-2.5">
                  <span className="text-[10px] text-slate-400 font-mono shrink-0 mt-0.5 w-16">
                    {new Date(log.created_at + 'Z').toLocaleTimeString('pt-BR')}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${levelStyle(log.level)}`}>
                    {log.level}
                  </span>
                  <span className="text-xs text-slate-700 leading-relaxed break-all">{log.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Drawer ───────────────────────────────────────────────────────────────

export const DeviceDrawer: React.FC<DeviceDrawerProps> = ({
  device,
  initialTab,
  firmwareVersions,
  onClose,
  onUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'logs'>(initialTab);
  const [otaTarget, setOtaTarget] = useState<string | null>(null);
  const [hasLogErrors, setHasLogErrors] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Detectar erros nos logs para badge
  useEffect(() => {
    api.getDeviceLogs(device.id, 'ERROR', 1)
      .then((data: DeviceLog[]) => setHasLogErrors(data.length > 0))
      .catch(() => {});
  }, [device.id]);

  const handleRestart = async () => {
    if (!confirm(`Reiniciar ${device.device_name}?\n\nO dispositivo ficará offline por alguns segundos.`)) return;
    setRestarting(true);
    try {
      await api.restartDevice(device.id);
      toast.success(`Restart enviado para ${device.device_name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao reiniciar';
      toast.error(msg);
    } finally {
      setRestarting(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${device.status === 'online' ? 'bg-emerald-100' : 'bg-slate-100'}`}>
              <Cpu className={`w-5 h-5 ${device.status === 'online' ? 'text-emerald-600' : 'text-slate-400'}`} />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-sm leading-tight">{device.device_name}</h2>
              <p className="text-xs text-slate-400 font-mono">{device.mac_address}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-colors ${
              activeTab === 'info'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Info className="w-4 h-4" />
            Informações
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-colors relative ${
              activeTab === 'logs'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Logs
            {hasLogErrors && (
              <span className="absolute top-2 right-6 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'info' ? (
            <InfoTab
              device={device}
              firmwareVersions={firmwareVersions}
              onUpdated={onUpdated}
              onOTAStart={(version) => setOtaTarget(version)}
              onRestart={handleRestart}
            />
          ) : (
            <LogsTab device={device} />
          )}
        </div>
      </div>

      {/* OTA Progress Modal */}
      {otaTarget && (
        <OTAProgressModal
          device={device}
          targetVersion={otaTarget}
          onClose={() => setOtaTarget(null)}
        />
      )}
    </>
  );
};
