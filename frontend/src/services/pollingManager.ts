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
      try {
        await api.get('/odoo/mos');
        console.log('[Polling] ID_Odoo refreshed');
      } catch (err) {
        console.error('[Polling] ID_Odoo failed:', err);
      }
    }, 10 * 60 * 1000);

    // ID_Producao: 30 segundos (30000ms)
    this.idProducaoInterval = setInterval(async () => {
      try {
        await api.get('/id-requests/manual');
        console.log('[Polling] ID_Producao refreshed');
      } catch (err) {
        console.error('[Polling] ID_Producao failed:', err);
      }
    }, 30 * 1000);

    console.log('[Polling] Started (ID_Odoo: 10min, ID_Producao: 30s)');
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
}

export const pollingManager = new PollingManager();
