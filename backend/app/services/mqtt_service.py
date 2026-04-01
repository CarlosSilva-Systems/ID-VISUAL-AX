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
# Evita processar múltiplos eventos idênticos causados por bouncing no ESP32
_button_dedup: dict[str, dict[str, float]] = {}
_BUTTON_DEDUP_WINDOW_S = 3.0  # janela de deduplicação em segundos


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
        
        # Ignorar mensagens de heartbeat (não são mudanças de status)
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


async def _handle_button(mac: str, color: str, payload_raw: bytes):
    """
    Processa eventos de botões publicados pelo ESP32 em andon/button/{mac}/{color}.
    Deduplicação em memória: ignora eventos idênticos (mesmo mac+color) dentro
    de _BUTTON_DEDUP_WINDOW_S segundos para absorver bouncing do hardware.
    """
    import time

    # ── Deduplicação ──────────────────────────────────────────────────────────
    now_ts = time.monotonic()
    color_lower = color.lower()
    last_ts = _button_dedup.get(mac, {}).get(color_lower, 0.0)

    if (now_ts - last_ts) < _BUTTON_DEDUP_WINDOW_S:
        logger.debug(f"MQTT button: evento {mac}/{color_lower} duplicado, ignorado.")
        return

    # Registrar timestamp antes de processar (evita race condition)
    _button_dedup.setdefault(mac, {})[color_lower] = now_ts
    # ─────────────────────────────────────────────────────────────────────────

    try:
        action = payload_raw.decode().strip()
        if action != "PRESSED":
            logger.warning(f"MQTT button: ação inválida '{action}' para {mac}/{color}")
            return
    except Exception as e:
        logger.error(f"MQTT button: erro ao decodificar payload — {e}")
        return

    async with async_session_factory() as session:
        # Verificar se dispositivo existe e está vinculado
        stmt = select(ESPDevice).where(ESPDevice.mac_address == mac)
        result = await session.execute(stmt)
        device = result.scalars().first()
        
        if not device:
            logger.warning(f"MQTT button: dispositivo {mac} não encontrado, descartado.")
            return
        
        if not device.workcenter_id:
            logger.warning(f"MQTT button: dispositivo {mac} não vinculado a nenhuma mesa, descartado.")
            return
        
        # Importar modelos necessários
        from app.models.andon import AndonCall
        
        # Mapear cor do botão para cor do chamado e categoria
        color_map = {
            "green": {"call_color": "GREEN", "category": "Produção Normal", "reason": "Produção retomada", "is_stop": False},
            "yellow": {"call_color": "YELLOW", "category": "Alerta", "reason": "Solicitação de suporte", "is_stop": False},
            "red": {"call_color": "RED", "category": "Parada Crítica", "reason": "Parada de emergência", "is_stop": True}
        }
        
        button_config = color_map.get(color.lower())
        if not button_config:
            logger.warning(f"MQTT button: cor inválida '{color}' para {mac}")
            return
        
        # Se for botão verde, resolver chamados ativos ao invés de criar novo
        if color.lower() == "green":
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
            
            # Enviar estado atualizado para o ESP32
            await _send_andon_state(mac, "GREEN")
            
            # Broadcast via WebSocket
            await ws_manager.broadcast("andon_resolved", {
                "workcenter_id": device.workcenter_id,
                "device_mac": mac,
                "resolved_count": len(active_calls)
            })
            return
        
        # Para botões amarelo e vermelho, criar novo chamado
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
        
        # Enviar estado atualizado para o ESP32
        await _send_andon_state(mac, button_config["call_color"])
        
        # Broadcast via WebSocket
        await ws_manager.broadcast("andon_call_created", {
            "call_id": call.id,
            "color": call.color,
            "workcenter_id": device.workcenter_id,
            "device_mac": mac,
            "reason": call.reason
        })


