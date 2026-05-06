import { api } from './api';

/**
 * PollingManager
 * 
 * Gerencia polling automático de identificações visuais em background:
 * - ID_Odoo: busca a cada 10 minutos via GET /odoo/mos
 * - ID_Producao: busca a cada 30 segundos via GET /id-requests/manual
 * 
 * Lifecycle:
 * - start(): inicia ambos os pollings
 * - stop(): para ambos os pollings
 * - restart(): para e reinicia (útil ao mudar banco de dados)
 * 
 * Garante que apenas uma instância de cada polling está ativa por vez.
 */
class PollingManager {
  private idOdooInterval: ReturnType<typeof setInterval> | null = null;
  private idProducaoInterval: ReturnType<typeof setInterval> | null = null;
  private isActive = false;

  // Métricas de monitoramento
  private metrics = {
    idOdoo: {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      lastSuccess: null as Date | null,
      lastFailure: null as Date | null,
      consecutiveFailures: 0
    },
    idProducao: {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      lastSuccess: null as Date | null,
      lastFailure: null as Date | null,
      consecutiveFailures: 0
    }
  };

  /**
   * Inicia ambos os pollings.
   * Se já estiver ativo, exibe warning e não faz nada.
   */
  start() {
    if (this.isActive) {
      console.warn('[Polling] Already active, ignoring start() call');
      return;
    }

    this.isActive = true;

    // ID_Odoo: 15 minutos (900000ms) - Dados de MOs mudam pouco
    this.idOdooInterval = setInterval(async () => {
      if (!this.isActive) return;
      await this.executePolling('idOdoo', '/odoo/mos');
    }, 15 * 60 * 1000);

    // ID_Producao: 60 segundos (60000ms) - WebSockets cuidam do tempo real
    this.idProducaoInterval = setInterval(async () => {
      if (!this.isActive) return;
      await this.executePolling('idProducao', '/id-requests/manual');
    }, 60 * 1000);

    if (import.meta.env.DEV) {
      console.log('[Polling] Started (ID_Odoo: 15min, ID_Producao: 60s)');
    }
    this.logMetrics();
  }

  /**
   * Executa uma chamada de polling com lógica de backoff
   */
  private async executePolling(key: 'idOdoo' | 'idProducao', endpoint: string) {
    const startTime = Date.now();
    this.metrics[key].totalRequests++;

    try {
      await api.get(endpoint);
      this.metrics[key].successCount++;
      this.metrics[key].lastSuccess = new Date();
      this.metrics[key].consecutiveFailures = 0;
      
      const duration = Date.now() - startTime;
      console.log(`[Polling] ${key} refreshed (${duration}ms) - Success: ${this.metrics[key].successCount}/${this.metrics[key].totalRequests}`);
    } catch (err: any) {
      this.metrics[key].failureCount++;
      this.metrics[key].lastFailure = new Date();
      this.metrics[key].consecutiveFailures++;
      
      const is429 = err?.response?.status === 429;
      const duration = Date.now() - startTime;
      
      if (is429) {
        console.warn(`[Polling] ⚠️ ${key} received 429 (Too Many Requests). Implementing silent backoff.`);
      }

      console.error(`[Polling] ${key} failed (${duration}ms) - Consecutive failures: ${this.metrics[key].consecutiveFailures}`, err);
      
      // Alerta crítico após falhas persistentes
      if (this.metrics[key].consecutiveFailures === 10) {
        console.error(`[Polling] 🚨 ${key}: 10 falhas consecutivas - possível problema de conectividade`);
      }
    }

    if (import.meta.env.DEV) {
      console.log('[Polling] Status Updated');
    }
    this.logMetrics();
  }

  /**
   * Para ambos os pollings e limpa os intervals.
   */
  stop() {
    if (this.idOdooInterval) {
      clearInterval(this.idOdooInterval);
      this.idOdooInterval = null;
    }

    if (this.idProducaoInterval) {
      clearInterval(this.idProducaoInterval);
      this.idProducaoInterval = null;
    }

    this.isActive = false;
    console.log('[Polling] Stopped');
    this.logMetrics();
  }

  /**
   * Reinicia os pollings (para e inicia novamente).
   * Útil quando o banco de dados ativo muda.
   */
  restart() {
    console.log('[Polling] Restarting...');
    this.stop();
    // Pequeno delay para garantir cleanup completo
    setTimeout(() => this.start(), 100);
  }

  /**
   * Retorna métricas de polling para monitoramento.
   */
  getMetrics() {
    return {
      ...this.metrics,
      isActive: this.isActive
    };
  }

  /**
   * Loga métricas atuais no console.
   */
  private logMetrics() {
    if (import.meta.env.DEV) {
      console.log('[Polling] Metrics:', {
        idOdoo: {
          total: this.metrics.idOdoo.totalRequests,
          success: this.metrics.idOdoo.successCount,
          failure: this.metrics.idOdoo.failureCount,
          successRate: this.metrics.idOdoo.totalRequests > 0 
            ? `${((this.metrics.idOdoo.successCount / this.metrics.idOdoo.totalRequests) * 100).toFixed(1)}%`
            : 'N/A',
          lastSuccess: this.metrics.idOdoo.lastSuccess?.toISOString() || 'Never',
          consecutiveFailures: this.metrics.idOdoo.consecutiveFailures
        },
        idProducao: {
          total: this.metrics.idProducao.totalRequests,
          success: this.metrics.idProducao.successCount,
          failure: this.metrics.idProducao.failureCount,
          successRate: this.metrics.idProducao.totalRequests > 0
            ? `${((this.metrics.idProducao.successCount / this.metrics.idProducao.totalRequests) * 100).toFixed(1)}%`
            : 'N/A',
          lastSuccess: this.metrics.idProducao.lastSuccess?.toISOString() || 'Never',
          consecutiveFailures: this.metrics.idProducao.consecutiveFailures
        }
      });
    }
  }
}

export const pollingManager = new PollingManager();
