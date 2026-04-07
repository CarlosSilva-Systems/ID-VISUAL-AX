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

# Deduplicação de eventos de botão em memória
# Estrutura: { mac: { color: last_processed_timestamp } }
_button_dedup: dict[str, dict[str, float]] = {}
_BUTTON_DEDUP_WINDOW_S = 3.0


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


async def _add_log(session: AsyncSession, device_id, event_type: EventType, message: str):
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
        "mac_address": mac, "device_name": name, "status": "online",
    })
    logger.info(f"MQTT discovery: {mac} ({name})")


async def _handle_status(mac: str, payload_raw: bytes):
    try:
        status_str = payload_raw.decode().strip().lower()
        if status_str == "heartbeat":
            return
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
            await _add_log(session, device.id, EventType.status_change, f"Status alterado para {status_str}")
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


async def _handle_button(mac: str, color: str, payload_raw: bytes):
    """
    Processa eventos de botões publicados pelo ESP32 em andon/button/{mac}/{color}.
    Deduplicação em memória de _BUTTON_DEDUP_WINDOW_S segundos.
    """
    import time

    now_ts = time.monotonic()
    color_lower = color.lower()
    last_ts = _button_dedup.get(mac, {}).get(color_lower, 0.0)
    if (now_ts - last_ts) < _BUTTON_DEDUP_WINDOW_S:
        logger.debug(f"MQTT button: evento {mac}/{color_lower} duplicado, ignorado.")
        return
    _button_dedup.setdefault(mac, {})[color_lower] = now_ts

    try:
        action = payload_raw.decode().strip()
        if action != "PRESSED":
            logger.warning(f"MQTT button: ação inválida '{action}' para {mac}/{color}")
            return
    except Exception as e:
        logger.error(f"MQTT button: erro ao decodificar payload — {e}")
        return

    async with async_session_factory() as session:
        stmt = select(ESPDevice).where(ESPDevice.mac_address == mac)
        result = await session.execute(stmt)
        device = result.scalars().first()

        if not device:
            logger.warning(f"MQTT button: dispositivo {mac} não encontrado, descartado.")
            return
        if not device.workcenter_id:
            logger.warning(f"MQTT button: dispositivo {mac} não vinculado a nenhuma mesa, descartado.")
            return

        from app.models.andon import AndonCall

        color_map = {
            "green":  {"call_color": "GREEN",  "category": "Produção Normal",  "reason": "Produção retomada",      "is_stop": False},
            "yellow": {"call_color": "YELLOW", "category": "Alerta",           "reason": "Solicitação de suporte", "is_stop": False},
            "red":    {"call_color": "RED",    "category": "Parada Crítica",   "reason": "Parada de emergência",   "is_stop": True},
        }

        button_config = color_map.get(color_lower)
        if not button_config:
            logger.warning(f"MQTT button: cor inválida '{color}' para {mac}")
            return

        if color_lower == "green":
            stmt_calls = select(AndonCall).where(
                AndonCall.workcenter_id == device.workcenter_id,
                AndonCall.status != "RESOLVED"
            )
            result_calls = await session.execute(stmt_calls)
            active_calls = result_calls.scalars().all()
            for call in active_calls:
                call.status = "RESOLVED"
                call.resolved_note = f"Resolvido via botão físico ESP32 ({device.device_name})"
                call.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                session.add(call)
            await session.commit()
            logger.info(f"MQTT button: {len(active_calls)} chamados resolvidos para workcenter {device.workcenter_id} via botão verde")
            await _send_andon_state(mac, "GREEN")
            await ws_manager.broadcast("andon_resolved", {
                "workcenter_id": device.workcenter_id, "device_mac": mac, "resolved_count": len(active_calls)
            })
            return

        call = AndonCall(
            color=button_config["call_color"],
            category=button_config["category"],
            reason=button_config["reason"],
            description=f"Acionado via botão físico ESP32 ({device.device_name})",
            workcenter_id=device.workcenter_id,
            workcenter_name=f"Mesa {device.workcenter_id}",
            status="OPEN",
            triggered_by=f"ESP32 {device.device_name}",
            is_stop=button_config["is_stop"]
        )
        session.add(call)
        await session.commit()
        await session.refresh(call)
        logger.info(f"MQTT button: chamado {button_config['call_color']} criado para workcenter {device.workcenter_id} via {mac}")
        await _send_andon_state(mac, button_config["call_color"])
        await ws_manager.broadcast("andon_call_created", {
            "call_id": call.id, "color": call.color,
            "workcenter_id": device.workcenter_id, "device_mac": mac, "reason": call.reason
        })


