/**
 * Utilitários de Data para o ID Visual AX
 */

/**
 * Formata uma string de data (ISO ou Odoo format) para o padrão pt-BR.
 * Lida com variações comuns que causam "Invalid Date".
 */
export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  
  try {
    // Normaliza o formato do Odoo "YYYY-MM-DD HH:mm:ss" para ISO "YYYY-MM-DDTHH:mm:ss"
    let normalized = dateStr.trim();
    if (normalized.includes(' ') && !normalized.includes('T')) {
      normalized = normalized.replace(' ', 'T');
    }
    
    // Se for apenas data YYYY-MM-DD, garante que não haverá shift de timezone ao tratar como meio-dia
    if (normalized.length === 10) {
      normalized += 'T12:00:00';
    }

    const date = new Date(normalized);
    
    // Verifica se a data é válida
    if (isNaN(date.getTime())) {
      console.warn(`[DateUtils] Invalid date string: ${dateStr}`);
      return dateStr;
    }

    return date.toLocaleDateString('pt-BR');
  } catch (e) {
    console.error(`[DateUtils] Error formatting date: ${dateStr}`, e);
    return dateStr;
  }
};

/**
 * Formata data e hora para o padrão pt-BR.
 */
export const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  
  try {
    let normalized = dateStr.trim();
    if (normalized.includes(' ') && !normalized.includes('T')) {
      normalized = normalized.replace(' ', 'T');
    }

    const date = new Date(normalized);
    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return dateStr;
  }
};
