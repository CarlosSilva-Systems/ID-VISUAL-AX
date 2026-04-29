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
from app.models.esp_device import ESPDevice, ESPDeviceLog, DeviceStatus, EventType, LogLevel
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


async def _add_log(session: AsyncSession, device_id, event_type: EventType, message: str, level: LogLevel | None = None):
    """Insere log e aplica retenção de 500 registros por device."""
    if level is None:
        level = _infer_log_level(message)
    log = ESPDeviceLog(device_id=device_id, event_type=event_type, level=level, message=message)
    session.add(log)
    # Retenção: manter apenas os últimos 500 logs por device
    await _enforce_log_retention(session, device_id)


def _infer_log_level(message: str) -> LogLevel:
    """Infere o nível de severidade a partir do conteúdo da mensagem."""
    lower = message.lower()
    if any(kw in lower for kw in ("error", "erro", "fail", "falha", "critical", "crash", "exception", "panic", "abort", "stack overflow", "watchdog", "wdt")):
        return LogLevel.ERROR
    if any(kw in lower for kw in ("warn", "aviso", "atenção", "atencao", "timeout", "heap baixo", "heap low", "retry", "tentativa", "reconect", "lost", "perdido", "perdeu", "queda", "fallback", "offline")):
        return LogLevel.WARN
    return LogLevel.INFO


def _enrich_log_message(message: str) -> tuple[str, LogLevel]:
    """
    Enriquece a mensagem de log com contexto adicional e infere o nível.
    Mapeia padrões conhecidos do firmware ESP32 para mensagens mais descritivas.
    """
    lower = message.lower()
    level = _infer_log_level(message)

    # Mapeamento de padrões do firmware para mensagens enriquecidas
    enrichments = [
        # WiFi
        ("wifi: conectado", "🟢 WiFi conectado", LogLevel.INFO),
        ("wifi: timeout", "🔴 WiFi timeout — sem conexão com o AP", LogLevel.WARN),
        ("wifi perdido", "🔴 WiFi perdido — iniciando fallback para mesh", LogLevel.WARN),
        ("wifi restaurado", "🟢 WiFi restaurado dentro da janela de fallback", LogLevel.INFO),
        ("wifi: conectando", "🔄 WiFi conectando ao AP...", LogLevel.INFO),
        # MQTT
        ("mqtt: conectado", "🟢 MQTT conectado ao broker", LogLevel.INFO),
        ("mqtt: falha", "🔴 MQTT falha de conexão", LogLevel.WARN),
        ("mqtt perdido", "🔴 MQTT desconectado — reconectando...", LogLevel.WARN),
        ("mqtt: max tentativas", "🔴 MQTT esgotou tentativas — reiniciando ESP32", LogLevel.ERROR),
        ("mqtt: conectando", "🔄 MQTT conectando ao broker...", LogLevel.INFO),
        # Mesh
        ("mesh: iniciada como raiz", "🌐 Mesh iniciada — este nó é a RAIZ (gateway)", LogLevel.INFO),
        ("mesh: iniciada como no-folha", "🌐 Mesh iniciada — este nó é FOLHA (sem WiFi)", LogLevel.INFO),
        ("mesh: novo nó", "🔗 Novo nó conectado à mesh", LogLevel.INFO),
        ("mesh: nó desconectado", "🔌 Nó desconectado da mesh", LogLevel.WARN),
        ("mesh: capacidade cheia", "⚠️ Mesh com capacidade máxima de filhos atingida", LogLevel.WARN),
        ("mesh: capacidade liberada", "✅ Mesh com capacidade liberada", LogLevel.INFO),
        ("mesh-node: tentando reconectar", "🔄 Nó folha tentando reconectar ao WiFi...", LogLevel.INFO),
        # Heap / Memória
        ("heap baixo", "⚠️ Memória heap baixa — risco de instabilidade", LogLevel.WARN),
        ("heap low", "⚠️ Memória heap baixa — risco de instabilidade", LogLevel.WARN),
        ("aviso: heap", "⚠️ Alerta de heap — verificar vazamento de memória", LogLevel.WARN),
        # Heartbeat
        ("heartbeat:", "💓 Heartbeat — dispositivo ativo", LogLevel.INFO),
        # Botões
        ("btn: gpio 12", "🟢 Botão VERDE pressionado", LogLevel.INFO),
        ("btn: gpio 13", "🟡 Botão AMARELO pressionado", LogLevel.INFO),
        ("btn: gpio 32", "🔴 Botão VERMELHO pressionado", LogLevel.INFO),
        ("btn: gpio 33", "⏸️ Botão PAUSE pressionado", LogLevel.INFO),
        # Reset
        ("reset: botao pause", "⚠️ Reset por botão físico (pause segurado 5s)", LogLevel.WARN),
        ("restart remoto", "⚠️ Restart remoto solicitado via backend", LogLevel.WARN),
        ("reiniciando", "🔄 ESP32 reiniciando...", LogLevel.WARN),
        # OTA
        ("ota:", "📦 Evento OTA", LogLevel.INFO),
        # Estado Andon
        ("andon state:", "📡 Estado Andon atualizado", LogLevel.INFO),
        ("andon state: unknown", "❓ Estado Andon desconhecido — aguardando sincronização", LogLevel.WARN),
        # Operational
        ("operational: wifi perdido", "🔴 WiFi perdido em modo operacional", LogLevel.WARN),
        ("operational: mqtt perdido", "🔴 MQTT perdido em modo operacional", LogLevel.WARN),
        ("operational: wifi restaurado", "🟢 WiFi restaurado em modo operacional", LogLevel.INFO),
        # Boot
        ("boot", "🚀 ESP32 inicializando (boot)", LogLevel.INFO),
    ]

    for pattern, enriched, enriched_level in enrichments:
        if pattern in lower:
            # Preserva a mensagem original entre parênteses para rastreabilidade
            return f"{enriched} | {message}", enriched_level

    return message, level