async def _handle_pause(mac: str, payload_raw: bytes):
    """
    Toggle pause/resume via botão físico ESP32 (GPIO 33).

    Fonte de verdade do toggle: AndonStatus local.
      - status == "cinza"  → está pausado → RETOMAR
      - qualquer outro     → está rodando → PAUSAR

    Ao PAUSAR:
      - Salva o status anterior no campo updated_by com prefixo "prev:"
      - Grava AndonStatus = "cinza"
      - Chama pause_workorder no Odoo (para o timer)
      - Apaga todos os LEDs

    Ao RETOMAR:
      - Restaura o status anterior salvo (verde, amarelo, etc.)
      - Chama resume_workorder no Odoo (retoma o timer)
      - Acende LED correspondente ao status restaurado
    """
    import time

    now_ts = time.monotonic()
    last_ts = _button_dedup.get(mac, {}).get("pause", 0.0)
    if (now_ts - last_ts) < 5.0:
        logger.debug(f"MQTT pause: evento {mac}/pause duplicado, ignorado.")
        return
    _button_dedup.setdefault(mac, {})["pause"] = now_ts

    # ── 1. Buscar dispositivo e status atual ──────────────────────────────────
    from app.models.andon import AndonStatus

    async with async_session_factory() as session:
        stmt = select(ESPDevice).where(ESPDevice.mac_address == mac)
        result = await session.execute(stmt)
        device = result.scalars().first()

        if not device:
            logger.warning(f"MQTT pause: dispositivo {mac} não encontrado.")
            return
        if not device.workcenter_id:
            logger.warning(f"MQTT pause: dispositivo {mac} não vinculado a nenhuma mesa.")
            return

        wc_id = device.workcenter_id

        stmt_status = select(AndonStatus).where(AndonStatus.workcenter_odoo_id == wc_id)
        res_status = await session.execute(stmt_status)
        andon_status = res_status.scalars().first()

        current_status = andon_status.status if andon_status else "verde"

        # Status anterior salvo com prefixo "prev:" no campo updated_by
        prev_status = "verde"
        if andon_status and andon_status.updated_by and andon_status.updated_by.startswith("prev:"):
            prev_status = andon_status.updated_by[5:]

    # Toggle baseado no status LOCAL — fonte de verdade
    is_paused = current_status == "cinza"
    action = "resumed" if is_paused else "paused"
    logger.info(f"MQTT pause: workcenter {wc_id} — status='{current_status}' → ação='{action}'")

    # ── 2. Interagir com Odoo (pause/resume do timer) ─────────────────────────
    wo_id = None
    try:
        from app.services.odoo_client import OdooClient

        odoo = OdooClient(
            url=settings.ODOO_URL,
            db=settings.ODOO_DB,
            auth_type=settings.ODOO_AUTH_TYPE,
            login=settings.ODOO_SERVICE_LOGIN,
            secret=settings.ODOO_SERVICE_PASSWORD,
        )
        try:
            wo = await odoo.get_active_workorder(
                wc_id, ["progress", "ready", "pending", "waiting", "pause"]
            )
            if wo:
                wo_id = wo["id"]
                if action == "paused":
                    res_odoo = await odoo.pause_workorder(wo_id)
                    logger.info(f"MQTT pause: Odoo pause WO {wo_id} — {res_odoo}")
                else:
                    res_odoo = await odoo.resume_workorder(wo_id)
                    logger.info(f"MQTT pause: Odoo resume WO {wo_id} — {res_odoo}")
            else:
                logger.warning(f"MQTT pause: nenhuma WO ativa para workcenter {wc_id}, apenas atualizando status local.")
        finally:
            await odoo.close()
    except Exception as e:
        logger.error(f"MQTT pause: erro Odoo — {e}. Continuando com atualização local.")

    # ── 3. Atualizar estado local e LEDs ─────────────────────────────────────
    async with async_session_factory() as session:
        stmt_status = select(AndonStatus).where(AndonStatus.workcenter_odoo_id == wc_id)
        res_status = await session.execute(stmt_status)
        andon_status = res_status.scalars().first()

        if action == "paused":
            # Salvar status anterior para restaurar ao retomar
            status_to_save = current_status if current_status != "cinza" else "verde"

            if andon_status:
                andon_status.status = "cinza"
                andon_status.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                andon_status.updated_by = f"prev:{status_to_save}"
                session.add(andon_status)
            else:
                session.add(AndonStatus(
                    workcenter_odoo_id=wc_id,
                    workcenter_name=f"Mesa {wc_id}",
                    status="cinza",
                    updated_by=f"prev:{status_to_save}",
                ))

            await session.commit()
            await _send_led_command(mac, red=False, yellow=False, green=False)
            await ws_manager.broadcast("production_paused", {
                "workcenter_id": wc_id, "device_mac": mac, "wo_id": wo_id,
            })
            logger.info(f"MQTT pause: workcenter {wc_id} PAUSADO — status anterior salvo: '{status_to_save}'")

        else:  # resumed
            if andon_status:
                andon_status.status = prev_status
                andon_status.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                andon_status.updated_by = f"ESP32 {device.device_name}"
                session.add(andon_status)
                await session.commit()

            # Acender LED correspondente ao status restaurado
            led_map = {
                "verde":         {"red": False, "yellow": False, "green": True},
                "amarelo":       {"red": False, "yellow": True,  "green": False},
                "amarelo_suave": {"red": False, "yellow": True,  "green": False},
                "vermelho":      {"red": True,  "yellow": False, "green": False},
            }
            leds = led_map.get(prev_status, {"red": False, "yellow": False, "green": True})
            await _send_led_command(mac, **leds)
            await ws_manager.broadcast("production_resumed", {
                "workcenter_id": wc_id, "device_mac": mac,
                "wo_id": wo_id, "restored_status": prev_status,
            })
            logger.info(f"MQTT pause: workcenter {wc_id} RETOMADO — status restaurado: '{prev_status}'")


