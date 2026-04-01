# Design Document: ESP32 OTA Management

## Overview

This design document specifies the complete architecture for the ESP32 OTA (Over-The-Air) Management system. The system enables centralized firmware update management for a fleet of ESP32 devices through a FastAPI backend, React frontend, and MQTT-based communication protocol.

### System Goals

- Provide centralized firmware version management with GitHub integration
- Enable mass OTA updates triggered from web interface
- Support manual firmware upload for offline scenarios
- Monitor real-time update progress via WebSocket
- Ensure resilient updates with automatic rollback on failure
- Support ESP-MESH propagation for cascading updates

### Key Components

1. **Backend Services**: FastAPI endpoints, MQTT handlers, GitHub integration, static file hosting
2. **Database Layer**: PostgreSQL tables for firmware releases and update logs
3. **MQTT Layer**: Topics for OTA trigger and progress reporting
4. **Frontend UI**: Settings tab with update management and real-time dashboard
5. **ESP32 Firmware**: OTA command processing, download, installation, and rollback logic

### Integration Points

- Extends existing `mqtt_service.py` with OTA-specific topics
- Reuses `websocket_manager.py` for real-time frontend updates
- Leverages `esp_devices` table from IoT Device Management feature
- Adds new Settings sub-tab to existing frontend Settings page

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐│
│  │  Settings    │  │ Upload Modal │  │  Progress Dashboard    ││
│  │  OTA Tab     │  │              │  │  (Real-time WebSocket) ││
│  └──────────────┘  └──────────────┘  └────────────────────────┘│
└────────────┬────────────────────────────────────┬────────────────┘
             │ REST API                            │ WebSocket
             │ (JWT Auth)                          │
┌────────────▼────────────────────────────────────▼────────────────┐
│                      Backend (FastAPI)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐│
│  │ OTA Endpoints│  │ GitHub Client│  │  Static File Server    ││
│  │ /api/v1/ota/ │  │              │  │  /static/ota/          ││
│  └──────┬───────┘  └──────┬───────┘  └────────────────────────┘│
│         │                  │                                      │
│  ┌──────▼──────────────────▼───────┐  ┌────────────────────────┐│
│  │   OTA Manager Service           │  │  MQTT Service          ││
│  │   (Business Logic)              │  │  (Pub/Sub Handler)     ││
│  └──────┬──────────────────────────┘  └──────┬─────────────────┘│
│         │                                     │                   │
│  ┌──────▼─────────────────────────────────────▼─────────────────┐│
│  │              PostgreSQL Database                              ││
│  │  ┌──────────────────┐  ┌──────────────────────────────────┐ ││
│  │  │ firmware_releases│  │ ota_update_logs                  │ ││
│  │  └──────────────────┘  └──────────────────────────────────┘ ││
│  └───────────────────────────────────────────────────────────────┘│
└────────────────────────────┬──────────────────────────────────────┘
                             │ MQTT (QoS 1)
                             │
┌────────────────────────────▼──────────────────────────────────────┐
│                      MQTT Broker                                   │
│  Topics:                                                           │
│    - andon/ota/trigger        (Backend → ESP32)                   │
│    - andon/ota/progress/{mac} (ESP32 → Backend)                   │
└────────────────────────────┬──────────────────────────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────────┐
│                    ESP32 Device Fleet                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Gateway Mesh │  │  Node Mesh   │  │  Node Mesh   │  ...      │
│  │ (Patient 0)  │  │              │  │              │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└───────────────────────────────────────────────────────────────────┘
```


### Service Layer Architecture

```
OTA Manager Service
├── GitHub Integration
│   ├── fetch_latest_release()
│   ├── fetch_release_by_tag()
│   └── download_firmware_stream()
├── Firmware Storage
│   ├── save_firmware_file()
│   ├── validate_firmware_file()
│   └── get_firmware_path()
├── OTA Orchestration
│   ├── trigger_mass_update()
│   ├── create_update_logs()
│   └── publish_mqtt_trigger()
└── Progress Tracking
    ├── handle_progress_message()
    ├── update_device_log()
    └── broadcast_websocket_event()
```

### Data Flow: OTA Update Lifecycle

1. **Firmware Acquisition**
   - User clicks "Check GitHub" → Backend calls GitHub API
   - Backend downloads .bin file → Saves to Docker volume
   - Creates `firmware_releases` record with metadata

2. **Update Trigger**
   - User clicks "Update All Devices" → Confirmation modal
   - Backend creates `ota_update_logs` for all devices
   - Backend publishes MQTT message to `andon/ota/trigger`

3. **Device Update**
   - ESP32 receives MQTT trigger → Validates version
   - ESP32 downloads .bin via HTTP → Reports progress via MQTT
   - ESP32 installs firmware → Reboots → Validates boot

4. **Progress Monitoring**
   - Backend receives MQTT progress → Updates database
   - Backend broadcasts WebSocket event → Frontend updates UI
   - Dashboard shows real-time progress bars per device

## Components and Interfaces

### Backend Components

#### 1. OTA Endpoints (`backend/app/api/api_v1/endpoints/ota.py`)

New router with the following endpoints:

```python
router = APIRouter(prefix="/ota", tags=["OTA Management"])

# Firmware Management
GET    /firmware/releases          # List all firmware versions
POST   /firmware/check-github      # Check for new GitHub release
POST   /firmware/download-github   # Download firmware from GitHub
POST   /firmware/upload            # Manual firmware upload
DELETE /firmware/{release_id}      # Delete firmware version

# OTA Operations
POST   /trigger                    # Trigger mass OTA update
GET    /status                     # Get current update status
GET    /history/{mac_address}      # Get device update history
POST   /cancel                     # Cancel ongoing update (future)
```

#### 2. OTA Service (`backend/app/services/ota_service.py`)

New service module containing business logic:

```python
class OTAService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.github_client = GitHubClient()
        self.storage_path = Path(settings.OTA_STORAGE_PATH)
    
    async def fetch_latest_github_release(self) -> dict
    async def download_firmware_from_github(self, release_info: dict) -> FirmwareRelease
    async def save_uploaded_firmware(self, file: UploadFile, version: str) -> FirmwareRelease
    async def trigger_ota_update(self, firmware_release_id: UUID) -> dict
    async def handle_progress_update(self, mac: str, payload: dict) -> None
    async def get_fleet_status(self) -> list[dict]
    async def get_device_history(self, mac: str) -> list[dict]
```

#### 3. GitHub Client (`backend/app/services/github_client.py`)

New module for GitHub API integration:

```python
class GitHubClient:
    def __init__(self):
        self.base_url = "https://api.github.com"
        self.owner = settings.GITHUB_REPO_OWNER
        self.repo = settings.GITHUB_REPO_NAME
        self.token = settings.GITHUB_TOKEN  # Optional
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def get_latest_release(self) -> dict
    async def get_release_by_tag(self, tag: str) -> dict
    async def download_asset(self, download_url: str, dest_path: Path) -> None
    async def close(self) -> None
```


#### 4. MQTT OTA Handler (extends `backend/app/services/mqtt_service.py`)

Add new handlers to existing MQTT service:

```python
# Add to _mqtt_loop() subscriptions:
await client.subscribe("andon/ota/progress/#")

# Add new handler function:
async def _handle_ota_progress(mac: str, payload_raw: bytes):
    """
    Process OTA progress messages from ESP32 devices.
    Updates ota_update_logs and broadcasts WebSocket events.
    """
    try:
        payload = json.loads(payload_raw.decode())
        status = payload.get("status")  # downloading, installing, success, failed
        progress = payload.get("progress", 0)  # 0-100
        error = payload.get("error")
        
        async with async_session_factory() as session:
            # Find device
            stmt = select(ESPDevice).where(ESPDevice.mac_address == mac)
            device = (await session.execute(stmt)).scalars().first()
            if not device:
                logger.warning(f"OTA progress: device {mac} not found")
                return
            
            # Find active OTA log
            stmt_log = select(OTAUpdateLog).where(
                OTAUpdateLog.device_id == device.id,
                OTAUpdateLog.status.in_(["downloading", "installing"])
            ).order_by(OTAUpdateLog.started_at.desc())
            ota_log = (await session.execute(stmt_log)).scalars().first()
            
            if not ota_log:
                # Create new log if none exists
                ota_log = OTAUpdateLog(
                    device_id=device.id,
                    status=status,
                    progress_percent=progress,
                    error_message=error
                )
                session.add(ota_log)
            else:
                # Update existing log
                ota_log.status = status
                ota_log.progress_percent = progress
                ota_log.error_message = error
                if status in ["success", "failed"]:
                    ota_log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            
            await session.commit()
            await session.refresh(ota_log)
        
        # Broadcast WebSocket event
        await ws_manager.broadcast("ota_progress", {
            "mac": mac,
            "device_id": str(device.id),
            "status": status,
            "progress": progress,
            "error": error
        })
        
        logger.info(f"OTA progress: {mac} - {status} - {progress}%")
    
    except Exception as e:
        logger.error(f"OTA progress handler error: {e}")
