import { useEffect, useRef, useCallback } from 'react';

const WS_URL = (() => {
  const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000/api/v1';
  return apiUrl.replace(/^http/, 'ws') + '/devices/ws';
})();

export type DeviceEvent =
  | { event: 'device_discovery'; data: { mac_address: string; device_name: string; status: string } }
  | { event: 'device_status'; data: { mac_address: string; status: string } }
  | { event: 'device_log'; data: { mac_address: string; message: string } }
  | { event: 'device_bound'; data: { mac_address: string; workcenter_id: number } }
  | { event: 'device_unbound'; data: { mac_address: string } };

type EventHandler = (event: DeviceEvent) => void;

export function useDeviceWebSocket(onEvent: EventHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as DeviceEvent;
        handlerRef.current(parsed);
      } catch {
        // mensagem inválida, ignorar
      }
    };

    ws.onclose = () => {
      // Reconectar após 3s
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);
}
