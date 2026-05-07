/**
 * Retorna a URL completa de um endpoint WebSocket.
 *
 * Estratégia de resolução (em ordem de prioridade):
 * 1. Se `VITE_API_URL` está definido (ex: dev com backend separado), usa esse base
 *    convertendo http→ws / https→wss.
 * 2. Caso contrário (produção via Nginx ou dev via proxy Vite), constrói a URL
 *    relativa ao host do browser — garante que a requisição passe pelo proxy
 *    reverso sem hardcodar `localhost`.
 *
 * @param path - Caminho do endpoint WebSocket (ex: '/devices/ws')
 */
export function getWebSocketUrl(path: string): string {
  const apiUrl = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL;

  if (apiUrl) {
    // URL explícita configurada (dev com backend em host diferente)
    const base = apiUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    return `${base}${path}`;
  }

  // URL relativa — usa o mesmo host/porta/protocolo do browser.
  // Em produção (Nginx), a requisição ws:// é roteada pelo proxy reverso via
  // os headers Upgrade + Connection que já estão no nginx.conf.
  // Em desenvolvimento (Vite proxy), também funciona pela config de proxy do vite.config.ts.
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${proto}//${window.location.host}/api/v1${cleanPath}`;
}