async def _enforce_log_retention(session: AsyncSession, device_id) -> None:
    """Remove logs mais antigos quando o total excede 500 por device."""
    from sqlmodel import func, delete
    count_stmt = select(func.count()).select_from(ESPDeviceLog).where(ESPDeviceLog.device_id == device_id)
    total = (await session.execute(count_stmt)).scalar_one()
    if total > 500:
        excess = total - 500
        # Buscar IDs dos mais antigos para deletar
        oldest_stmt = (
            select(ESPDeviceLog.id)
            .where(ESPDeviceLog.device_id == device_id)
            .order_by(ESPDeviceLog.created_at.asc())
            .limit(excess)
        )
        oldest_ids = (await session.execute(oldest_stmt)).scalars().all()
        if oldest_ids:
            del_stmt = delete(ESPDeviceLog).where(ESPDeviceLog.id.in_(oldest_ids))
            await session.execute(del_stmt)


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
        # Persistir campos de diagnóstico se presentes no payload
        if "firmware_version" in payload and payload["firmware_version"]:
            device.firmware_version = str(payload["firmware_version"])
        if "rssi" in payload and payload["rssi"] is not None:
            device.rssi = int(payload["rssi"])
        if "is_root" in payload:
            device.is_root = bool(payload["is_root"])
        if "mesh_node_count" in payload and payload["mesh_node_count"] is not None:
            device.mesh_node_count = int(payload["mesh_node_count"])
        if "ip_address" in payload and payload["ip_address"]:
            device.ip_address = str(payload["ip_address"])
        if "uptime_seconds" in payload and payload["uptime_seconds"] is not None:
            device.uptime_seconds = int(payload["uptime_seconds"])
        if "connection_type" in payload and payload["connection_type"]:
            device.connection_type = str(payload["connection_type"])
        conn_type = payload.get("connection_type", "wifi" if payload.get("is_root") else "mesh")
        conn_icon = "📶" if conn_type == "wifi" else "🕸️"
        await _add_log(session, device.id, EventType.discovery,
            f"🚀 {conn_icon} Dispositivo descoberto via {conn_type.upper()}: {name or mac} | fw={payload.get('firmware_version','?')} rssi={payload.get('rssi','?')}dBm ip={payload.get('ip_address','?')}",
            LogLevel.INFO)
        await session.commit()
        await session.refresh(device)

    await ws_manager.broadcast("device_discovery", {
        "mac_address": mac, "device_name": name, "status": "online",
    })
    logger.info(f"MQTT discovery: {mac} ({name})")