```

### Frontend Components

#### 1. OTA Settings Tab (`frontend/src/app/components/OTASettings.tsx`)

Main component for OTA management interface:

```typescript
interface OTASettingsProps {}

export function OTASettings() {
  const [releases, setReleases] = useState<FirmwareRelease[]>([]);
  const [fleetVersion, setFleetVersion] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<FirmwareRelease | null>(null);

  // Fetch releases on mount
  useEffect(() => {
    fetchReleases();
    fetchFleetStatus();
  }, []);

  const fetchReleases = async () => { /* ... */ };
  const checkGitHub = async () => { /* ... */ };
  const downloadFromGitHub = async (version: string) => { /* ... */ };
  const triggerUpdate = async (releaseId: string) => { /* ... */ };

  return (
    <Box>
      <Typography variant="h5">Atualizações de Firmware</Typography>
      
      {/* Fleet Status Card */}
      <Card>
        <CardContent>
          <Typography variant="h6">Versão Atual da Frota</Typography>
          <Typography variant="h4">{fleetVersion || "—"}</Typography>
        </CardContent>
      </Card>

      {/* Available Update Card */}
      {availableUpdate && (
        <Card>
          <CardContent>
            <Typography variant="h6">Nova Versão Disponível</Typography>
            <Typography variant="h4">{availableUpdate}</Typography>
            <Button onClick={() => downloadFromGitHub(availableUpdate)}>
              Baixar Versão {availableUpdate}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Box>
        <Button onClick={checkGitHub}>Verificar GitHub</Button>
        <Button onClick={() => setShowUploadModal(true)}>Upload Manual</Button>
      </Box>

      {/* Releases List */}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Versão</TableCell>
              <TableCell>Data</TableCell>
              <TableCell>Origem</TableCell>
              <TableCell>Tamanho</TableCell>
              <TableCell>Dispositivos</TableCell>
              <TableCell>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {releases.map(release => (
              <TableRow key={release.id}>
                <TableCell>{release.version}</TableCell>
                <TableCell>{formatDate(release.uploaded_at)}</TableCell>
                <TableCell>{release.source}</TableCell>
                <TableCell>{formatBytes(release.file_size)}</TableCell>
                <TableCell>{release.device_count}</TableCell>
                <TableCell>
                  <Button onClick={() => {
                    setSelectedRelease(release);
                    setShowConfirmModal(true);
                  }}>
                    Atualizar Todos
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Modals */}
      <UploadModal open={showUploadModal} onClose={() => setShowUploadModal(false)} />
      <ConfirmUpdateModal 
        open={showConfirmModal}
        release={selectedRelease}
        onConfirm={triggerUpdate}
        onClose={() => setShowConfirmModal(false)}
      />
    </Box>
  );
}
```


#### 2. Upload Modal (`frontend/src/app/components/OTAUploadModal.tsx`)

Modal for manual firmware upload:

```typescript
interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function OTAUploadModal({ open, onClose, onSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errors, setErrors] = useState<{ file?: string; version?: string }>({});

  const validateVersion = (v: string): boolean => {
    return /^\d+\.\d+\.\d+$/.test(v);
  };

  const validateFile = (f: File): boolean => {
    if (!f.name.endsWith('.bin')) return false;
    if (f.size < 100 * 1024 || f.size > 2 * 1024 * 1024) return false;
    return true;
  };

  const handleUpload = async () => {
    // Validation
    const newErrors: typeof errors = {};
    if (!file || !validateFile(file)) {
      newErrors.file = "Arquivo .bin inválido (100KB - 2MB)";
    }
    if (!validateVersion(version)) {
      newErrors.version = "Formato inválido (ex: 1.2.0)";
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Upload
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file!);
      formData.append('version', version);

      await api.uploadFirmware(formData, (progress) => {
        setUploadProgress(progress);
      });

      toast.success(`Firmware ${version} enviado com sucesso`);
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error("Erro ao enviar firmware");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Upload Manual de Firmware</DialogTitle>
      <DialogContent>
        <TextField
          label="Versão"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="1.2.0"
          error={!!errors.version}
          helperText={errors.version}
          fullWidth
          margin="normal"
        />
        <Button
          variant="outlined"
          component="label"
          fullWidth
          sx={{ mt: 2 }}
        >
          Selecionar Arquivo .bin
          <input
            type="file"
            accept=".bin"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Button>
        {file && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            {file.name} ({(file.size / 1024).toFixed(0)} KB)
          </Typography>
        )}
        {errors.file && (
          <Typography color="error" variant="caption">
            {errors.file}
          </Typography>
        )}
        {uploading && (
          <LinearProgress variant="determinate" value={uploadProgress} sx={{ mt: 2 }} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={uploading}>Cancelar</Button>
        <Button onClick={handleUpload} disabled={uploading} variant="contained">
          Fazer Upload
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

#### 3. Confirmation Modal (`frontend/src/app/components/OTAConfirmModal.tsx`)

Modal for confirming mass OTA update:

```typescript
interface ConfirmModalProps {
  open: boolean;
  release: FirmwareRelease | null;
  deviceCount: number;
  onConfirm: (releaseId: string) => void;
  onClose: () => void;
}

export function OTAConfirmModal({ open, release, deviceCount, onConfirm, onClose }: ConfirmModalProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <WarningIcon color="warning" />
          Confirmar Atualização OTA
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography>
          Você está prestes a atualizar <strong>{deviceCount} dispositivos</strong> para a versão{' '}
          <strong>{release?.version}</strong>.
        </Typography>
        <Typography sx={{ mt: 2 }}>
          Este processo pode levar alguns minutos via rede Mesh. Deseja continuar?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button 
          onClick={() => release && onConfirm(release.id)} 
          variant="contained" 
          color="error"
        >
          Confirmar Atualização
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```


#### 4. Progress Dashboard (`frontend/src/app/components/OTAProgressDashboard.tsx`)

Real-time OTA progress monitoring:

```typescript
interface DeviceStatus {
  device_id: string;
  mac_address: string;
  device_name: string;
  status: 'downloading' | 'installing' | 'success' | 'failed' | 'idle';
  progress_percent: number;
  error_message?: string;
  is_gateway: boolean;
}

export function OTAProgressDashboard() {
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [targetVersion, setTargetVersion] = useState<string>("");
  const ws = useWebSocket();

  useEffect(() => {
    // Fetch initial status
    fetchOTAStatus();

    // Subscribe to WebSocket events
    const unsubscribe = ws.subscribe('ota_progress', handleProgressUpdate);
    return unsubscribe;
  }, []);

  const handleProgressUpdate = (data: any) => {
    setDevices(prev => prev.map(device => 
      device.mac_address === data.mac
        ? { ...device, status: data.status, progress_percent: data.progress, error_message: data.error }
        : device
    ));
  };

  const fetchOTAStatus = async () => {
    const status = await api.getOTAStatus();
    setDevices(status.devices);
    setTargetVersion(status.target_version);
  };

  const stats = useMemo(() => ({
    completed: devices.filter(d => d.status === 'success').length,
    inProgress: devices.filter(d => ['downloading', 'installing'].includes(d.status)).length,
    failed: devices.filter(d => d.status === 'failed').length,
    total: devices.length
  }), [devices]);

  const gateways = devices.filter(d => d.is_gateway);
  const nodes = devices.filter(d => !d.is_gateway);

  return (
    <Box>
      <Typography variant="h5">
        Atualização OTA em Andamento - Versão {targetVersion}
      </Typography>

      {/* Stats Summary */}
      <Box display="flex" gap={2} my={2}>
        <Chip label={`🟢 ${stats.completed} Concluídos`} color="success" />
        <Chip label={`🟡 ${stats.inProgress} Em Progresso`} color="warning" />
        <Chip label={`🔴 ${stats.failed} Falharam`} color="error" />
        <Chip label={`Total: ${stats.total}`} />
      </Box>

      {/* Gateways Section */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Gateways Mesh ({gateways.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <List>
            {gateways.map(device => (
              <DeviceProgressItem key={device.device_id} device={device} />
            ))}
          </List>
        </AccordionDetails>
      </Accordion>

      {/* Nodes Section */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Nós Mesh ({nodes.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <List>
            {nodes.map(device => (
              <DeviceProgressItem key={device.device_id} device={device} />
            ))}
          </List>
        </AccordionDetails>
      </Accordion>

      {/* Close Button */}
      {stats.inProgress === 0 && (
        <Button variant="contained" onClick={() => window.history.back()}>
          Fechar
        </Button>
      )}
    </Box>
  );
}

function DeviceProgressItem({ device }: { device: DeviceStatus }) {
  const getStatusIcon = () => {
    switch (device.status) {
      case 'success': return '🟢';
      case 'downloading':
      case 'installing': return '🟡';
      case 'failed': return '🔴';
      default: return '⚪';
    }
  };

  const getStatusText = () => {
    switch (device.status) {
      case 'downloading': return 'Baixando';
      case 'installing': return 'Instalando';
      case 'success': return 'Concluído';
      case 'failed': return 'Falhou';
      default: return 'Aguardando';
    }
  };

  return (
    <ListItem>
      <ListItemIcon>
        <Tooltip title={getStatusText()}>
          <span style={{ fontSize: '24px' }}>{getStatusIcon()}</span>
        </Tooltip>
      </ListItemIcon>
      <ListItemText
        primary={device.device_name}
        secondary={device.mac_address}
      />
      {['downloading', 'installing'].includes(device.status) && (
        <Box sx={{ width: '200px', mr: 2 }}>
          <LinearProgress 
            variant="determinate" 
            value={device.progress_percent}
            sx={{
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.7 }
              }
            }}
          />
          <Typography variant="caption">{device.progress_percent}%</Typography>
        </Box>
      )}
      {device.status === 'success' && (
        <CheckCircleIcon color="success" />
      )}
      {device.status === 'failed' && (
        <Tooltip title={device.error_message || 'Erro desconhecido'}>
          <ErrorIcon color="error" />
        </Tooltip>
      )}
    </ListItem>
  );
}
```


#### 5. API Client Extensions (`frontend/src/services/api.ts`)

Add OTA-related API methods:

```typescript
// Add to existing api.ts

export const api = {
  // ... existing methods ...

  // OTA Management
  async getFirmwareReleases(): Promise<FirmwareRelease[]> {
    const response = await fetch(`${API_URL}/ota/firmware/releases`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch releases');
    return response.json();
  },

  async checkGitHub(): Promise<{ update_available: boolean; version?: string; download_url?: string }> {
    const response = await fetch(`${API_URL}/ota/firmware/check-github`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to check GitHub');
    return response.json();
  },

  async downloadFromGitHub(version?: string): Promise<FirmwareRelease> {
    const response = await fetch(`${API_URL}/ota/firmware/download-github`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ version })
    });
    if (!response.ok) throw new Error('Failed to download firmware');
    return response.json();
  },

  async uploadFirmware(formData: FormData, onProgress?: (progress: number) => void): Promise<FirmwareRelease> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error('Upload failed'));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));

      xhr.open('POST', `${API_URL}/ota/firmware/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
      xhr.send(formData);
    });
  },

  async triggerOTAUpdate(firmwareReleaseId: string): Promise<{ message: string; device_count: number }> {
    const response = await fetch(`${API_URL}/ota/trigger`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmware_release_id: firmwareReleaseId })
    });
    if (!response.ok) throw new Error('Failed to trigger OTA update');
    return response.json();
  },

  async getOTAStatus(): Promise<{ devices: DeviceStatus[]; target_version: string }> {
    const response = await fetch(`${API_URL}/ota/status`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch OTA status');
    return response.json();
  },

  async getOTAHistory(macAddress: string): Promise<OTAUpdateLog[]> {
    const response = await fetch(`${API_URL}/ota/history/${macAddress}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch OTA history');
    return response.json();
  }
};
```

## Data Models

### Database Schema

#### Table: `firmware_releases`

Stores metadata for each firmware version available for OTA updates.

```sql
CREATE TABLE firmware_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50) NOT NULL UNIQUE,
    filename VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size > 0),
    source VARCHAR(20) NOT NULL CHECK (source IN ('github', 'manual_upload')),
    github_release_id INTEGER,
    download_url TEXT,
    local_path TEXT NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_by VARCHAR(100) NOT NULL,
    
    CONSTRAINT version_format CHECK (version ~ '^\d+\.\d+\.\d+$')
);

CREATE INDEX idx_firmware_releases_version ON firmware_releases(version);
CREATE INDEX idx_firmware_releases_uploaded_at ON firmware_releases(uploaded_at DESC);
```

**SQLModel Definition:**

```python
from enum import Enum
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel
import uuid

class FirmwareSource(str, Enum):
    github = "github"
    manual_upload = "manual_upload"

class FirmwareRelease(SQLModel, table=True):
    __tablename__ = "firmware_releases"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    version: str = Field(unique=True, index=True, max_length=50, nullable=False)
    filename: str = Field(max_length=255, nullable=False)
    file_size: int = Field(gt=0, nullable=False)
    source: FirmwareSource = Field(nullable=False)
    github_release_id: Optional[int] = Field(default=None)
    download_url: Optional[str] = Field(default=None)
    local_path: str = Field(nullable=False)
    uploaded_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False
    )
    uploaded_by: str = Field(max_length=100, nullable=False)
```


#### Table: `ota_update_logs`

Tracks each OTA update attempt per device with status and progress.

```sql
CREATE TABLE ota_update_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES esp_devices(id) ON DELETE CASCADE,
    firmware_release_id UUID NOT NULL REFERENCES firmware_releases(id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL CHECK (status IN ('downloading', 'installing', 'success', 'failed')),
    progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    error_message TEXT,
    previous_version VARCHAR(50),
    target_version VARCHAR(50) NOT NULL
);

CREATE INDEX idx_ota_logs_device_started ON ota_update_logs(device_id, started_at DESC);
CREATE INDEX idx_ota_logs_firmware_release ON ota_update_logs(firmware_release_id);
CREATE INDEX idx_ota_logs_status ON ota_update_logs(status);
```

**SQLModel Definition:**

```python
from enum import Enum
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel
import uuid

class OTAStatus(str, Enum):
    downloading = "downloading"
    installing = "installing"
    success = "success"
    failed = "failed"

class OTAUpdateLog(SQLModel, table=True):
    __tablename__ = "ota_update_logs"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    device_id: uuid.UUID = Field(foreign_key="esp_devices.id", index=True, nullable=False)
    firmware_release_id: uuid.UUID = Field(foreign_key="firmware_releases.id", index=True, nullable=False)
    started_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False
    )
    completed_at: Optional[datetime] = Field(default=None)
    status: OTAStatus = Field(default=OTAStatus.downloading, nullable=False)
    progress_percent: int = Field(default=0, ge=0, le=100, nullable=False)
    error_message: Optional[str] = Field(default=None)
    previous_version: Optional[str] = Field(default=None, max_length=50)
    target_version: str = Field(max_length=50, nullable=False)
```

### Pydantic Schemas

#### Request/Response Schemas (`backend/app/schemas/ota.py`)

```python
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator
from typing import Optional
from datetime import datetime
import uuid
import re

# ─── Request Schemas ───────────────────────────────────────────────────────

class CheckGitHubRequest(BaseModel):
    """Empty body for check-github endpoint"""
    model_config = ConfigDict(extra="forbid")

class DownloadGitHubRequest(BaseModel):
    """Request to download firmware from GitHub"""
    model_config = ConfigDict(extra="forbid")
    version: Optional[str] = None
    
    @field_validator('version')
    @classmethod
    def validate_version_format(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r'^\d+\.\d+\.\d+$', v):
            raise ValueError('Version must follow semantic format (e.g., 1.2.0)')
        return v

class TriggerOTARequest(BaseModel):
    """Request to trigger OTA update"""
    model_config = ConfigDict(extra="forbid")
    firmware_release_id: uuid.UUID

class OTATriggerPayload(BaseModel):
    """MQTT payload for OTA trigger command"""
    model_config = ConfigDict(extra="forbid")
    version: str = Field(pattern=r'^\d+\.\d+\.\d+$')
    url: HttpUrl
    size: int = Field(gt=100000)  # Minimum 100KB

class OTAProgressPayload(BaseModel):
    """MQTT payload for OTA progress updates"""
    model_config = ConfigDict(extra="forbid")
    status: str = Field(pattern=r'^(downloading|installing|success|failed)$')
    progress: int = Field(ge=0, le=100)
    error: Optional[str] = None

# ─── Response Schemas ──────────────────────────────────────────────────────

class FirmwareReleaseOut(BaseModel):
    """Firmware release response"""
    id: uuid.UUID
    version: str
    filename: str
    file_size: int
    source: str
    github_release_id: Optional[int]
    download_url: Optional[str]
    uploaded_at: datetime
    uploaded_by: str
    is_latest: bool
    device_count: int
    
    model_config = ConfigDict(from_attributes=True)

class CheckGitHubResponse(BaseModel):
    """Response from check-github endpoint"""
    update_available: bool
    version: Optional[str] = None
    download_url: Optional[str] = None

class TriggerOTAResponse(BaseModel):
    """Response from trigger endpoint"""
    message: str
    device_count: int
    target_version: str

class DeviceOTAStatus(BaseModel):
    """OTA status for a single device"""
    device_id: uuid.UUID
    mac_address: str
    device_name: str
    current_version: Optional[str]
    target_version: Optional[str]
    status: str
    progress_percent: int
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

class OTAStatusResponse(BaseModel):
    """Response from status endpoint"""
    devices: list[DeviceOTAStatus]

class OTAHistoryItem(BaseModel):
    """Single OTA update log entry"""
    id: uuid.UUID
    firmware_release_id: uuid.UUID
    started_at: datetime
    completed_at: Optional[datetime]
    status: str
    progress_percent: int
    error_message: Optional[str]
    previous_version: Optional[str]
    target_version: str
    duration_seconds: Optional[int]
    
    model_config = ConfigDict(from_attributes=True)
```


## MQTT Topics and Payloads

### Topic: `andon/ota/trigger`

**Direction:** Backend → ESP32 (all devices)  
**QoS:** 1 (at least once delivery)  
**Purpose:** Trigger OTA update on all subscribed devices

**Payload Format:**
```json
{
  "version": "1.2.0",
  "url": "http://192.168.1.100:8000/static/ota/firmware-1.2.0.bin",
  "size": 1234567
}
```

**Field Descriptions:**
- `version` (string): Semantic version of the firmware (e.g., "1.2.0")
- `url` (string): HTTP URL where the .bin file can be downloaded
- `size` (integer): File size in bytes for validation

**ESP32 Behavior:**
1. Receive message and parse JSON
2. Validate version is different from current `FIRMWARE_VERSION`
3. If same version, ignore and log
4. If different, start download process and publish progress

### Topic: `andon/ota/progress/{mac}`

**Direction:** ESP32 → Backend  
**QoS:** 1 (at least once delivery)  
**Purpose:** Report OTA update progress from individual device

**Payload Format:**
```json
{
  "status": "downloading",
  "progress": 45,
  "error": null
}
```

**Field Descriptions:**
- `status` (string): Current status - one of: `downloading`, `installing`, `success`, `failed`
- `progress` (integer): Progress percentage (0-100)
- `error` (string | null): Error message if status is `failed`, otherwise null

**Status Transitions:**
```
idle → downloading (0-99%) → installing (100%) → success (100%)
                                               ↘ failed (with error)
```

**Backend Behavior:**
1. Receive message on wildcard subscription `andon/ota/progress/#`
2. Extract MAC address from topic
3. Parse JSON payload
4. Update `ota_update_logs` table
5. Broadcast WebSocket event to frontend

## WebSocket Events

The system reuses the existing WebSocket connection at `/api/v1/devices/ws` for OTA events.

### Event: `ota_triggered`

**Direction:** Backend → Frontend  
**Trigger:** When OTA update is triggered via API

**Payload:**
```json
{
  "event": "ota_triggered",
  "data": {
    "version": "1.2.0",
    "device_count": 25,
    "firmware_release_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Frontend Action:** Display toast notification and navigate to progress dashboard

### Event: `ota_progress`

**Direction:** Backend → Frontend  
**Trigger:** When device reports progress via MQTT

**Payload:**
```json
{
  "event": "ota_progress",
  "data": {
    "mac": "AA:BB:CC:DD:EE:FF",
    "device_id": "660e8400-e29b-41d4-a716-446655440000",
    "status": "downloading",
    "progress": 45,
    "error": null
  }
}
```

**Frontend Action:** Update progress bar for specific device in dashboard

### Event: `ota_completed`

**Direction:** Backend → Frontend  
**Trigger:** When all devices complete (success or failed)

**Payload:**
```json
{
  "event": "ota_completed",
  "data": {
    "version": "1.2.0",
    "total": 25,
    "success": 23,
    "failed": 2
  }
}
```

**Frontend Action:** Display summary toast and enable "Close" button

## API Endpoints Specification

### GET `/api/v1/ota/firmware/releases`

**Description:** List all firmware releases  
**Auth:** Required (JWT)  
**Query Parameters:** None

**Response:** `200 OK`
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "version": "1.2.0",
    "filename": "firmware-1.2.0.bin",
    "file_size": 1234567,
    "source": "github",
    "github_release_id": 12345,
    "download_url": "https://github.com/.../firmware.bin",
    "uploaded_at": "2024-01-15T10:30:00Z",
    "uploaded_by": "admin",
    "is_latest": true,
    "device_count": 23
  }
]
```

### POST `/api/v1/ota/firmware/check-github`

**Description:** Check for new firmware version on GitHub  
**Auth:** Required (JWT)  
**Request Body:** `{}`

**Response:** `200 OK`
```json
{
  "update_available": true,
  "version": "1.3.0",
  "download_url": "https://github.com/.../firmware-1.3.0.bin"
}
```

**Error Responses:**
- `503 Service Unavailable`: GitHub API unreachable

### POST `/api/v1/ota/firmware/download-github`

**Description:** Download firmware from GitHub  
**Auth:** Required (JWT)  
**Request Body:**
```json
{
  "version": "1.2.0"  // Optional, downloads latest if omitted
}
```

**Response:** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "version": "1.2.0",
  "filename": "firmware-1.2.0.bin",
  "file_size": 1234567,
  "source": "github",
  "uploaded_at": "2024-01-15T10:30:00Z",
  "uploaded_by": "admin"
}
```

**Error Responses:**
- `409 Conflict`: Version already exists
- `500 Internal Server Error`: Download failed


### POST `/api/v1/ota/firmware/upload`

**Description:** Upload firmware manually  
**Auth:** Required (JWT)  
**Content-Type:** `multipart/form-data`

**Form Fields:**
- `file`: Binary file (.bin extension, 100KB - 2MB)
- `version`: String (semantic version format, e.g., "1.2.0")

**Response:** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "version": "1.2.0",
  "filename": "firmware-1.2.0.bin",
  "file_size": 1234567,
  "source": "manual_upload",
  "uploaded_at": "2024-01-15T10:30:00Z",
  "uploaded_by": "admin"
}
```

**Error Responses:**
- `422 Unprocessable Entity`: Invalid file or version format
- `409 Conflict`: Version already exists

### POST `/api/v1/ota/trigger`

**Description:** Trigger OTA update for all devices  
**Auth:** Required (JWT)  
**Request Body:**
```json
{
  "firmware_release_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:** `202 Accepted`
```json
{
  "message": "Atualização OTA disparada para 25 dispositivos",
  "device_count": 25,
  "target_version": "1.2.0"
}
```

**Error Responses:**
- `404 Not Found`: Firmware release not found
- `500 Internal Server Error`: Firmware file missing or MQTT publish failed
- `429 Too Many Requests`: Rate limit exceeded (1 req/sec)

### GET `/api/v1/ota/status`

**Description:** Get current OTA status for all devices  
**Auth:** Required (JWT)

**Response:** `200 OK`
```json
{
  "devices": [
    {
      "device_id": "660e8400-e29b-41d4-a716-446655440000",
      "mac_address": "AA:BB:CC:DD:EE:FF",
      "device_name": "Gateway-01",
      "current_version": "1.1.0",
      "target_version": "1.2.0",
      "status": "downloading",
      "progress_percent": 45,
      "error_message": null,
      "started_at": "2024-01-15T10:35:00Z",
      "completed_at": null
    }
  ]
}
```

### GET `/api/v1/ota/history/{mac_address}`

**Description:** Get OTA update history for specific device  
**Auth:** Required (JWT)

**Response:** `200 OK`
```json
[
  {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "firmware_release_id": "550e8400-e29b-41d4-a716-446655440000",
    "started_at": "2024-01-15T10:35:00Z",
    "completed_at": "2024-01-15T10:40:00Z",
    "status": "success",
    "progress_percent": 100,
    "error_message": null,
    "previous_version": "1.1.0",
    "target_version": "1.2.0",
    "duration_seconds": 300
  }
]
```

**Error Responses:**
- `404 Not Found`: Device not found

## Security Design

### Authentication and Authorization

**JWT Authentication:**
- All OTA management endpoints require valid JWT token
- Token must be included in `Authorization: Bearer <token>` header
- Static file route `/static/ota/` is public (no auth) for ESP32 access

**User Permissions:**
- Only authenticated users can trigger OTA updates
- All OTA operations are logged with username for audit trail

### Input Validation

**File Upload Validation:**
```python
def validate_firmware_file(file: UploadFile) -> None:
    # Extension check
    if not file.filename.endswith('.bin'):
        raise HTTPException(422, "Arquivo deve ter extensão .bin")
    
    # Size check (100KB - 2MB)
    file.file.seek(0, 2)  # Seek to end
    size = file.file.tell()
    file.file.seek(0)  # Reset
    if size < 100 * 1024 or size > 2 * 1024 * 1024:
        raise HTTPException(422, "Tamanho deve estar entre 100KB e 2MB")
    
    # Path traversal check
    if '..' in file.filename or '/' in file.filename or '\\' in file.filename:
        raise HTTPException(422, "Nome de arquivo inválido")
```

**Version Validation:**
```python
def validate_version(version: str) -> None:
    if not re.match(r'^\d+\.\d+\.\d+$', version):
        raise HTTPException(422, "Versão deve seguir formato semântico (ex: 1.2.0)")
```

### Rate Limiting

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/trigger")
@limiter.limit("1/second")
async def trigger_ota_update(...):
    ...
```

### Error Handling

**No Stack Trace Exposure:**
```python
@router.post("/trigger")
async def trigger_ota_update(...):
    try:
        result = await ota_service.trigger_update(...)
        return result
    except FileNotFoundError:
        logger.error(f"Firmware file not found: {firmware_release_id}")
        raise HTTPException(500, "Arquivo de firmware não encontrado")
    except Exception as e:
        logger.error(f"OTA trigger failed: {e}", exc_info=True)
        raise HTTPException(500, "Erro ao disparar atualização OTA")
```

### Audit Logging

All OTA operations are logged with:
- Timestamp (UTC)
- Username (from JWT)
- Action (upload, download, trigger)
- Target (firmware version, device count)
- Result (success/failure)

**Log Format:**
```
2024-01-15 10:35:00 UTC | INFO | OTA: Firmware 1.2.0 uploaded manually by admin
2024-01-15 10:36:00 UTC | INFO | OTA: Update triggered for version 1.2.0 by admin (25 devices)
2024-01-15 10:40:00 UTC | INFO | OTA: Device AA:BB:CC:DD:EE:FF - success - 100%
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following testable properties. During reflection, I combined related properties to avoid redundancy:

**Redundancy Analysis:**
- Properties 5.2 and 23.1 both validate file size (100KB-2MB) → Combined into Property 1
- Properties 5.5 and 1.2 both validate version uniqueness → Combined into Property 2
- Properties 26.10 and 26.11 are both serialization round-trips → Kept separate as they test different schemas

**Properties to Implement:**

### Property 1: File Upload Validation

*For any* file upload attempt, if the file has extension `.bin` and size between 100KB and 2MB, then the validation should succeed; otherwise, the system should reject with HTTP 422.

**Validates: Requirements 5.2, 5.3, 23.1**

### Property 2: Version Uniqueness

*For any* firmware version string, attempting to create a second `FirmwareRelease` with the same version should fail with HTTP 409 conflict error.

**Validates: Requirements 1.2, 5.5, 5.6**

### Property 3: Automatic Timestamp Assignment

*For any* newly created `FirmwareRelease`, the `uploaded_at` field should be automatically set to a timestamp within 1 second of the current UTC time.

**Validates: Requirements 1.4**

### Property 4: OTA Log Initial State

*For any* newly created `OTAUpdateLog`, the initial state should have `status = "downloading"` and `progress_percent = 0`.

**Validates: Requirements 2.4**

### Property 5: Semantic Version Format Validation

*For any* version string, if it matches the regex `^\d+\.\d+\.\d+$`, then validation should succeed; otherwise, the system should reject with HTTP 422.

**Validates: Requirements 23.3**

### Property 6: Path Traversal Prevention

*For any* filename string containing `..`, `/`, or `\`, the validation should reject the filename to prevent path traversal attacks.

**Validates: Requirements 23.2**

### Property 7: Pydantic Extra Field Rejection

*For any* request payload containing fields not defined in the schema, Pydantic with `extra="forbid"` should reject the request with HTTP 422.

**Validates: Requirements 23.5**

### Property 8: Latest Release Uniqueness

*For any* list of firmware releases ordered by `uploaded_at` descending, exactly one release should have `is_latest = true` (the first one).

**Validates: Requirements 7.4**

### Property 9: Device Count Accuracy

*For any* firmware release, the calculated `device_count` should equal the number of distinct devices with `OTAUpdateLog` entries having `status = "success"` for that release.

**Validates: Requirements 7.5**

### Property 10: OTA Trigger Creates Logs

*For any* OTA trigger request with valid `firmware_release_id`, the system should create exactly one `OTAUpdateLog` entry per registered ESP32 device, all with `status = "downloading"`.

**Validates: Requirements 10.7**

### Property 11: MQTT Payload Serialization Round-Trip (Trigger)

*For any* valid `OTATriggerPayload` object, serializing to JSON, then deserializing, then serializing again should produce equivalent JSON.

**Validates: Requirements 26.10**

### Property 12: MQTT Payload Serialization Round-Trip (Progress)

*For any* valid `OTAProgressPayload` object, serializing to JSON, then deserializing, then serializing again should produce equivalent JSON.

**Validates: Requirements 26.11**

### Property 13: Progress Update State Transition

*For any* `OTAUpdateLog` in state "downloading" or "installing", receiving a progress update with `status = "success"` or `status = "failed"` should set the `completed_at` timestamp.

**Validates: Requirements 11.7**

### Property 14: Current Version Calculation

*For any* device with multiple `OTAUpdateLog` entries, the calculated `current_version` should be the `target_version` of the most recent log entry with `status = "success"`.

**Validates: Requirements 12.3**

### Property 15: Same Version Rejection

*For any* OTA trigger command where the `version` field equals the device's current firmware version, the device should ignore the command and not start downloading.

**Validates: Requirements 19.3**

### Property 16: Static File Content-Type Header

*For any* request to `/static/ota/*.bin`, the response should include the header `Content-Type: application/octet-stream`.

**Validates: Requirements 6.5**


## Error Handling

### Error Categories

#### 1. Client Errors (4xx)

**400 Bad Request:**
- Malformed JSON in request body
- Missing required fields
- Invalid data types

**401 Unauthorized:**
- Missing JWT token
- Expired JWT token
- Invalid JWT signature

**404 Not Found:**
- Firmware release ID not found
- Device MAC address not found
- Requested file not found in storage

**409 Conflict:**
- Firmware version already exists
- Duplicate upload attempt

**422 Unprocessable Entity:**
- Invalid file extension (not .bin)
- File size out of range (< 100KB or > 2MB)
- Invalid version format (not semantic versioning)
- Path traversal in filename
- Extra fields in request (Pydantic `extra="forbid"`)

**429 Too Many Requests:**
- Rate limit exceeded on `/ota/trigger` endpoint (> 1 req/sec)

#### 2. Server Errors (5xx)

**500 Internal Server Error:**
- Firmware file missing from storage
- Database connection failure
- MQTT publish failure
- Unexpected exception in business logic

**503 Service Unavailable:**
- GitHub API unreachable
- MQTT broker disconnected
- External service timeout

### Error Response Format

All error responses follow a consistent JSON structure:

```json
{
  "detail": "Human-readable error message in PT-BR",
  "error_code": "FIRMWARE_NOT_FOUND",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Fields:**
- `detail`: User-friendly error message (never includes stack traces or internal paths)
- `error_code`: Machine-readable error code for client-side handling
- `request_id`: Unique identifier for log correlation

### Error Handling Patterns

#### Backend Error Handler

```python
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
import uuid
import logging

logger = logging.getLogger(__name__)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = str(uuid.uuid4())
    
    # Log full error with stack trace
    logger.error(
        f"Request {request_id} failed: {exc}",
        exc_info=True,
        extra={
            "request_id": request_id,
            "path": request.url.path,
            "method": request.method
        }
    )
    
    # Return sanitized error to client
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "request_id": request_id
            }
        )
    
    # Generic error for unexpected exceptions
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Erro interno do servidor",
            "error_code": "INTERNAL_ERROR",
            "request_id": request_id
        }
    )
```

#### Timeout Handling

**GitHub API Timeout:**
```python
async def fetch_latest_github_release(self) -> dict:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{self.base_url}/repos/{self.owner}/{self.repo}/releases/latest")
            response.raise_for_status()
            return response.json()
    except httpx.TimeoutException:
        logger.error("GitHub API timeout after 30s")
        raise HTTPException(503, "GitHub API não respondeu a tempo")
    except httpx.HTTPStatusError as e:
        logger.error(f"GitHub API error: {e.response.status_code}")
        raise HTTPException(503, "Erro ao consultar GitHub API")
```

**Firmware Download Timeout:**
```python
async def download_firmware_stream(self, url: str, dest_path: Path) -> None:
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream('GET', url) as response:
                response.raise_for_status()
                with open(dest_path, 'wb') as f:
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        f.write(chunk)
    except httpx.TimeoutException:
        dest_path.unlink(missing_ok=True)  # Clean up partial file
        logger.error(f"Firmware download timeout after 300s: {url}")
        raise HTTPException(500, "Download de firmware excedeu o tempo limite")
    except Exception as e:
        dest_path.unlink(missing_ok=True)
        logger.error(f"Firmware download failed: {e}")
        raise HTTPException(500, "Erro ao baixar firmware")
```

#### MQTT Error Handling

**Connection Retry with Backoff:**
```python
async def _mqtt_loop():
    backoff = 1
    while True:
        try:
            async with aiomqtt.Client(hostname=host, port=port) as client:
                backoff = 1  # Reset on successful connection
                await client.subscribe("andon/ota/progress/#")
                
                async for message in client.messages:
                    try:
                        await _handle_ota_progress(...)
                    except Exception as e:
                        logger.error(f"Error handling MQTT message: {e}", exc_info=True)
                        # Continue processing other messages
                        
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"MQTT connection error: {e}. Reconnecting in {backoff}s...")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)  # Exponential backoff, max 60s
```

**Publish Retry:**
```python
async def publish_ota_trigger(self, payload: dict, retries: int = 3) -> None:
    for attempt in range(retries):
        try:
            async with aiomqtt.Client(hostname=host, port=port) as client:
                await client.publish("andon/ota/trigger", json.dumps(payload), qos=1)
                logger.info(f"OTA trigger published: {payload['version']}")
                return
        except Exception as e:
            if attempt == retries - 1:
                logger.error(f"Failed to publish OTA trigger after {retries} attempts")
                raise HTTPException(500, "Erro ao publicar comando OTA via MQTT")
            await asyncio.sleep(2 ** attempt)  # Exponential backoff
```

### Device-Side Error Handling

**ESP32 Firmware Error Scenarios:**

1. **Download Failure:**
   - Publish: `{"status": "failed", "progress": 0, "error": "HTTP 404 - File not found"}`
   - Action: Abort update, remain on current version

2. **Checksum Validation Failure:**
   - Publish: `{"status": "failed", "progress": 100, "error": "Checksum validation failed"}`
   - Action: Delete downloaded file, remain on current version

3. **Installation Failure:**
   - Publish: `{"status": "failed", "progress": 100, "error": "OTA partition write failed"}`
   - Action: Remain on current version

4. **Boot Failure (Automatic Rollback):**
   - ESP32 bootloader detects failed boot
   - Automatically reverts to previous partition
   - On next boot: Publish log message "OTA: Rollback executed - new version failed"

### Timeout Detection

**Backend Timeout Monitor:**
```python
async def monitor_ota_timeouts():
    """Background task to detect stalled OTA updates"""
    while True:
        await asyncio.sleep(60)  # Check every minute
        
        async with async_session_factory() as session:
            # Find logs stuck in downloading/installing for > 10 minutes
            timeout_threshold = datetime.now(timezone.utc) - timedelta(minutes=10)
            
            stmt = select(OTAUpdateLog).where(
                OTAUpdateLog.status.in_(["downloading", "installing"]),
                OTAUpdateLog.started_at < timeout_threshold,
                OTAUpdateLog.completed_at.is_(None)
            )
            
            stalled_logs = (await session.execute(stmt)).scalars().all()
            
            for log in stalled_logs:
                log.status = "failed"
                log.error_message = "Timeout - dispositivo não respondeu"
                log.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                session.add(log)
                
                logger.warning(f"OTA timeout detected for device {log.device_id}")
            
            await session.commit()
```


## Testing Strategy

### Dual Testing Approach

This system requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** focus on:
- Specific examples and edge cases
- Integration points between components
- Error conditions and exception handling
- MQTT message handling logic
- WebSocket event broadcasting

**Property-Based Tests** focus on:
- Universal properties across all inputs
- Validation logic with randomized inputs
- Serialization round-trips
- Database constraints and uniqueness
- State transitions

### Property-Based Testing Configuration

**Library Selection:**
- **Backend (Python):** Use `hypothesis` library for property-based testing
- **Frontend (TypeScript):** Use `fast-check` library for property-based testing

**Test Configuration:**
- Minimum 100 iterations per property test
- Each test must reference its design document property
- Tag format: `# Feature: esp32-ota-management, Property {number}: {property_text}`

### Backend Testing

#### Unit Tests (`backend/app/tests/test_ota.py`)

```python
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_upload_firmware_success():
    """Test successful manual firmware upload"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        files = {"file": ("firmware-1.2.0.bin", b"x" * 500000, "application/octet-stream")}
        data = {"version": "1.2.0"}
        response = await client.post("/api/v1/ota/firmware/upload", files=files, data=data)
        assert response.status_code == 201
        assert response.json()["version"] == "1.2.0"

@pytest.mark.asyncio
async def test_upload_firmware_duplicate_version():
    """Test that duplicate version returns 409"""
    # First upload
    async with AsyncClient(app=app, base_url="http://test") as client:
        files = {"file": ("firmware-1.2.0.bin", b"x" * 500000, "application/octet-stream")}
        data = {"version": "1.2.0"}
        await client.post("/api/v1/ota/firmware/upload", files=files, data=data)
        
        # Duplicate upload
        response = await client.post("/api/v1/ota/firmware/upload", files=files, data=data)
        assert response.status_code == 409

@pytest.mark.asyncio
async def test_trigger_ota_creates_logs():
    """Test that triggering OTA creates logs for all devices"""
    # Setup: Create firmware release and devices
    # ...
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/v1/ota/trigger", json={"firmware_release_id": str(release_id)})
        assert response.status_code == 202
        
    # Verify logs created
    async with async_session_factory() as session:
        logs = (await session.execute(select(OTAUpdateLog))).scalars().all()
        assert len(logs) == device_count
        assert all(log.status == "downloading" for log in logs)

@pytest.mark.asyncio
async def test_mqtt_progress_updates_log():
    """Test that MQTT progress messages update database"""
    # Setup: Create device and OTA log
    # ...
    
    # Simulate MQTT message
    payload = json.dumps({"status": "downloading", "progress": 50, "error": None})
    await _handle_ota_progress(mac_address, payload.encode())
    
    # Verify log updated
    async with async_session_factory() as session:
        log = (await session.execute(select(OTAUpdateLog).where(...))).scalars().first()
        assert log.progress_percent == 50
        assert log.status == "downloading"
```

#### Property-Based Tests (`backend/app/tests/test_ota_properties.py`)

```python
from hypothesis import given, strategies as st
import pytest

# Feature: esp32-ota-management, Property 1: File Upload Validation
@given(
    file_size=st.integers(min_value=0, max_value=10_000_000),
    extension=st.sampled_from([".bin", ".txt", ".hex", ""])
)
def test_file_validation_property(file_size, extension):
    """For any file, validation should accept .bin files between 100KB-2MB, reject others"""
    filename = f"firmware{extension}"
    
    is_valid_size = 100 * 1024 <= file_size <= 2 * 1024 * 1024
    is_valid_ext = extension == ".bin"
    should_accept = is_valid_size and is_valid_ext
    
    # Mock file object
    file = MockUploadFile(filename=filename, size=file_size)
    
    if should_accept:
        validate_firmware_file(file)  # Should not raise
    else:
        with pytest.raises(HTTPException) as exc_info:
            validate_firmware_file(file)
        assert exc_info.value.status_code == 422

# Feature: esp32-ota-management, Property 2: Version Uniqueness
@given(version=st.text(alphabet=st.characters(whitelist_categories=("Nd", "P")), min_size=5, max_size=10))
@pytest.mark.asyncio
async def test_version_uniqueness_property(version, session):
    """For any version, creating duplicate FirmwareRelease should fail"""
    # Assume version matches semantic format for this test
    if not re.match(r'^\d+\.\d+\.\d+$', version):
        return  # Skip invalid versions
    
    # First creation should succeed
    release1 = FirmwareRelease(
        version=version,
        filename=f"firmware-{version}.bin",
        file_size=500000,
        source="manual_upload",
        local_path=f"/storage/{version}.bin",
        uploaded_by="test"
    )
    session.add(release1)
    await session.commit()
    
    # Duplicate creation should fail
    release2 = FirmwareRelease(
        version=version,
        filename=f"firmware-{version}.bin",
        file_size=500000,
        source="manual_upload",
        local_path=f"/storage/{version}.bin",
        uploaded_by="test"
    )
    session.add(release2)
    
    with pytest.raises(IntegrityError):
        await session.commit()

# Feature: esp32-ota-management, Property 5: Semantic Version Format Validation
@given(version=st.text(min_size=1, max_size=20))
def test_semantic_version_validation_property(version):
    """For any string, validation should accept only semantic versions (X.Y.Z)"""
    matches_format = bool(re.match(r'^\d+\.\d+\.\d+$', version))
    
    if matches_format:
        validate_version(version)  # Should not raise
    else:
        with pytest.raises(HTTPException) as exc_info:
            validate_version(version)
        assert exc_info.value.status_code == 422

# Feature: esp32-ota-management, Property 6: Path Traversal Prevention
@given(filename=st.text(min_size=1, max_size=50))
def test_path_traversal_prevention_property(filename):
    """For any filename, validation should reject path traversal attempts"""
    has_traversal = '..' in filename or '/' in filename or '\\' in filename
    
    if has_traversal:
        with pytest.raises(HTTPException) as exc_info:
            validate_filename(filename)
        assert exc_info.value.status_code == 422
    else:
        validate_filename(filename)  # Should not raise

# Feature: esp32-ota-management, Property 11: MQTT Payload Serialization Round-Trip (Trigger)
@given(
    version=st.from_regex(r'^\d+\.\d+\.\d+$', fullmatch=True),
    size=st.integers(min_value=100001, max_value=2_000_000)
)
def test_ota_trigger_payload_roundtrip_property(version, size):
    """For any valid OTATriggerPayload, serialize → deserialize → serialize should be equivalent"""
    url = f"http://192.168.1.100:8000/static/ota/firmware-{version}.bin"
    
    # Create payload
    payload1 = OTATriggerPayload(version=version, url=url, size=size)
    
    # Serialize
    json1 = payload1.model_dump_json()
    
    # Deserialize
    payload2 = OTATriggerPayload.model_validate_json(json1)
    
    # Serialize again
    json2 = payload2.model_dump_json()
    
    # Should be equivalent
    assert json1 == json2
    assert payload1.version == payload2.version
    assert payload1.size == payload2.size

# Feature: esp32-ota-management, Property 12: MQTT Payload Serialization Round-Trip (Progress)
@given(
    status=st.sampled_from(["downloading", "installing", "success", "failed"]),
    progress=st.integers(min_value=0, max_value=100),
    error=st.one_of(st.none(), st.text(min_size=1, max_size=100))
)
def test_ota_progress_payload_roundtrip_property(status, progress, error):
    """For any valid OTAProgressPayload, serialize → deserialize → serialize should be equivalent"""
    # Create payload
    payload1 = OTAProgressPayload(status=status, progress=progress, error=error)
    
    # Serialize
    json1 = payload1.model_dump_json()
    
    # Deserialize
    payload2 = OTAProgressPayload.model_validate_json(json1)
    
    # Serialize again
    json2 = payload2.model_dump_json()
    
    # Should be equivalent
    assert json1 == json2
    assert payload1.status == payload2.status
    assert payload1.progress == payload2.progress
    assert payload1.error == payload2.error
```


### Frontend Testing

#### Unit Tests (`frontend/src/app/components/__tests__/OTASettings.test.tsx`)

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OTASettings } from '../OTASettings';
import { api } from '@/services/api';

jest.mock('@/services/api');

describe('OTASettings', () => {
  it('should display firmware releases', async () => {
    const mockReleases = [
      { id: '1', version: '1.2.0', source: 'github', device_count: 10 },
      { id: '2', version: '1.1.0', source: 'manual_upload', device_count: 5 }
    ];
    
    (api.getFirmwareReleases as jest.Mock).mockResolvedValue(mockReleases);
    
    render(<OTASettings />);
    
    await waitFor(() => {
      expect(screen.getByText('1.2.0')).toBeInTheDocument();
      expect(screen.getByText('1.1.0')).toBeInTheDocument();
    });
  });

  it('should open confirmation modal when clicking update button', async () => {
    const mockReleases = [
      { id: '1', version: '1.2.0', source: 'github', device_count: 10 }
    ];
    
    (api.getFirmwareReleases as jest.Mock).mockResolvedValue(mockReleases);
    
    render(<OTASettings />);
    
    await waitFor(() => screen.getByText('Atualizar Todos'));
    
    fireEvent.click(screen.getByText('Atualizar Todos'));
    
    expect(screen.getByText('Confirmar Atualização OTA')).toBeInTheDocument();
  });

  it('should trigger OTA update on confirmation', async () => {
    (api.triggerOTAUpdate as jest.Mock).mockResolvedValue({ device_count: 10 });
    
    render(<OTASettings />);
    
    // ... setup and open modal ...
    
    fireEvent.click(screen.getByText('Confirmar Atualização'));
    
    await waitFor(() => {
      expect(api.triggerOTAUpdate).toHaveBeenCalledWith('1');
    });
  });
});
```

#### Property-Based Tests (`frontend/src/app/components/__tests__/OTAValidation.property.test.ts`)

```typescript
import fc from 'fast-check';
import { validateVersion, validateFilename } from '../OTAValidation';

// Feature: esp32-ota-management, Property 5: Semantic Version Format Validation
describe('Version validation property', () => {
  it('should accept only semantic versions (X.Y.Z)', () => {
    fc.assert(
      fc.property(fc.string(), (version) => {
        const matchesFormat = /^\d+\.\d+\.\d+$/.test(version);
        const result = validateVersion(version);
        
        if (matchesFormat) {
          expect(result.valid).toBe(true);
        } else {
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: esp32-ota-management, Property 6: Path Traversal Prevention
describe('Filename validation property', () => {
  it('should reject filenames with path traversal', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (filename) => {
        const hasTraversal = filename.includes('..') || filename.includes('/') || filename.includes('\\');
        const result = validateFilename(filename);
        
        if (hasTraversal) {
          expect(result.valid).toBe(false);
          expect(result.error).toContain('inválido');
        } else {
          expect(result.valid).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
```

### Integration Tests

#### End-to-End OTA Flow Test

```python
@pytest.mark.integration
@pytest.mark.asyncio
async def test_complete_ota_flow():
    """Integration test for complete OTA update flow"""
    
    # 1. Upload firmware
    async with AsyncClient(app=app, base_url="http://test") as client:
        files = {"file": ("firmware-1.2.0.bin", b"x" * 500000, "application/octet-stream")}
        data = {"version": "1.2.0"}
        response = await client.post("/api/v1/ota/firmware/upload", files=files, data=data)
        assert response.status_code == 201
        release_id = response.json()["id"]
    
    # 2. Create test devices
    async with async_session_factory() as session:
        device1 = ESPDevice(mac_address="AA:BB:CC:DD:EE:01", device_name="Test-01", status="online")
        device2 = ESPDevice(mac_address="AA:BB:CC:DD:EE:02", device_name="Test-02", status="online")
        session.add_all([device1, device2])
        await session.commit()
    
    # 3. Trigger OTA update
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/v1/ota/trigger", json={"firmware_release_id": release_id})
        assert response.status_code == 202
        assert response.json()["device_count"] == 2
    
    # 4. Verify logs created
    async with async_session_factory() as session:
        logs = (await session.execute(select(OTAUpdateLog))).scalars().all()
        assert len(logs) == 2
        assert all(log.status == "downloading" for log in logs)
    
    # 5. Simulate device progress updates
    for mac in ["AA:BB:CC:DD:EE:01", "AA:BB:CC:DD:EE:02"]:
        # Downloading
        payload = json.dumps({"status": "downloading", "progress": 50, "error": None})
        await _handle_ota_progress(mac, payload.encode())
        
        # Installing
        payload = json.dumps({"status": "installing", "progress": 100, "error": None})
        await _handle_ota_progress(mac, payload.encode())
        
        # Success
        payload = json.dumps({"status": "success", "progress": 100, "error": None})
        await _handle_ota_progress(mac, payload.encode())
    
    # 6. Verify final state
    async with async_session_factory() as session:
        logs = (await session.execute(
            select(OTAUpdateLog).order_by(OTAUpdateLog.started_at.desc())
        )).scalars().all()
        
        assert len(logs) == 2
        assert all(log.status == "success" for log in logs)
        assert all(log.progress_percent == 100 for log in logs)
        assert all(log.completed_at is not None for log in logs)
    
    # 7. Verify status endpoint
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/ota/status")
        assert response.status_code == 200
        devices = response.json()["devices"]
        assert len(devices) == 2
        assert all(d["status"] == "success" for d in devices)
        assert all(d["current_version"] == "1.2.0" for d in devices)
```

### Test Coverage Goals

**Backend:**
- Line coverage: > 80%
- Branch coverage: > 75%
- Critical paths (OTA trigger, progress handling): 100%

**Frontend:**
- Component coverage: > 70%
- User interaction flows: 100%
- Error handling: > 80%

### Continuous Integration

**GitHub Actions Workflow:**
```yaml
name: OTA Tests

on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          cd backend
          pip install -e .
          pip install pytest pytest-asyncio hypothesis
      - name: Run unit tests
        run: pytest backend/app/tests/test_ota.py -v
      - name: Run property tests
        run: pytest backend/app/tests/test_ota_properties.py -v --hypothesis-show-statistics
      - name: Run integration tests
        run: pytest backend/app/tests/test_ota_integration.py -v -m integration

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd frontend
          npm ci
      - name: Run tests
        run: npm test -- --coverage
```


## Implementation Notes

### Environment Variables

Add to `backend/.env.example`:

```bash
# ─── OTA Management Configuration ──────────────────────────────────────────

# GitHub Integration (optional - for automatic firmware downloads)
GITHUB_REPO_OWNER=your-org
GITHUB_REPO_NAME=esp32-andon-firmware
GITHUB_TOKEN=  # Optional - only needed for private repos

# OTA Storage Path (Docker volume mount point)
OTA_STORAGE_PATH=/app/storage/ota/firmware

# MQTT Configuration (reuses existing settings)
# MQTT_BROKER_HOST=localhost
# MQTT_BROKER_PORT=1883
```

### Docker Configuration

Add to `docker-compose.yml`:

```yaml
services:
  api:
    volumes:
      # ... existing volumes ...
      - ota_firmware:/app/storage/ota/firmware  # OTA firmware storage

volumes:
  # ... existing volumes ...
  ota_firmware:
    driver: local
```

### Database Migration

Create Alembic migration:

```bash
cd backend
alembic revision --autogenerate -m "feat: add firmware_releases and ota_update_logs tables"
alembic upgrade head
```

### File Structure

```
backend/app/
├── api/api_v1/endpoints/
│   └── ota.py                    # NEW: OTA endpoints
├── models/
│   └── ota.py                    # NEW: FirmwareRelease, OTAUpdateLog models
├── schemas/
│   └── ota.py                    # NEW: OTA request/response schemas
├── services/
│   ├── ota_service.py            # NEW: OTA business logic
│   ├── github_client.py          # NEW: GitHub API integration
│   └── mqtt_service.py           # MODIFIED: Add OTA handlers
└── tests/
    ├── test_ota.py               # NEW: Unit tests
    ├── test_ota_properties.py    # NEW: Property-based tests
    └── test_ota_integration.py   # NEW: Integration tests

frontend/src/app/components/
├── OTASettings.tsx               # NEW: Main OTA settings tab
├── OTAUploadModal.tsx            # NEW: Manual upload modal
├── OTAConfirmModal.tsx           # NEW: Confirmation modal
├── OTAProgressDashboard.tsx      # NEW: Real-time progress dashboard
└── __tests__/
    ├── OTASettings.test.tsx      # NEW: Component tests
    └── OTAValidation.property.test.ts  # NEW: Property tests

hardware/src/
├── ota.cpp                       # NEW: OTA update logic
└── ota.h                         # NEW: OTA header
```

### ESP32 Firmware Integration

Add to `hardware/src/ota.cpp`:

```cpp
#include <HTTPUpdate.h>
#include <ArduinoJson.h>
#include "ota.h"
#include "mqtt.h"

#define FIRMWARE_VERSION "1.0.0"

void handleOTATrigger(const char* payload) {
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payload);
    
    if (error) {
        Serial.println("OTA: JSON parse error");
        return;
    }
    
    const char* version = doc["version"];
    const char* url = doc["url"];
    int size = doc["size"];
    
    // Check if already on this version
    if (strcmp(version, FIRMWARE_VERSION) == 0) {
        Serial.printf("OTA: Already on version %s\n", version);
        return;
    }
    
    Serial.printf("OTA: Starting update to version %s\n", version);
    
    // Publish initial progress
    publishOTAProgress("downloading", 0, nullptr);
    
    // Configure HTTPUpdate
    HTTPUpdate httpUpdate;
    httpUpdate.setLedPin(LED_BUILTIN, LOW);
    
    // Progress callback
    httpUpdate.onProgress([](int current, int total) {
        int progress = (current * 100) / total;
        static int lastProgress = -1;
        
        // Report every 10%
        if (progress / 10 != lastProgress / 10) {
            publishOTAProgress("downloading", progress, nullptr);
            lastProgress = progress;
        }
    });
    
    // Start update
    t_httpUpdate_return ret = httpUpdate.update(url);
    
    switch (ret) {
        case HTTP_UPDATE_FAILED:
            Serial.printf("OTA: Update failed - %s\n", httpUpdate.getLastErrorString().c_str());
            publishOTAProgress("failed", 0, httpUpdate.getLastErrorString().c_str());
            break;
            
        case HTTP_UPDATE_NO_UPDATES:
            Serial.println("OTA: No updates available");
            break;
            
        case HTTP_UPDATE_OK:
            Serial.println("OTA: Update successful, rebooting...");
            publishOTAProgress("success", 100, nullptr);
            delay(3000);
            ESP.restart();
            break;
    }
}

void publishOTAProgress(const char* status, int progress, const char* error) {
    StaticJsonDocument<256> doc;
    doc["status"] = status;
    doc["progress"] = progress;
    doc["error"] = error;
    
    char buffer[256];
    serializeJson(doc, buffer);
    
    char topic[64];
    snprintf(topic, sizeof(topic), "andon/ota/progress/%s", getMacAddress());
    
    mqttClient.publish(topic, buffer, true);
}
```

Add to `hardware/src/main.cpp`:

```cpp
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    // ... existing handlers ...
    
    if (strcmp(topic, "andon/ota/trigger") == 0) {
        char payloadStr[length + 1];
        memcpy(payloadStr, payload, length);
        payloadStr[length] = '\0';
        handleOTATrigger(payloadStr);
    }
}

void setup() {
    // ... existing setup ...
    
    // Subscribe to OTA trigger
    mqttClient.subscribe("andon/ota/trigger");
}
```

### Performance Considerations

**Backend Optimizations:**

1. **Static File Serving:**
   - Use FastAPI's `StaticFiles` with `html=False` for binary files
   - Configure nginx reverse proxy for production (better performance)
   - Enable gzip compression for JSON responses (not for .bin files)

2. **Database Queries:**
   - Use indexes on frequently queried fields (`version`, `device_id`, `started_at`)
   - Implement pagination for history endpoint
   - Use `select_related` for foreign key lookups

3. **MQTT Message Processing:**
   - Process messages asynchronously to avoid blocking
   - Use connection pooling for database access
   - Batch WebSocket broadcasts when multiple devices update simultaneously

**Frontend Optimizations:**

1. **Real-time Updates:**
   - Debounce progress bar updates (max 1 update per second per device)
   - Use React.memo for device list items
   - Virtualize long device lists (react-window)

2. **File Upload:**
   - Show upload progress with XHR progress events
   - Validate file size before upload
   - Cancel upload on component unmount

### Security Checklist

- [x] JWT authentication on all management endpoints
- [x] Input validation with Pydantic `extra="forbid"`
- [x] File size limits (100KB - 2MB)
- [x] Path traversal prevention
- [x] Rate limiting on trigger endpoint
- [x] No stack traces in error responses
- [x] Audit logging for all OTA operations
- [x] Firmware checksum validation (ESP32 side)
- [x] Automatic rollback on boot failure
- [x] HTTPS for GitHub downloads (external)
- [x] HTTP for ESP32 downloads (internal network, performance)

### Deployment Checklist

**Backend:**
- [ ] Set `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` in `.env`
- [ ] Set `GITHUB_TOKEN` if using private repository
- [ ] Create OTA storage directory: `mkdir -p /app/storage/ota/firmware`
- [ ] Run database migrations: `alembic upgrade head`
- [ ] Verify MQTT broker connectivity
- [ ] Test static file serving: `curl http://localhost:8000/static/ota/test.bin`

**Frontend:**
- [ ] Add OTA Settings tab to Settings page navigation
- [ ] Configure WebSocket connection for OTA events
- [ ] Test file upload with 1MB test file
- [ ] Verify progress dashboard updates in real-time

**ESP32 Firmware:**
- [ ] Update `FIRMWARE_VERSION` constant
- [ ] Test OTA update in development environment
- [ ] Verify rollback mechanism with intentionally broken firmware
- [ ] Test mesh propagation with multiple devices

**Monitoring:**
- [ ] Set up alerts for OTA failures (> 10% failure rate)
- [ ] Monitor firmware storage disk usage
- [ ] Track OTA update duration metrics
- [ ] Log MQTT message delivery failures


## Summary

This design document specifies a complete OTA (Over-The-Air) firmware management system for ESP32 devices in the ID Visual AX manufacturing system. The architecture follows a three-tier approach:

1. **Backend Layer (FastAPI):**
   - RESTful API for firmware management (upload, download, trigger)
   - GitHub integration for automatic firmware acquisition
   - Static HTTP file server for ESP32 downloads
   - MQTT handlers for device communication
   - PostgreSQL database for firmware metadata and update logs

2. **Frontend Layer (React):**
   - Settings tab for firmware version management
   - Manual upload modal with validation
   - Confirmation modal for mass updates
   - Real-time progress dashboard with WebSocket updates
   - Visual indicators for device status

3. **Device Layer (ESP32):**
   - MQTT command processing
   - HTTP firmware download with progress reporting
   - Checksum validation and installation
   - Automatic rollback on boot failure
   - Mesh network propagation

**Key Design Decisions:**

- **HTTP (not HTTPS) for ESP32 downloads:** Optimizes performance on resource-constrained devices in isolated internal network
- **MQTT QoS 1:** Ensures at-least-once delivery for critical OTA commands
- **Automatic rollback:** ESP32 bootloader provides safety net for failed updates
- **Rate limiting:** Prevents accidental mass update triggers
- **Dual testing approach:** Unit tests for specific cases, property-based tests for universal validation

**Integration Points:**

- Extends existing `mqtt_service.py` with OTA-specific topics
- Reuses `websocket_manager.py` for real-time frontend updates
- Leverages `esp_devices` table from IoT Device Management feature
- Adds new Settings sub-tab to existing frontend Settings page

**Security Measures:**

- JWT authentication on all management endpoints
- Strict input validation with Pydantic
- Path traversal prevention
- Rate limiting on trigger endpoint
- Comprehensive audit logging
- No sensitive data exposure in error messages

**Performance Targets:**

- Support 20+ concurrent firmware downloads
- < 500ms latency for MQTT message processing
- < 1s latency for WebSocket updates
- < 5min total update time per device (2MB firmware)

This design provides a robust, secure, and user-friendly OTA management system that scales to hundreds of ESP32 devices while maintaining reliability through automatic rollback and comprehensive error handling.

