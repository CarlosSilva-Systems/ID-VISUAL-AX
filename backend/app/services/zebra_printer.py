"""
Cliente TCP assíncrono para impressoras Zebra via protocolo ZPL (porta 9100).

Uso:
    printer = ZebraPrinter(host="192.168.1.100")
    await printer.print_zpl(zpl_string)

A instância deve ser criada com dados vindos de SystemSetting:
    - zebra_printer_host
    - zebra_printer_port  (opcional, padrão 9100)
    - zebra_printer_timeout (opcional, padrão 5)
"""

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class ZebraPrinterError(Exception):
    """Exceção customizada para falhas de comunicação com a impressora Zebra."""
    pass


class ZebraPrinter:
    """
    Cliente TCP assíncrono para envio de ZPL a impressoras Zebra.

    Protocolo: socket puro na porta 9100 (RAW printing).
    Sem drivers ou SDKs — apenas asyncio.open_connection.
    """

    def __init__(self, host: str, port: int = 9100, timeout: int = 5) -> None:
        """
        Args:
            host: Endereço IP ou hostname da impressora Zebra.
            port: Porta TCP (padrão 9100 — RAW printing).
            timeout: Timeout em segundos para abertura da conexão.
        """
        if not host or not host.strip():
            raise ZebraPrinterError("Host da impressora não pode ser vazio.")
        self.host = host.strip()
        self.port = port
        self.timeout = timeout

    async def print_zpl(self, zpl: str) -> None:
        """
        Envia um payload ZPL para a impressora via TCP.

        Abre a conexão, envia os dados, drena o buffer e fecha a conexão.
        Cada chamada abre e fecha uma conexão independente (stateless).

        Args:
            zpl: String ZPL completa (deve começar com ^XA e terminar com ^XZ).

        Raises:
            ZebraPrinterError: Se a conexão falhar ou o envio não for concluído.
        """
        if not zpl or not zpl.strip():
            raise ZebraPrinterError("Payload ZPL não pode ser vazio.")

        reader: Optional[asyncio.StreamReader] = None
        writer: Optional[asyncio.StreamWriter] = None

        try:
            logger.info(
                f"[ZebraPrinter] Conectando a {self.host}:{self.port} "
                f"(timeout={self.timeout}s)"
            )
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=self.timeout,
            )

            payload = zpl.encode("utf-8")
            writer.write(payload)
            await asyncio.wait_for(writer.drain(), timeout=self.timeout)

            logger.info(
                f"[ZebraPrinter] ✓ {len(payload)} bytes enviados para "
                f"{self.host}:{self.port}"
            )

        except asyncio.TimeoutError as exc:
            raise ZebraPrinterError(
                f"Timeout ao conectar/enviar para a impressora {self.host}:{self.port} "
                f"(timeout={self.timeout}s)"
            ) from exc

        except OSError as exc:
            raise ZebraPrinterError(
                f"Erro de rede ao conectar à impressora {self.host}:{self.port}: {exc}"
            ) from exc

        except Exception as exc:
            raise ZebraPrinterError(
                f"Erro inesperado ao imprimir em {self.host}:{self.port}: {exc}"
            ) from exc

        finally:
            if writer is not None:
                try:
                    writer.close()
                    await asyncio.wait_for(writer.wait_closed(), timeout=2)
                except Exception:
                    pass  # Ignora erros no fechamento — conexão já pode estar encerrada