async def _handle_ota_progress(mac: str, payload_raw: bytes):
    """
    Processa mensagens de progresso OTA publicadas pelo ESP32 em andon/ota/progress/{mac}.
    
    Atualiza o registro OTAUpdateLog correspondente e emite evento WebSocket para o frontend.
    """
    try:
        payload = json.loads(payload_raw.decode())
        status = payload.get("status")  # downloading, installing, success, failed
        progress = payload.get("progress", 0)  # 0-100
        error = payload.get("error")
        
        if not status:
            logger.warning(f"MQTT OTA progress: payload sem status para {mac}")
            return
        
    except Exception as e:
        logger.error(f"MQTT OTA progress: erro ao decodificar payload — {e}")
        return
    
    from app.models.ota import OTAUpdateLog, OTAStatus
    
    async with async_session_factory() as session:
        # Buscar dispositivo
        stmt = select(ESPDevice).where(ESPDevice.mac_address == mac)
        result = await session.execute(stmt)
        device = result.scalars().first()
        
        if not device:
            logger.warning(f"MQTT OTA progress: dispositivo {mac} não encontrado")
            return
        
        # Buscar log OTA ativo (downloading ou installing)
        stmt_log = select(OTAUpdateLog).where(
            OTAUpdateLog.device_id == device.id,
            OTAUpdateLog.status.in_([OTAStatus.downloading, OTAStatus.installing])
        ).order_by(OTAUpdateLog.started_at.desc())
        result_log = await session.execute(stmt_log)
        ota_log = result_log.scalars().first()
        
        if not ota_log:
            # Criar novo log se não existir
            logger.info(f"MQTT OTA progress: criando novo log para {mac}")
            ota_log = OTAUpdateLog(
                device_id=device.id,
                firmware_release_id=None,  # Será preenchido posteriormente
                status=OTAStatus[status] if status in OTAStatus.__members__ else OTAStatus.downloading,
                progress_percent=progress,
                error_message=error,
                target_version="unknown"
            )
            session.add(ota_log)
        else:
            # Atualizar log existente
            ota_log.status = OTAStatus[status] if status in OTAStatus.__members__ else ota_log.status
            ota_log.progress_percent = progress
            ota_log.error_message = error
            
            # Definir completed_at quando status for success ou failed
            if status in ["success", "failed"]:
                ota_log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        
        await session.commit()
        await session.refresh(ota_log)
    
    # Emitir evento WebSocket
    await ws_manager.broadcast("ota_progress", {
        "mac": mac,
        "device_id": str(device.id),
        "status": status,
        "progress": progress,
        "error": error
    })
    
    logger.info(f"MQTT OTA progress: {mac} - {status} - {progress}%")


