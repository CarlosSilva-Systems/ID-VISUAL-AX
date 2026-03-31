import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from sqlmodel import Field, SQLModel


class DeviceStatus(str, Enum):
    online = "online"
    offline = "offline"


class EventType(str, Enum):
    error = "error"
    status_change = "status_change"
    discovery = "discovery"
    binding = "binding"


class ESPDevice(SQLModel, table=True):
    __tablename__ = "esp_devices"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    mac_address: str = Field(unique=True, index=True, nullable=False)
    device_name: str = Field(default="")
    workcenter_id: Optional[int] = Field(default=None, nullable=True)
    status: DeviceStatus = Field(default=DeviceStatus.offline)
    last_seen_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class ESPDeviceLog(SQLModel, table=True):
    __tablename__ = "esp_device_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    device_id: uuid.UUID = Field(foreign_key="esp_devices.id", index=True, nullable=False)
    event_type: EventType = Field(nullable=False)
    message: str = Field(default="")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
