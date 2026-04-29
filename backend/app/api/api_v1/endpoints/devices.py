"""
Endpoints de gestão de dispositivos ESP32.

Fase 2 — Gestão de Devices: response enriquecida, edição por UUID,
logs filtráveis por level, sync, delete, firmware versions e OTA individual/lote.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict
from sqlmodel import select, func, delete
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_session, require_current_user
from app.models.esp_device import ESPDevice, ESPDeviceLog, DeviceStatus, EventType, LogLevel
from app.models.firmware_version import FirmwareVersion
from app.models.user import User
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Helpers ──────────────────────────────────────────────────────────────────

def _calc_rssi_quality(rssi: Optional[int]) -> Optional[str]:
    if rssi is None:
        return None
    if rssi > -60:
        return "Ótimo"
    if rssi > -70:
        return "Bom"
    if rssi > -80:
        return "Fraco"
    return "Crítico"


def _calc_offline_minutes(status: DeviceStatus, last_seen_at: Optional[datetime]) -> Optional[int]:
    if status != DeviceStatus.offline or last_seen_at is None:
        return None
    delta = datetime.now(timezone.utc).replace(tzinfo=None) - last_seen_at
    return int(delta.total_seconds() / 60)


async def _get_latest_stable_firmware(session: AsyncSession) -> Optional[str]:
    stmt = (
        select(FirmwareVersion)
        .where(FirmwareVersion.is_stable == True)  # noqa: E712
        .order_by(FirmwareVersion.created_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    fw = result.scalars().first()
    return fw.version if fw else None


async def _get_device_by_id(session: AsyncSession, device_id: uuid.UUID) -> ESPDevice:
    stmt = select(ESPDevice).where(ESPDevice.id == device_id)
    result = await session.execute(stmt)
    device = result.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")
    return device


async def _publish_mqtt(topic: str, payload: str) -> None:
    """Publica mensagem MQTT de forma assíncrona, sem bloquear em caso de falha."""
    try:
        import aiomqtt
        from app.core.config import settings
        host = getattr(settings, "MQTT_BROKER_HOST", "localhost")
        port = int(getattr(settings, "MQTT_BROKER_PORT", 1883))
        async with aiomqtt.Client(hostname=host, port=port) as client:
            await client.publish(topic, payload, qos=1)
    except Exception as e:
        logger.error(f"MQTT publish falhou [{topic}]: {e}")
        raise


# ── Schemas ───────────────────────────────────────────────────────────────────

class DeviceEnrichedOut(BaseModel):
    id: uuid.UUID
    mac_address: str
    device_name: str
    location: str
    workcenter_id: Optional[int]
    workcenter_name: Optional[str]
    status: str
    firmware_version: Optional[str]
    latest_firmware: Optional[str]
    firmware_outdated: bool
    rssi: Optional[int]
    rssi_quality: Optional[str]
    is_root: bool
    mesh_node_count: Optional[int]
    ip_address: Optional[str]
    uptime_seconds: Optional[int]
    last_seen_at: Optional[datetime]
    offline_minutes: Optional[int]
    notes: Optional[str]
    connection_type: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DeviceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device_name: Optional[str] = None
    location: Optional[str] = None
    workcenter_id: Optional[int] = None
    notes: Optional[str] = None


class DeviceLogOut(BaseModel):
    id: uuid.UUID
    level: str
    message: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FirmwareVersionOut(BaseModel):
    id: int
    version: str
    release_notes: Optional[str]
    file_path: str
    file_size_bytes: int
    is_stable: bool
    created_at: datetime
    created_by: str

    model_config = ConfigDict(from_attributes=True)


class OTATriggerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    firmware_version_id: int
    triggered_by: str


class OTABatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    firmware_version_id: int
    triggered_by: str
    device_ids: Optional[List[uuid.UUID]] = None


# ── WebSocket ─────────────────────────────────────────────────────────────────

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket para eventos em tempo real de dispositivos IoT."""
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