async def _handle_pause(mac: str, payload_raw: bytes):
    """
    Processa evento de pause/resume publicado pelo ESP32 em andon/button/{mac}/pause.
    Comportamento toggle: se a WO está em progresso → pausa; se está pausada → retoma.
    Ao pausar: resolve chamados ativos + envia comando para apagar todos os LEDs.
    Ao retomar: restaura estado normal.
    """
    import time

    # Deduplicação — janela maior para pause (5s) pois é ação crítica
    now_ts = time.monotonic()
    last_ts = _button_dedup.get(mac, {}).get("pause", 0.0)
    if (now_ts - last_ts) < 5.0:
        logger.debug(f"MQTT pause: evento {mac}/pause duplicado, ignorado.")
        return
    _button_dedup.setdefault(mac, {})["pause"] = now_ts

    async with async_session_factory() as session:
        # Buscar dispositivo e workcenter vinculado
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

    # Buscar WO ativa no Odoo (fora da sessão DB para não bloquear)
    try:
        from app.core.config import settings
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
                wc_id, ["progress", "ready", "pending", "waiting"]
            )

            if not wo:
                logger.warning(f"MQTT pause: nenhuma WO ativa para workcenter {wc_id}.")
                return

            wo_id = wo["id"]
            wo_state = await odoo.get_workorder_state(wo_id)
            logger.info(f"MQTT pause: WO {wo_id} estado atual = {wo_state}")

            # Toggle: pausado → retoma; em progresso → pausa
            paused_states = {"pending", "pause", "blocked"}
            is_paused = wo_state in paused_states

            if is_paused:
                # Retomar produção
                result = await odoo.resume_workorder(wo_id)
                action = "resumed"
                logger.info(f"MQTT pause: WO {wo_id} retomada — {result}")
            else:
                # Pausar produção
                result = await odoo.pause_workorder(wo_id)
                action = "paused"
                logger.info(f"MQTT pause: WO {wo_id} pausada — {result}")

        finally:
            await odoo.close()

    except Exception as e:
        logger.error(f"MQTT pause: erro ao interagir com Odoo — {e}")
        action = "error"
        is_paused = False

    # Atualizar estado local e LEDs
    async with async_session_factory() as session:
        from app.models.andon import AndonCall, AndonStatus

        if action == "paused":
            # Resolver todos os chamados ativos do workcenter
            stmt_calls = select(AndonCall).where(
                AndonCall.workcenter_id == wc_id,
                AndonCall.status != "RESOLVED"
            )
            result_calls = await session.execute(stmt_calls)
            active_calls = result_calls.scalars().all()
            for call in active_calls:
                call.status = "RESOLVED"
                call.resolved_note = f"Produção pausada via botão físico ESP32 ({device.device_name})"
                call.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                session.add(call)

            # Atualizar AndonStatus para "cinza" (pausa — timer para no frontend)
            stmt_status = select(AndonStatus).where(AndonStatus.workcenter_odoo_id == wc_id)
            res_status = await session.execute(stmt_status)
            andon_status = res_status.scalars().first()
            if andon_status:
                andon_status.status = "cinza"
                andon_status.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                andon_status.updated_by = f"ESP32 {device.device_name}"
                session.add(andon_status)
            else:
                session.add(AndonStatus(
                    workcenter_odoo_id=wc_id,
                    workcenter_name=f"Mesa {wc_id}",
                    status="cinza",
                    updated_by=f"ESP32 {device.device_name}",
                ))

            await session.commit()

            # Apagar todos os LEDs
            await _send_led_command(mac, red=False, yellow=False, green=False)

            await ws_manager.broadcast("production_paused", {
                "workcenter_id": wc_id,
                "device_mac": mac,
                "wo_id": wo_id,
            })
            logger.info(f"MQTT pause: workcenter {wc_id} pausado — status → cinza")

        elif action == "resumed":
            # Limpar status forçado de cinza para deixar o endpoint recalcular
            stmt_status = select(AndonStatus).where(AndonStatus.workcenter_odoo_id == wc_id)
            res_status = await session.execute(stmt_status)
            andon_status = res_status.scalars().first()
            if andon_status and andon_status.status == "cinza":
                andon_status.status = "verde"
                andon_status.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                andon_status.updated_by = f"ESP32 {device.device_name}"
                session.add(andon_status)
                await session.commit()

            # Restaurar LED verde (produção normal)
            await _send_led_command(mac, red=False, yellow=False, green=True)

            await ws_manager.broadcast("production_resumed", {
                "workcenter_id": wc_id,
                "device_mac": mac,
                "wo_id": wo_id,
            })
            logger.info(f"MQTT pause: workcenter {wc_id} retomado — status → verde")


