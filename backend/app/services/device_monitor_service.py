"""
Background task de monitoramento de dispositivos ESP32 offline.

Verifica a cada 5 minutos se algum device está offline por mais tempo
que o limiar configurado (padrão: 10 minutos) e emite alerta via WebSocket.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from sqlmodel import select

from app.db.session import async_session_factory
from app.models.esp_device import ESPDevice, DeviceStatus
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

_monitor_task: asyncio.Task | None = None
_CHECK_INTERVAL_SECONDS = 300  # 5 minutos


async def _get_offline_threshold_minutes() -> int:
    """Lê o limiar de offline da tabela system_settings ou variável de ambiente."""
    try:
        import os
        env_val = os.getenv("DEVICE_OFFLINE_ALERT_MINUTES")
        if env_val:
            return int(env_val)
    except (ValueError, TypeError):
        pass

    try:
        from app.models.system_setting import SystemSetting
        async with async_session_factory() as session:
            stmt = select(SystemSetting).where(SystemSetting.key == "device_offline_alert_minutes")
            result = await session.execute(stmt)
            setting = result.scalars().first()
            if setting and setting.value:
                return int(setting.value)
    except Exception as e:
        logger.debug(f"DeviceMonitor: falha ao ler system_settings — {e}")

    return 10  # padrão


async def _check_offline_devices() -> None:
    """Verifica devices offline além do limiar e emite alertas WebSocket."""
    threshold_minutes = await _get_offline_threshold_minutes()
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=threshold_minutes)

    try:
        async with async_session_factory() as session:
            stmt = select(ESPDevice).where(
                ESPDevice.status == DeviceStatus.offline,
                ESPDevice.last_seen_at.isnot(None),
                ESPDevice.last_seen_at < cutoff,
            )
            result = await session.execute(stmt)
            devices = result.scalars().all()

        for device in devices:
            offline_minutes = int(
                (datetime.now(timezone.utc).replace(tzinfo=None) - device.last_seen_at).total_seconds() / 60
            )
            await ws_manager.broadcast("device_offline_alert", {
                "device_id": str(device.id),
                "device_name": device.device_name,
                "mac_address": device.mac_address,
                "workcenter_id": device.workcenter_id,
                "workcenter_name": None,  # Simplificado — evita chamada Odoo no loop
                "offline_minutes": offline_minutes,
            })
            logger.warning(
                f"DeviceMonitor: {device.device_name} ({device.mac_address}) "
                f"offline há {offline_minutes} minutos"
            )

        if devices:
            logger.info(f"DeviceMonitor: {len(devices)} device(s) com alerta de offline emitido.")

    except Exception as e:
        logger.error(f"DeviceMonitor: erro durante verificação — {e}")


async def _monitor_loop() -> None:
    """Loop principal do monitor de devices offline."""
    logger.info("DeviceMonitor: iniciado.")
    while True:
        try:
            await asyncio.sleep(_CHECK_INTERVAL_SECONDS)
            await _check_offline_devices()
        except asyncio.CancelledError:
            logger.info("DeviceMonitor: encerrado.")
            break
        except Exception as e:
            logger.error(f"DeviceMonitor: erro inesperado no loop — {e}")


def start_device_monitor() -> None:
    global _monitor_task
    _monitor_task = asyncio.create_task(_monitor_loop())
    logger.info("DeviceMonitor: task iniciada.")


def stop_device_monitor() -> None:
    global _monitor_task
    if _monitor_task and not _monitor_task.done():
        _monitor_task.cancel()
        logger.info("DeviceMonitor: task cancelada.")