# ── GET /devices ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[DeviceEnrichedOut])
async def list_devices(session: AsyncSession = Depends(get_session)):
    """Lista todos os dispositivos com informações completas e campos calculados."""
    result = await session.execute(select(ESPDevice).order_by(ESPDevice.created_at.desc()))
    devices = result.scalars().all()

    latest_fw = await _get_latest_stable_firmware(session)

    # Buscar nomes de workcenters em lote via Odoo (best-effort)
    wc_names: dict[int, str] = {}
    wc_ids = {d.workcenter_id for d in devices if d.workcenter_id is not None}
    if wc_ids:
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
                wcs = await odoo.search_read(
                    "mrp.workcenter",
                    [["id", "in", list(wc_ids)]],
                    ["id", "name"],
                )
                wc_names = {wc["id"]: wc["name"] for wc in wcs}
            finally:
                await odoo.close()
        except Exception as e:
            logger.warning(f"GET /devices: falha ao buscar nomes de workcenters no Odoo — {e}")

    out = []
    for d in devices:
        fw_outdated = bool(
            d.firmware_version and latest_fw and d.firmware_version != latest_fw
        )
        out.append(DeviceEnrichedOut(
            id=d.id,
            mac_address=d.mac_address,
            device_name=d.device_name,
            location=d.location,
            workcenter_id=d.workcenter_id,
            workcenter_name=wc_names.get(d.workcenter_id) if d.workcenter_id else None,
            status=d.status.value,
            firmware_version=d.firmware_version,
            latest_firmware=latest_fw,
            firmware_outdated=fw_outdated,
            rssi=d.rssi,
            rssi_quality=_calc_rssi_quality(d.rssi),
            is_root=d.is_root,
            mesh_node_count=d.mesh_node_count,
            ip_address=d.ip_address,
            uptime_seconds=d.uptime_seconds,
            last_seen_at=d.last_seen_at,
            offline_minutes=_calc_offline_minutes(d.status, d.last_seen_at),
            notes=d.notes,
            connection_type=d.connection_type,
            created_at=d.created_at,
        ))
    return out


# ── PATCH /devices/{device_id} ────────────────────────────────────────────────

@router.patch("/{device_id}", response_model=DeviceEnrichedOut)
async def update_device(
    device_id: uuid.UUID,
    req: DeviceUpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user),
):
    """Edição manual de nome, localização, mesa vinculada e observações."""
    device = await _get_device_by_id(session, device_id)

    old_wc = device.workcenter_id
    wc_changed = req.workcenter_id is not None and req.workcenter_id != old_wc

    if req.device_name is not None:
        device.device_name = req.device_name
    if req.location is not None:
        device.location = req.location
    if req.workcenter_id is not None:
        device.workcenter_id = req.workcenter_id
    if req.notes is not None:
        device.notes = req.notes

    if wc_changed:
        log_msg = (
            f"Vínculo alterado de workcenter {old_wc} para {req.workcenter_id} "
            f"por {current_user.username}"
        )
        log = ESPDeviceLog(
            device_id=device.id,
            event_type=EventType.binding,
            level=LogLevel.INFO,
            message=log_msg,
        )
        session.add(log)

    await session.commit()
    await session.refresh(device)

    # Efeitos colaterais MQTT (best-effort, não bloqueia a resposta)
    if wc_changed:
        try:
            if old_wc is not None:
                await _publish_mqtt(f"andon/state/{device.mac_address}", "UNASSIGNED")
            if req.workcenter_id is not None:
                await _publish_mqtt(f"andon/state/request/{device.mac_address}", "")
        except Exception as e:
            logger.warning(f"PATCH /devices/{device_id}: efeito colateral MQTT falhou — {e}")

    latest_fw = await _get_latest_stable_firmware(session)
    fw_outdated = bool(device.firmware_version and latest_fw and device.firmware_version != latest_fw)

    return DeviceEnrichedOut(
        id=device.id,
        mac_address=device.mac_address,
        device_name=device.device_name,
        location=device.location,
        workcenter_id=device.workcenter_id,
        workcenter_name=None,  # Omitido para simplificar resposta de PATCH
        status=device.status.value,
        firmware_version=device.firmware_version,
        latest_firmware=latest_fw,
        firmware_outdated=fw_outdated,
        rssi=device.rssi,
        rssi_quality=_calc_rssi_quality(device.rssi),
        is_root=device.is_root,
        mesh_node_count=device.mesh_node_count,
        ip_address=device.ip_address,
        uptime_seconds=device.uptime_seconds,
        last_seen_at=device.last_seen_at,
        offline_minutes=_calc_offline_minutes(device.status, device.last_seen_at),
        notes=device.notes,
        connection_type=device.connection_type,
        created_at=device.created_at,
    )


# ── GET /devices/{device_id}/logs ─────────────────────────────────────────────

@router.get("/{device_id}/logs", response_model=List[DeviceLogOut])
async def get_device_logs(
    device_id: uuid.UUID,
    level: Optional[str] = Query(default=None, description="Filtrar por nível: INFO, WARN, ERROR"),
    limit: int = Query(default=100, ge=1, le=500, description="Máximo de registros (padrão 100, máximo 500)"),
    session: AsyncSession = Depends(get_session),
):
    """Retorna logs de diagnóstico do device, filtráveis por nível de severidade."""
    await _get_device_by_id(session, device_id)

    stmt = select(ESPDeviceLog).where(ESPDeviceLog.device_id == device_id)

    if level:
        try:
            level_enum = LogLevel(level.upper())
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Nível inválido: {level}. Use INFO, WARN ou ERROR.")
        stmt = stmt.where(ESPDeviceLog.level == level_enum)

    stmt = stmt.order_by(ESPDeviceLog.created_at.desc()).limit(limit)
    result = await session.execute(stmt)
    logs = result.scalars().all()

    return [
        DeviceLogOut(id=log.id, level=log.level.value, message=log.message, created_at=log.created_at)
        for log in logs
    ]


