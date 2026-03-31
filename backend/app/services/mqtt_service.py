"""
Serviço MQTT para gerenciamento de dispositivos ESP32.
Tópicos:
  - andon/discovery       → descoberta de dispositivo
  - andon/status/{mac}    → LWT online/offline
  - andon/logs/{mac}      → logs de diagnóstico
"""
import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.db.session import async_session_factory
from app.models.esp_device import ESPDevice, ESPDeviceLog, DeviceStatus, EventType
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

_mqtt_task: asyncio.Task | None = None


async def _get_or_create_device(
    session: AsyncSession, mac_address: str, device_name: str = ""
) -> ESPDevice:
    stmt = select(ESPDevice).where(ESPDevice.mac_address == mac_address)
    result = await session.execute(stmt)
    device = result.scalars().first()
    if not device:
        device = ESPDevice(
            mac_address=mac_address,
            device_name=device_name or mac_address,
            status=DeviceStatus.online,
            last_seen_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        session.add(device)
        await session.flush()
    return device


async def _add_log(
    session: AsyncSession,
    device_id,
    event_type: EventType,
    message: str,
):
    log = ESPDeviceLog(device_id=device_id, event_type=event_type, message=message)
    session.add(log)


async def _handle_discovery(payload_raw: bytes):
    try:
        payload = json.loads(payload_raw.decode())
        mac = payload.get("mac_address", "").strip()
        name = payload.get("device_name", "").strip()
        if not mac:
            logger.warning("MQTT discovery: payload sem mac_address, descartado.")
            return
    except Exception as e:
        logger.error(f"MQTT discovery: payload inválido — {e}")
        return

    async with async_session_factory() as session:
        device = await _get_or_create_device(session, mac, name)
        device.status = DeviceStatus.online
        device.last_seen_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if name:
            device.device_name = name
        await _add_log(session, device.id, EventType.discovery, f"Dispositivo descoberto: {name or mac}")
        await session.commit()
        await session.refresh(device)

    await ws_manager.broadcast("device_discovery", {
        "mac_address": mac,
        "device_name": name,
        "status": "online",
    })
    logger.info(f"MQTT discovery: {mac} ({name})")


async def _handle_status(mac: str, payload_raw: bytes):
    try:
        status_str = payload_raw.decode().strip().lower()
        if status_str not in ("online", "offline"):
            logger.warning(f"MQTT status: valor inválido '{status_str}' para {mac}")
            return
        new_status = DeviceStatus.online if status_str == "online" else DeviceStatus.offline
    except Exception as e:
        logger.error(f"MQTT status: erro ao decodificar payload — {e}")
        return

    async with async_session_factory() as session:
        stmt = select(ESPDevice).where(ESPDevice.mac_address == mac)
        result = await session.execute(stmt)
        device = result.scalars().first()
        if not device:
            logger.warning(f"MQTT status: dispositivo {mac} não encontrado, descartado.")
            return
        if device.status != new_status:
            device.status = new_status
            device.last_seen_at = datetime.now(timezone.utc).replace(tzinfo=None)
            await _add_log(
                session, device.id, EventType.status_change,
                f"Status alterado para {status_str}"
            )
            await session.commit()

    await ws_manager.broadcast("device_status", {"mac_address": mac, "status": status_str})
    logger.info(f"MQTT status: {mac} → {status_str}")


async def _handle_log(mac: str, payload_raw: bytes):
    try:
        message = payload_raw.decode().strip()
    except Exception as e:
        logger.error(f"MQTT log: erro ao decodificar payload — {e}")
        return

    async with async_session_factory() as session:
        stmt = select(ESPDevice).where(ESPDevice.mac_address == mac)
        result = await session.execute(stmt)
        device = result.scalars().first()
        if not device:
            logger.warning(f"MQTT log: dispositivo {mac} não encontrado, descartado.")
            return
        await _add_log(session, device.id, EventType.error, message)
        await session.commit()

    await ws_manager.broadcast("device_log", {"mac_address": mac, "message": message})


async def _mqtt_loop():
    """Loop principal do serviço MQTT com reconexão automática."""
    try:
        import aiomqtt
    except ImportError:
        logger.error("aiomqtt não instalado. Serviço MQTT desabilitado.")
        return

    host = getattr(settings, "MQTT_BROKER_HOST", "localhost")
    port = int(getattr(settings, "MQTT_BROKER_PORT", 1883))
    backoff = 1

    while True:
        try:
            logger.info(f"MQTT: conectando a {host}:{port}...")
            async with aiomqtt.Client(hostname=host, port=port) as client:
                backoff = 1
                logger.info("MQTT: conectado. Inscrevendo nos tópicos...")
                await client.subscribe("andon/discovery")
                await client.subscribe("andon/status/#")
                await client.subscribe("andon/logs/#")
                logger.info("MQTT: escutando tópicos andon/discovery, andon/status/#, andon/logs/#")

                async for message in client.messages:
                    topic = str(message.topic)
                    payload = message.payload if isinstance(message.payload, bytes) else str(message.payload).encode()

                    if topic == "andon/discovery":
                        await _handle_discovery(payload)
                    elif topic.startswith("andon/status/"):
                        mac = topic.split("/", 2)[2]
                        await _handle_status(mac, payload)
                    elif topic.startswith("andon/logs/"):
                        mac = topic.split("/", 2)[2]
                        await _handle_log(mac, payload)

        except asyncio.CancelledError:
            logger.info("MQTT: serviço encerrado.")
            break
        except Exception as e:
            logger.error(f"MQTT: erro de conexão — {e}. Reconectando em {backoff}s...")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)


def start_mqtt_service():
    global _mqtt_task
    _mqtt_task = asyncio.create_task(_mqtt_loop())
    logger.info("MQTT: task iniciada.")


def stop_mqtt_service():
    global _mqtt_task
    if _mqtt_task and not _mqtt_task.done():
        _mqtt_task.cancel()
        logger.info("MQTT: task cancelada.")