async def _handle_status(mac: str, payload_raw: bytes):
    try:
        raw = payload_raw.decode().strip()
        # Heartbeat pode vir como JSON com campos de diagnóstico
        if raw.startswith("{"):
            try:
                hb = json.loads(raw)
                status_str = hb.get("status", "").lower()
                rssi_val = hb.get("rssi")
                uptime_val = hb.get("uptime_seconds") or hb.get("uptime")
                heap_val = hb.get("heap")
                is_root_val = hb.get("is_root")
                mesh_nodes_val = hb.get("mesh_nodes")
            except Exception:
                status_str = raw.lower()
                rssi_val = None
                uptime_val = None
                heap_val = None
                is_root_val = None
                mesh_nodes_val = None
        else:
            status_str = raw.lower()
            rssi_val = None
            uptime_val = None
            heap_val = None
            is_root_val = None
            mesh_nodes_val = None

        if status_str == "heartbeat" or (raw.startswith("{") and not status_str):
            # Heartbeat de raiz ou folha (via mesh) — atualiza last_seen_at e diagnóstico
            async with async_session_factory() as session:
                stmt = select(ESPDevice).where(ESPDevice.mac_address == mac)
                result = await session.execute(stmt)
                device = result.scalars().first()
                if device:
                    device.last_seen_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    device.status = DeviceStatus.online  # Heartbeat = device online
                    if rssi_val is not None:
                        device.rssi = int(rssi_val)
                    if uptime_val is not None:
                        device.uptime_seconds = int(uptime_val)
                    if is_root_val is not None:
                        device.is_root = bool(is_root_val)
                    if mesh_nodes_val is not None:
                        device.mesh_node_count = int(mesh_nodes_val)
                    # Folha sem WiFi — heap baixo é sinal de alerta
                    if heap_val is not None and int(heap_val) < 10240:
                        await _add_log(
                            session, device.id, EventType.error,
                            f"⚠️ Heap baixo no heartbeat: {heap_val} bytes", LogLevel.WARN
                        )
                    await session.commit()
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
            await _add_log(session, device.id, EventType.status_change, f"{'🟢 Device voltou online' if status_str == 'online' else '🔴 Device ficou offline'} | status={status_str}", LogLevel.INFO if status_str == "online" else LogLevel.WARN)
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
        enriched_message, level = _enrich_log_message(message)
        await _add_log(session, device.id, EventType.error, enriched_message, level)
        await session.commit()

    await ws_manager.broadcast("device_log", {"mac_address": mac, "message": enriched_message, "level": level.value})