async def _send_led_command(mac: str, red: bool, yellow: bool, green: bool):
    """
    Publica comando de LED para o ESP32 via MQTT.
    Usa uma conexão MQTT temporária para publicar o comando.
    """
    try:
        import aiomqtt
        from app.core.config import settings

        host = getattr(settings, "MQTT_BROKER_HOST", "localhost")
        port = int(getattr(settings, "MQTT_BROKER_PORT", 1883))
        topic = f"andon/led/{mac}/command"
        payload = json.dumps({"red": red, "yellow": yellow, "green": green})

        async with aiomqtt.Client(hostname=host, port=port) as client:
            await client.publish(topic, payload, qos=1)
            logger.info(f"MQTT LED: comando enviado para {mac} — red={red} yellow={yellow} green={green}")
    except Exception as e:
        logger.error(f"MQTT LED: erro ao enviar comando para {mac} — {e}")
    """
    Responde a solicitações de estado do Andon enviadas pelo ESP32.
    """
    async with async_session_factory() as session:
        # Verificar se dispositivo existe e está vinculado
        stmt = select(ESPDevice).where(ESPDevice.mac_address == mac)
        result = await session.execute(stmt)
        device = result.scalars().first()
        
        if not device or not device.workcenter_id:
            logger.warning(f"MQTT state request: dispositivo {mac} não encontrado ou não vinculado")
            # Enviar estado padrão GREEN
            await _send_andon_state_via_client(mac, "GREEN", client)
            return
        
        # Buscar chamados ativos para o workcenter
        from app.models.andon import AndonCall
        stmt_calls = select(AndonCall).where(
            AndonCall.workcenter_id == device.workcenter_id,
            AndonCall.status != "RESOLVED"
        ).order_by(AndonCall.created_at.desc())
        
        result_calls = await session.execute(stmt_calls)
        active_calls = result_calls.scalars().all()
        
        # Determinar estado atual (prioridade: RED > YELLOW > GREEN)
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
    """
    Envia o estado atual do Andon para o ESP32 (requer client MQTT ativo).
    Esta função é chamada quando o estado muda.
    """
    # Esta função será chamada de dentro do loop MQTT onde temos acesso ao client
    # Por enquanto, apenas logamos - a implementação completa requer refatoração
    logger.info(f"MQTT: Estado {state} deve ser enviado para {mac}")


async def _send_andon_state_via_client(mac: str, state: str, client):
    """
    Envia o estado atual do Andon para o ESP32 usando o client MQTT fornecido.
    """
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
                logger.info("MQTT: escutando tópicos andon/discovery, andon/status/#, andon/logs/#, andon/button/#, andon/state/request/#")

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
                        # Formato: andon/button/{mac}/{color}
                        parts = topic.split("/")
                        if len(parts) >= 4:
                            mac = parts[2]
                            color = parts[3]
                            if color == "pause":
                                await _handle_pause(mac, payload)
                            else:
                                await _handle_button(mac, color, payload)
                    elif topic.startswith("andon/state/request/"):
                        # Formato: andon/state/request/{mac}
                        mac = topic.split("/", 3)[3]
                        await _handle_state_request(mac, client)

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
