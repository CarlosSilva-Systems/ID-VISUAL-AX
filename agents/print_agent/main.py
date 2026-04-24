"""
Print Agent — Agente de impressão ZPL para impressoras Zebra.

Roda em loop contínuo no PC do chão de fábrica:
  1. Faz polling na API para buscar jobs pendentes
  2. Envia o ZPL via TCP para a impressora
  3. Marca o job como done ou failed na API

Configuração via arquivo .env no mesmo diretório.
"""

import logging
import logging.handlers
import os
import signal
import socket
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

load_dotenv(Path(__file__).parent / ".env")

APP_URL          = os.getenv("APP_URL", "http://localhost:8000/api/v1").rstrip("/")
PRINTER_ID       = int(os.getenv("PRINTER_ID", "1"))
PRINTER_IP       = os.getenv("PRINTER_IP", "192.168.1.200")
PRINTER_PORT     = int(os.getenv("PRINTER_PORT", "9100"))
AGENT_KEY        = os.getenv("AGENT_KEY", "")
AGENT_ID         = os.getenv("AGENT_ID", "agente-1")
POLL_INTERVAL    = int(os.getenv("POLL_INTERVAL_SECONDS", "3"))
LOG_LEVEL        = os.getenv("LOG_LEVEL", "INFO").upper()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def _setup_logging() -> logging.Logger:
    log_dir = Path(__file__).parent
    log_file = log_dir / "print_agent.log"

    fmt = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = logging.handlers.RotatingFileHandler(
        log_file, maxBytes=10 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(fmt)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(fmt)

    logger = logging.getLogger("print_agent")
    logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    return logger


log = _setup_logging()

# ---------------------------------------------------------------------------
# Controle de shutdown gracioso
# ---------------------------------------------------------------------------

_running = True


def _handle_signal(signum, frame):
    global _running
    log.info("Agente encerrado (sinal recebido).")
    _running = False


signal.signal(signal.SIGTERM, _handle_signal)
signal.signal(signal.SIGINT, _handle_signal)

# ---------------------------------------------------------------------------
# Comunicação com a API
# ---------------------------------------------------------------------------

_HEADERS = {
    "X-Agent-Key": AGENT_KEY,
    "X-Agent-Id": AGENT_ID,
}


def fetch_pending_jobs() -> list[dict]:
    """Busca jobs pendentes para este agente. Retorna lista vazia em caso de erro."""
    url = f"{APP_URL}/print/printers/{PRINTER_ID}/jobs/pending"
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=10)
        if resp.status_code != 200:
            log.error(f"API retornou {resp.status_code} ao buscar jobs: {resp.text[:200]}")
            return []
        return resp.json()
    except requests.exceptions.ConnectionError as exc:
        log.warning(f"Falha de conexão com a API: {exc}. Aguardando 30s...")
        time.sleep(30)
        return []
    except requests.exceptions.Timeout:
        log.warning("Timeout ao buscar jobs. Aguardando 30s...")
        time.sleep(30)
        return []


def mark_done(job_id: int) -> None:
    url = f"{APP_URL}/print/jobs/{job_id}/done"
    try:
        requests.patch(url, headers=_HEADERS, timeout=10)
    except Exception as exc:
        log.error(f"Falha ao marcar job {job_id} como done: {exc}")


def mark_failed(job_id: int, reason: str) -> None:
    url = f"{APP_URL}/print/jobs/{job_id}/failed"
    try:
        requests.patch(url, headers=_HEADERS, json={"reason": reason}, timeout=10)
    except Exception as exc:
        log.error(f"Falha ao marcar job {job_id} como failed: {exc}")


# ---------------------------------------------------------------------------
# Envio TCP para a impressora
# ---------------------------------------------------------------------------

def send_zpl(zpl: str) -> None:
    """
    Envia o payload ZPL para a impressora via TCP (porta 9100).
    Lança exceção em caso de falha.
    """
    # ZPL usa latin-1 por padrão; ^CI28 no payload indica UTF-8
    encoding = "utf-8" if "^CI28" in zpl else "latin-1"
    data = zpl.encode(encoding, errors="replace")

    with socket.create_connection((PRINTER_IP, PRINTER_PORT), timeout=5) as sock:
        sock.sendall(data)


# ---------------------------------------------------------------------------
# Loop principal
# ---------------------------------------------------------------------------

def main() -> None:
    log.info(
        f"Print Agent iniciado — printer_id={PRINTER_ID} "
        f"ip={PRINTER_IP}:{PRINTER_PORT} poll={POLL_INTERVAL}s"
    )

    while _running:
        jobs = fetch_pending_jobs()

        for job in jobs:
            if not _running:
                break

            job_id = job["id"]
            label_type = job.get("label_type", "?")
            zpl = job.get("zpl_payload", "")

            try:
                send_zpl(zpl)
                mark_done(job_id)
                log.info(f"Job {job_id} concluído — {label_type}")
            except Exception as exc:
                mark_failed(job_id, str(exc))
                log.error(f"Job {job_id} falhou — {exc}")

        if _running:
            time.sleep(POLL_INTERVAL)

    log.info("Agente encerrado.")


if __name__ == "__main__":
    main()