async def _handle_restart_ack(mac: str, payload_raw: bytes):
    """Registra confirmação de restart recebida do ESP32."""
    async with async_session_factory() as session:
        stmt = select(ESPDevice).where(ESPDevice.mac_address == mac)
        result = await session.execute(stmt)
        device = result.scalars().first()
        if not device:
            return
        await _add_log(
            session, device.id, EventType.status_change,
            "🔄 ESP32 confirmou restart — aguardando reconexão", LogLevel.WARN
        )
        await session.commit()

    await ws_manager.broadcast("device_restarting", {"mac_address": mac})
    logger.info(f"MQTT restart ack: {mac}")


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
            resolved_with_justification = []
            for call in active_calls:
                now = datetime.now(timezone.utc).replace(tzinfo=None)
                call.status = "RESOLVED"
                call.resolved_note = f"Resolvido via botão físico ESP32 ({device.device_name})"
                call.updated_at = now
                # Calcular downtime
                from app.services.justification_service import compute_downtime_minutes
                call.downtime_minutes = compute_downtime_minutes(call.created_at, now)
                session.add(call)
                if call.requires_justification:
                    resolved_with_justification.append(call)

            # Atualizar AndonStatus para verde
            from app.models.andon import AndonStatus
            stmt_status = select(AndonStatus).where(AndonStatus.workcenter_odoo_id == device.workcenter_id)
            res_status = await session.execute(stmt_status)
            andon_status = res_status.scalars().first()
            if andon_status:
                andon_status.status = "verde"
                andon_status.updated_by = f"ESP32 {device.device_name}"
            else:
                session.add(AndonStatus(
                    workcenter_odoo_id=device.workcenter_id,
                    workcenter_name=f"Mesa {device.workcenter_id}",
                    status="verde",
                    updated_by=f"ESP32 {device.device_name}",
                ))

            await session.commit()
            logger.info(f"MQTT button: {len(active_calls)} chamados resolvidos para workcenter {device.workcenter_id} via botão verde")
            # Notificar Andon TV — versão incrementada após commit
            from app.api.api_v1.endpoints.sync import update_sync_version
            update_sync_version("andon_version")
            await _send_andon_state(mac, "GREEN")
            await ws_manager.broadcast("andon_resolved", {
                "workcenter_id": device.workcenter_id, "device_mac": mac, "resolved_count": len(active_calls)
            })
            # Emitir WebSocket de justificativa para chamados que requerem
            for call in resolved_with_justification:
                await ws_manager.broadcast("andon_justification_required", {
                    "call_id": call.id,
                    "workcenter_name": call.workcenter_name,
                    "color": call.color,
                    "reason": call.reason,
                    "downtime_minutes": call.downtime_minutes,
                })
            return

        # Para amarelo/vermelho: resolve chamados anteriores antes de criar novo
        # Garante que o ESP32 é fonte de verdade — estado anterior é sempre descartado
        stmt_prev = select(AndonCall).where(
            AndonCall.workcenter_id == device.workcenter_id,
            AndonCall.status != "RESOLVED"
        )
        res_prev = await session.execute(stmt_prev)
        prev_calls = res_prev.scalars().all()
        for prev_call in prev_calls:
            prev_call.status = "RESOLVED"
            prev_call.resolved_note = f"Substituído por novo acionamento {button_config['call_color']} via ESP32 ({device.device_name})"
            prev_call.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.add(prev_call)

        call = AndonCall(
            color=button_config["call_color"],
            category=button_config["category"],
            reason=button_config["reason"],
            description=f"Acionado via botão físico ESP32 ({device.device_name})",
            workcenter_id=device.workcenter_id,
            workcenter_name=f"Mesa {device.workcenter_id}",
            status="OPEN",
            triggered_by=f"ESP32 {device.device_name}",
            is_stop=button_config["is_stop"],
            requires_justification=button_config["call_color"] in ("RED", "YELLOW"),
        )
        session.add(call)

        # Atualizar AndonStatus no banco para que pause/resume funcione corretamente
        from app.models.andon import AndonStatus
        stmt_status = select(AndonStatus).where(AndonStatus.workcenter_odoo_id == device.workcenter_id)
        res_status = await session.execute(stmt_status)
        andon_status = res_status.scalars().first()
        color_lower = button_config["call_color"].lower()  # "yellow" ou "red"
        if andon_status:
            andon_status.status = color_lower
            andon_status.updated_by = f"ESP32 {device.device_name}"
        else:
            session.add(AndonStatus(
                workcenter_odoo_id=device.workcenter_id,
                workcenter_name=f"Mesa {device.workcenter_id}",
                status=color_lower,
                updated_by=f"ESP32 {device.device_name}",
            ))

        await session.commit()
        await session.refresh(call)
        logger.info(f"MQTT button: chamado {button_config['call_color']} criado para workcenter {device.workcenter_id} via {mac}")
        # Notificar Andon TV — versão incrementada após commit
        from app.api.api_v1.endpoints.sync import update_sync_version
        update_sync_version("andon_version")
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
    odoo_ok = True
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
                    if not res_odoo.get("ok"):
                        odoo_ok = False
                else:
                    res_odoo = await odoo.resume_workorder(wo_id)
                    logger.info(f"MQTT pause: Odoo resume WO {wo_id} — {res_odoo}")
                    if not res_odoo.get("ok"):
                        odoo_ok = False
            else:
                logger.warning(f"MQTT pause: nenhuma WO ativa para workcenter {wc_id}, apenas atualizando status local.")
        finally:
            await odoo.close()
    except Exception as e:
        odoo_ok = False
        logger.error(f"[MQTT Pause] Falha na integração Odoo para workcenter {wc_id}: {e}")

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
            await _send_andon_state(mac, "GRAY")
            # Notificar Andon TV — versão incrementada após commit
            from app.api.api_v1.endpoints.sync import update_sync_version
            update_sync_version("andon_version")
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

            # Mapear status restaurado para MQTT (aceita português e inglês)
            status_map = {
                "verde": "GREEN",
                "green": "GREEN",
                "amarelo": "YELLOW",
                "amarelo_suave": "YELLOW",
                "yellow": "YELLOW",
                "vermelho": "RED",
                "red": "RED",
                "cinza": "GRAY",
                "gray": "GRAY"
            }
            mqtt_state = status_map.get(prev_status, "GREEN")
            
            # Enviar estado via MQTT para atualizar g_andonStatus no ESP32
            await _send_andon_state(mac, mqtt_state)
            
            # Notificar Andon TV — versão incrementada após commit
            from app.api.api_v1.endpoints.sync import update_sync_version
            update_sync_version("andon_version")
            await ws_manager.broadcast("production_resumed", {
                "workcenter_id": wc_id, "device_mac": mac,
                "wo_id": wo_id, "restored_status": prev_status,
            })
            logger.info(f"MQTT pause: workcenter {wc_id} RETOMADO — status restaurado: '{prev_status}' → MQTT: {mqtt_state}")

    # Notifica o ESP32 se a integração Odoo falhou
    if not odoo_ok:
        await notify_odoo_error(mac)


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
            # Sem log ativo — pode ser progresso de uma atualização iniciada antes
            # do backend reiniciar. Buscar o release mais recente para associar.
            from app.models.ota import FirmwareRelease
            stmt_release = select(FirmwareRelease).order_by(FirmwareRelease.uploaded_at.desc())
            latest_release = (await session.execute(stmt_release)).scalars().first()
            
            if not latest_release:
                logger.warning(f"MQTT OTA progress: nenhum firmware release encontrado para {mac}, descartando")
                return
            
            logger.info(f"MQTT OTA progress: criando novo log para {mac} associado ao release {latest_release.version}")
            ota_log = OTAUpdateLog(
                device_id=device.id,
                firmware_release_id=latest_release.id,
                status=OTAStatus[status] if status in OTAStatus.__members__ else OTAStatus.downloading,
                progress_percent=progress,
                error_message=error,
                target_version=latest_release.version
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
            logger.warning(f"MQTT state request: dispositivo {mac} não vinculado a nenhuma mesa")
            await _send_andon_state_via_client(mac, "UNASSIGNED", client)
            return

        wc_id = device.workcenter_id

        # 1. Verificar AndonStatus — pausa tem precedência absoluta
        from app.models.andon import AndonStatus, AndonCall
        stmt_status = select(AndonStatus).where(AndonStatus.workcenter_odoo_id == wc_id)
        res_status = await session.execute(stmt_status)
        andon_status = res_status.scalars().first()

        if andon_status and andon_status.status == "cinza":
            logger.info(f"MQTT state request: workcenter {wc_id} está pausado → enviando GRAY para {mac}")
            await _send_andon_state_via_client(mac, "GRAY", client)
            return

        # 2. Verificar chamados ativos
        stmt_calls = select(AndonCall).where(
            AndonCall.workcenter_id == wc_id,
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


async def notify_odoo_error(mac: str):
    """
    Notifica o ESP32 que a integração com o Odoo falhou.
    O firmware exibe um blink de erro nos LEDs para alertar o operador
    que o acionamento foi registrado localmente mas NÃO chegou ao Odoo.
    """
    try:
        import aiomqtt

        host = getattr(settings, "MQTT_BROKER_HOST", "localhost")
        port = int(getattr(settings, "MQTT_BROKER_PORT", 1883))
        topic = f"andon/odoo_error/{mac}"

        async with aiomqtt.Client(hostname=host, port=port) as client:
            await client.publish(topic, "ODOO_ERROR", qos=1)
            logger.warning(f"[Odoo Error] Notificação de falha Odoo enviada para ESP32 {mac}")
    except Exception as e:
        logger.error(f"[Odoo Error] Falha ao notificar ESP32 {mac} — {e}")


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
                await client.subscribe("andon/restart/ack/#")
                await client.subscribe("andon/identify/#")
                logger.info("MQTT: escutando tópicos andon/discovery, andon/status/#, andon/logs/#, andon/button/#, andon/state/request/#, andon/ota/progress/#, andon/ota/trigger, andon/restart/ack/#, andon/identify/#")

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
                    elif topic.startswith("andon/restart/ack/"):
                        mac = topic.split("/", 3)[3]
                        await _handle_restart_ack(mac, payload)
                    elif topic.startswith("andon/identify/"):
                        mac = topic.split("/", 2)[2]
                        await _handle_identify(mac)

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
