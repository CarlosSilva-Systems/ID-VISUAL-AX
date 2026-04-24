import { useEffect, useRef, useState } from 'react';
import { fetchJobStatus, JobStatusResponse } from '../services/printQueueApi';

interface UsePrintJobStatusResult {
  status: JobStatusResponse['status'] | null;
  isLoading: boolean;
  isDone: boolean;
  isFailed: boolean;
  failedReason: string | null;
}

const TERMINAL_STATUSES = new Set(['done', 'failed']);
const POLL_INTERVAL_MS = 2000;

/**
 * Faz polling do status de um PrintJob a cada 2s.
 * Para automaticamente quando o status for 'done' ou 'failed'.
 */
export function usePrintJobStatus(jobId: number | null): UsePrintJobStatusResult {
  const [status, setStatus] = useState<JobStatusResponse['status'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (jobId === null) {
      setStatus(null);
      setIsLoading(false);
      setFailedReason(null);
      return;
    }

    cancelledRef.current = false;
    setIsLoading(true);

    async function poll() {
      if (cancelledRef.current) return;
      try {
        const data = await fetchJobStatus(jobId!);
        if (cancelledRef.current) return;
        setStatus(data.status);
        setFailedReason(data.failed_reason);
        setIsLoading(false);

        if (!TERMINAL_STATUSES.has(data.status)) {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelledRef.current) {
          // Erro de rede — tenta novamente
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    poll();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId]);

  return {
    status,
    isLoading,
    isDone: status === 'done',
    isFailed: status === 'failed',
    failedReason,
  };
}
