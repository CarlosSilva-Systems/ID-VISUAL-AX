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
  private idOdooInterval: NodeJS.Timeout | null = null;
  private idProducaoInterval: NodeJS.Timeout | null = null;
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

    // ID_Odoo: 10 minutos (600000ms)
    this.idOdooInterval = setInterval(async () => {
      const startTime = Date.now();
      this.metrics.idOdoo.totalRequests++;
      
      try {
        await api.get('/odoo/mos');
        this.metrics.idOdoo.successCount++;
        this.metrics.idOdoo.lastSuccess = new Date();
        this.metrics.idOdoo.consecutiveFailures = 0;
        
        const duration = Date.now() - startTime;
        console.log(`[Polling] ID_Odoo refreshed (${duration}ms) - Success: ${this.metrics.idOdoo.successCount}/${this.metrics.idOdoo.totalRequests}`);
      } catch (err) {
        this.metrics.idOdoo.failureCount++;
        this.metrics.idOdoo.lastFailure = new Date();
        this.metrics.idOdoo.consecutiveFailures++;
        
        const duration = Date.now() - startTime;
        console.error(`[Polling] ID_Odoo failed (${duration}ms) - Consecutive failures: ${this.metrics.idOdoo.consecutiveFailures}`, err);
        
        // Alerta após 3 falhas consecutivas
        if (this.metrics.idOdoo.consecutiveFailures === 3) {
          console.warn('[Polling] ⚠️ ID_Odoo: 3 falhas consecutivas detectadas');
        }
        
        // Alerta crítico após 10 falhas consecutivas
        if (this.metrics.idOdoo.consecutiveFailures === 10) {
          console.error('[Polling] 🚨 ID_Odoo: 10 falhas consecutivas - possível problema de conectividade');
        }
      }
    }, 10 * 60 * 1000);

    // ID_Producao: 30 segundos (30000ms)
    this.idProducaoInterval = setInterval(async () => {
      const startTime = Date.now();
      this.metrics.idProducao.totalRequests++;
      
      try {
        await api.get('/id-requests/manual');
        this.metrics.idProducao.successCount++;
        this.metrics.idProducao.lastSuccess = new Date();
        this.metrics.idProducao.consecutiveFailures = 0;
        
        const duration = Date.now() - startTime;
        console.log(`[Polling] ID_Producao refreshed (${duration}ms) - Success: ${this.metrics.idProducao.successCount}/${this.metrics.idProducao.totalRequests}`);
      } catch (err) {
        this.metrics.idProducao.failureCount++;
        this.metrics.idProducao.lastFailure = new Date();
        this.metrics.idProducao.consecutiveFailures++;
        
        const duration = Date.now() - startTime;
        console.error(`[Polling] ID_Producao failed (${duration}ms) - Consecutive failures: ${this.metrics.idProducao.consecutiveFailures}`, err);
        
        // Alerta após 3 falhas consecutivas
        if (this.metrics.idProducao.consecutiveFailures === 3) {
          console.warn('[Polling] ⚠️ ID_Producao: 3 falhas consecutivas detectadas');
        }
        
        // Alerta crítico após 10 falhas consecutivas
        if (this.metrics.idProducao.consecutiveFailures === 10) {
          console.error('[Polling] 🚨 ID_Producao: 10 falhas consecutivas - possível problema de conectividade');
        }
      }
    }, 30 * 1000);

    console.log('[Polling] Started (ID_Odoo: 10min, ID_Producao: 30s)');
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

export const pollingManager = new PollingManager();