# ── POST /devices/{device_id}/sync ────────────────────────────────────────────

@router.post("/{device_id}/sync")
async def sync_device(
    device_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user),
):
    """Força sincronização de estado — publica andon/state/request/{mac}."""
    device = await _get_device_by_id(session, device_id)
    try:
        await _publish_mqtt(f"andon/state/request/{device.mac_address}", "")
    except Exception:
        raise HTTPException(status_code=503, detail="Falha ao publicar comando MQTT.")
    return {"message": "Sync solicitado"}


# ── DELETE /devices/{device_id} ───────────────────────────────────────────────

@router.delete("/{device_id}", status_code=204)
async def delete_device(
    device_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user),
):
    """Remove device. Só permitido se estiver offline."""
    device = await _get_device_by_id(session, device_id)

    if device.status == DeviceStatus.online:
        raise HTTPException(
            status_code=409,
            detail="Não é possível remover um dispositivo online. Aguarde o dispositivo ficar offline.",
        )

    mac = device.mac_address
    dev_id_str = str(device.id)

    # Deletar registros dependentes em cascata (ordem importa por FK constraints)
    # 1. Logs de diagnóstico do device
    await session.execute(delete(ESPDeviceLog).where(ESPDeviceLog.device_id == device.id))
    # 2. Logs de OTA do device (FK para esp_devices.id)
    from app.models.ota import OTAUpdateLog
    await session.execute(delete(OTAUpdateLog).where(OTAUpdateLog.device_id == device.id))
    # 3. Deletar o device
    await session.delete(device)
    await session.commit()

    await ws_manager.broadcast("device_removed", {"device_id": dev_id_str, "mac_address": mac})
    return None


# ── GET /devices/firmware/versions ────────────────────────────────────────────

@router.get("/firmware/versions", response_model=List[FirmwareVersionOut])
async def list_firmware_versions(session: AsyncSession = Depends(get_session)):
    """Lista versões de firmware cadastradas, ordenadas pela mais recente."""
    result = await session.execute(
        select(FirmwareVersion).order_by(FirmwareVersion.created_at.desc())
    )
    return result.scalars().all()


# ── POST /devices/firmware/versions ───────────────────────────────────────────