async def _send_led_command(mac: str, red: bool, yellow: bool, green: bool):
    """Publica comando de LED para o ESP32 via conexão MQTT temporária."""
    try:
        import aiomqtt

        host = getattr(settings, "MQTT_BROKER_HOST", "localhost")
        port = int(getattr(settings, "MQTT_BROKER_PORT", 1883))
        topic = f"andon/led/{mac}/command"
        payload = json.dumps({"red": red, "yellow": yellow, "green": green})

        async with aiomqtt.Client(hostname=host, port=port) as client:
            await client.publish(topic, payload, qos=1)
            logger.info(f"MQTT LED: {mac} — red={red} yellow={yellow} green={green}")
    except Exception as e:
        logger.error(f"MQTT LED: erro ao enviar comando para {mac} — {e}")


async def _handle_state_request(mac: str, client):
    """Responde a solicitações de estado do Andon enviadas pelo ESP32."""
    async with async_session_factory() as session:
        stmt = select(ESPDevice).where(ESPDevice.mac_address == mac)
        result = await session.execute(stmt)
        device = result.scalars().first()

        if not device or not device.workcenter_id:
            logger.warning(f"MQTT state request: dispositivo {mac} não encontrado ou não vinculado")
            await _send_andon_state_via_client(mac, "GREEN", client)
            return

        from app.models.andon import AndonCall
        stmt_calls = select(AndonCall).where(
            AndonCall.workcenter_id == device.workcenter_id,
            AndonCall.status != "RESOLVED"
        ).order_by(AndonCall.created_at.desc())

        result_calls = await session.execute(stmt_calls)
        active_calls = result_calls.scalars().all()

        current_state = "GREEN"
        for call in active_calls:
            if call.color == "RED":
                current_state = "RED"
                break
            elif call.color == "YELLOW" and current_state != "RED":
                current_state = "YELLOW"

        logger.info(f"MQTT state request: enviando estado {current_state} para {mac}")
        await _send_andon_state_via_client(mac, current_state, client)


async def _send_andon_state(mac: str, state: str):
    """Publica estado Andon para o ESP32 via conexão MQTT temporária."""
    try:
        import aiomqtt

        host = getattr(settings, "MQTT_BROKER_HOST", "localhost")
        port = int(getattr(settings, "MQTT_BROKER_PORT", 1883))
        topic = f"andon/state/{mac}"

        async with aiomqtt.Client(hostname=host, port=port) as client:
            await client.publish(topic, state, qos=1)
            logger.info(f"MQTT: Estado {state} enviado para {mac}")
    except Exception as e:
        logger.error(f"MQTT: Erro ao enviar estado para {mac} — {e}")


async def _send_andon_state_via_client(mac: str, state: str, client):
    topic = f"andon/state/{mac}"
    try:
        await client.publish(topic, state, qos=1)
        logger.info(f"MQTT: Estado {state} enviado para {mac}")
    except Exception as e:
        logger.error(f"MQTT: Erro ao enviar estado para {mac} — {e}")


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
                await client.subscribe("andon/button/#")
                await client.subscribe("andon/state/request/#")
                await client.subscribe("andon/ota/progress/#")
                await client.subscribe("andon/ota/trigger")
                logger.info("MQTT: escutando tópicos andon/discovery, andon/status/#, andon/logs/#, andon/button/#, andon/state/request/#, andon/ota/progress/#, andon/ota/trigger")

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
                    elif topic.startswith("andon/button/"):
                        parts = topic.split("/")
                        if len(parts) >= 4:
                            mac = parts[2]
                            color = parts[3]
                            if color == "pause":
                                await _handle_pause(mac, payload)
                            else:
                                await _handle_button(mac, color, payload)
                    elif topic.startswith("andon/state/request/"):
                        mac = topic.split("/", 3)[3]
                        await _handle_state_request(mac, client)
                    elif topic.startswith("andon/ota/progress/"):
                        mac = topic.split("/", 3)[3]
                        await _handle_ota_progress(mac, payload)

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
