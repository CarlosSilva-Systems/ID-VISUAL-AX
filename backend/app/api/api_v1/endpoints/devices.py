import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_session
from app.models.esp_device import ESPDevice, ESPDeviceLog, EventType
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Schemas ---

class BindRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workcenter_id: int


class DeviceOut(BaseModel):
    id: uuid.UUID
    mac_address: str
    device_name: str
    location: str
    workcenter_id: Optional[int]
    status: str
    last_seen_at: Optional[datetime]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DeviceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device_name: Optional[str] = None
    location: Optional[str] = None


class DeviceLogOut(BaseModel):
    id: uuid.UUID
    device_id: uuid.UUID
    event_type: str
    message: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedLogs(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[DeviceLogOut]


# --- Endpoints ---

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Endpoint WebSocket para eventos em tempo real de dispositivos IoT."""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Mantém a conexão viva aguardando mensagens do cliente
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@router.get("", response_model=List[DeviceOut])
async def list_devices(session: AsyncSession = Depends(get_session)):
    """Lista todos os dispositivos ESP32 cadastrados."""
    result = await session.execute(select(ESPDevice).order_by(ESPDevice.created_at.desc()))
    return result.scalars().all()


@router.get("/{mac_address}/logs", response_model=PaginatedLogs)
async def get_device_logs(
    mac_address: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    event_type: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    """Retorna histórico paginado de logs de um dispositivo."""
    # Verificar se dispositivo existe
    stmt = select(ESPDevice).where(ESPDevice.mac_address == mac_address)
    result = await session.execute(stmt)
    device = result.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Dispositivo '{mac_address}' não encontrado.")

    # Query base
    stmt_logs = select(ESPDeviceLog).where(ESPDeviceLog.device_id == device.id)
    if event_type:
        try:
            et = EventType(event_type)
            stmt_logs = stmt_logs.where(ESPDeviceLog.event_type == et)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"event_type inválido: {event_type}")

    # Total
    from sqlmodel import func
    count_stmt = select(func.count()).select_from(ESPDeviceLog).where(ESPDeviceLog.device_id == device.id)
    if event_type:
        count_stmt = count_stmt.where(ESPDeviceLog.event_type == EventType(event_type))
    total = (await session.execute(count_stmt)).scalar_one()

    # Paginação
    offset = (page - 1) * page_size
    stmt_logs = stmt_logs.order_by(ESPDeviceLog.created_at.desc()).offset(offset).limit(page_size)
    items = (await session.execute(stmt_logs)).scalars().all()

    return PaginatedLogs(total=total, page=page, page_size=page_size, items=items)


@router.post("/{mac_address}/bind", response_model=DeviceOut)
async def bind_device(
    mac_address: str,
    req: BindRequest,
    session: AsyncSession = Depends(get_session),
):
    """Vincula um dispositivo ESP32 a uma mesa (workcenter_id)."""
    stmt = select(ESPDevice).where(ESPDevice.mac_address == mac_address)
    result = await session.execute(stmt)
    device = result.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Dispositivo '{mac_address}' não encontrado.")

    device.workcenter_id = req.workcenter_id
    log = ESPDeviceLog(
        device_id=device.id,
        event_type=EventType.binding,
        message=f"Vinculado à mesa workcenter_id={req.workcenter_id}",
    )
    session.add(log)
    await session.commit()
    await session.refresh(device)

    await ws_manager.broadcast("device_bound", {
        "mac_address": mac_address,
        "workcenter_id": req.workcenter_id,
    })
    return device


@router.delete("/{mac_address}/bind", response_model=DeviceOut)async def unbind_device(
    mac_address: str,
    session: AsyncSession = Depends(get_session),
):
    """Desvincula um dispositivo ESP32 da mesa atual."""
    stmt = select(ESPDevice).where(ESPDevice.mac_address == mac_address)
    result = await session.execute(stmt)
    device = result.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Dispositivo '{mac_address}' não encontrado.")

    old_wc = device.workcenter_id
    device.workcenter_id = None
    log = ESPDeviceLog(
        device_id=device.id,
        event_type=EventType.binding,
        message=f"Desvinculado da mesa workcenter_id={old_wc}",
    )
    session.add(log)
    await session.commit()
    await session.refresh(device)

    await ws_manager.broadcast("device_unbound", {"mac_address": mac_address})
    return device