@router.post("/firmware/versions", response_model=FirmwareVersionOut, status_code=201)
async def create_firmware_version(
    version: str = Form(...),
    is_stable: bool = Form(...),
    release_notes: Optional[str] = Form(default=None),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user),
):
    """Cadastra nova versão de firmware via upload de arquivo .bin."""
    if not file.filename or not file.filename.endswith(".bin"):
        raise HTTPException(status_code=422, detail="Apenas arquivos .bin são aceitos.")

    # Verificar unicidade da versão
    existing = (await session.execute(
        select(FirmwareVersion).where(FirmwareVersion.version == version)
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Versão {version} já cadastrada.")

    # Salvar arquivo
    from pathlib import Path
    from app.core.config import settings
    storage_dir = Path(getattr(settings, "OTA_STORAGE_PATH", "storage/ota/firmware"))
    storage_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = f"firmware_v{version}.bin"
    file_path = storage_dir / safe_filename

    content = await file.read()
    file_path.write_bytes(content)

    fw = FirmwareVersion(
        version=version,
        release_notes=release_notes,
        file_path=str(file_path),
        file_size_bytes=len(content),
        is_stable=is_stable,
        created_by=current_user.username,
    )
    session.add(fw)
    await session.commit()
    await session.refresh(fw)
    logger.info(f"FirmwareVersion {version} cadastrada por {current_user.username}")
    return fw


# ── POST /devices/{device_id}/ota ─────────────────────────────────────────────

@router.post("/{device_id}/ota", status_code=202)
async def trigger_ota_for_device(
    device_id: uuid.UUID,
    req: OTATriggerRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user),
):
    """Dispara OTA para um device específico."""
    import json as _json
    from pathlib import Path
    from app.core.config import settings

    device = await _get_device_by_id(session, device_id)

    if device.status == DeviceStatus.offline:
        raise HTTPException(status_code=409, detail="Dispositivo offline. OTA requer dispositivo online.")

    fw = (await session.execute(
        select(FirmwareVersion).where(FirmwareVersion.id == req.firmware_version_id)
    )).scalars().first()
    if not fw:
        raise HTTPException(status_code=422, detail="Versão de firmware não encontrada.")
    if not Path(fw.file_path).exists():
        raise HTTPException(status_code=422, detail="Arquivo de firmware não encontrado no servidor.")

    base_url = getattr(settings, "API_BASE_URL", "http://localhost:8000")
    bin_url = f"{base_url}/static/ota/{Path(fw.file_path).name}"

    payload = _json.dumps({
        "version": fw.version,
        "url": bin_url,
        "size": fw.file_size_bytes,
        "target_mac": device.mac_address,
    })

    try:
        await _publish_mqtt("andon/ota/trigger", payload)
    except Exception:
        raise HTTPException(status_code=503, detail="Falha ao publicar comando OTA via MQTT.")

    logger.info(f"OTA: Disparado para device {device.mac_address} versão {fw.version} por {req.triggered_by}")
    return {"message": f"OTA disparado para {device.device_name}", "target_version": fw.version}


# ── POST /devices/ota/batch ───────────────────────────────────────────────────

@router.post("/ota/batch", status_code=202)
async def trigger_ota_batch(
    req: OTABatchRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user),
):
    """Dispara OTA em lote para devices desatualizados ou lista específica."""
    import json as _json
    from pathlib import Path
    from app.core.config import settings

    fw = (await session.execute(
        select(FirmwareVersion).where(FirmwareVersion.id == req.firmware_version_id)
    )).scalars().first()
    if not fw:
        raise HTTPException(status_code=404, detail="Versão de firmware não encontrada.")

    base_url = getattr(settings, "API_BASE_URL", "http://localhost:8000")
    bin_url = f"{base_url}/static/ota/{Path(fw.file_path).name}"

    # Determinar devices elegíveis
    if req.device_ids:
        stmt = select(ESPDevice).where(
            ESPDevice.id.in_(req.device_ids),
            ESPDevice.status == DeviceStatus.online,
        )
    else:
        # Todos os devices online com firmware desatualizado
        stmt = select(ESPDevice).where(
            ESPDevice.status == DeviceStatus.online,
            ESPDevice.firmware_version != fw.version,
            ESPDevice.firmware_version.isnot(None),
        )

    result = await session.execute(stmt)
    devices = result.scalars().all()

    if not devices:
        return {"message": "Nenhum dispositivo elegível para atualização", "device_count": 0}

    dispatched = 0
    for device in devices:
        payload = _json.dumps({
            "version": fw.version,
            "url": bin_url,
            "size": fw.file_size_bytes,
            "target_mac": device.mac_address,
        })
        try:
            await _publish_mqtt("andon/ota/trigger", payload)
            dispatched += 1
        except Exception as e:
            logger.error(f"OTA batch: falha ao disparar para {device.mac_address} — {e}")

    logger.info(f"OTA batch: {dispatched} devices disparados para versão {fw.version} por {req.triggered_by}")
    return {
        "message": "OTA em lote disparado",
        "device_count": dispatched,
        "target_version": fw.version,
    }


# ── POST /devices/{device_id}/identify ───────────────────────────────────────

@router.post("/{device_id}/identify", status_code=202)
async def identify_device(
    device_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user),
):
    """Dispara o evento de identificação visual no painel (pisca verde por 5s).
    Útil para identificar um device sem precisar acionar o botão físico."""
    device = await _get_device_by_id(session, device_id)

    await ws_manager.broadcast("device_identify", {
        "mac_address": device.mac_address,
        "device_id": str(device.id),
        "device_name": device.device_name,
    })
    logger.info(f"IDENTIFY: broadcast manual para {device.mac_address} por {current_user.username}")
    return {"message": f"Identificação disparada para {device.device_name}"}

@router.post("/{device_id}/restart", status_code=202)
async def restart_device(
    device_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user),
):
    """Envia comando de restart remoto para o ESP32 via MQTT (andon/restart/{mac})."""
    device = await _get_device_by_id(session, device_id)

    if device.status == DeviceStatus.offline:
        raise HTTPException(
            status_code=409,
            detail="Dispositivo offline. Não é possível enviar comando de restart.",
        )

    try:
        await _publish_mqtt(f"andon/restart/{device.mac_address}", "RESTART")
    except Exception:
        raise HTTPException(status_code=503, detail="Falha ao publicar comando MQTT.")

    # Registrar log do evento
    log = ESPDeviceLog(
        device_id=device.id,
        event_type=EventType.status_change,
        level=LogLevel.WARN,
        message=f"Restart remoto solicitado por {current_user.username}",
    )
    session.add(log)
    await session.commit()

    logger.info(f"RESTART: Comando enviado para {device.mac_address} por {current_user.username}")
    return {"message": f"Restart solicitado para {device.device_name}"}
