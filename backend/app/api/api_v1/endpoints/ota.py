"""
Endpoints de API para OTA Management.

Este módulo define os endpoints REST para gerenciamento de firmware releases
e controle de atualizações OTA de dispositivos ESP32.
"""
import logging
from typing import List
import uuid

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_session, get_current_user, require_current_user
from app.core.config import settings
from app.models.user import User
from app.models.ota import FirmwareRelease, OTAUpdateLog, OTAStatus
from app.models.esp_device import ESPDevice, DeviceStatus
from app.schemas.ota import (
    FirmwareReleaseOut,
    CheckGitHubRequest,
    CheckGitHubResponse,
    DownloadGitHubRequest,
    TriggerOTARequest,
    TriggerOTAResponse,
    CancelOTAResponse,
    DeviceOTAStatus,
    OTAStatusResponse,
    OTAHistoryItem
)
from app.services.ota_service import OTAService
from app.services.github_client import GitHubClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ota", tags=["OTA Management"])


@router.get("/firmware/releases", response_model=List[FirmwareReleaseOut])
async def list_firmware_releases(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
    """
    Lista todas as versões de firmware disponíveis.
    
    Retorna releases ordenados por data de upload (mais recente primeiro),
    com informações sobre qual é a versão mais recente e quantos dispositivos
    estão rodando cada versão.
    """
    # Buscar todos os releases
    stmt = select(FirmwareRelease).order_by(FirmwareRelease.uploaded_at.desc())
    result = await session.execute(stmt)
    releases = result.scalars().all()
    
    if not releases:
        return []
    
    # Identificar versão mais recente
    latest_version = releases[0].version
    
    # Calcular device_count para cada release
    response = []
    for release in releases:
        # Contar dispositivos com esta versão (última atualização bem-sucedida)
        stmt_count = select(OTAUpdateLog).where(
            OTAUpdateLog.firmware_release_id == release.id,
            OTAUpdateLog.status == "success"
        )
        count_result = await session.execute(stmt_count)
        device_count = len(count_result.scalars().all())
        
        response.append(FirmwareReleaseOut(
            id=release.id,
            version=release.version,
            filename=release.filename,
            file_size=release.file_size,
            source=release.source.value,
            github_release_id=release.github_release_id,
            download_url=release.download_url,
            uploaded_at=release.uploaded_at,
            uploaded_by=release.uploaded_by,
            is_latest=(release.version == latest_version),
            device_count=device_count
        ))
    
    return response


@router.post("/firmware/check-github", response_model=CheckGitHubResponse)
async def check_github_for_updates(
    request: CheckGitHubRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
    """
    Verifica se há nova versão de firmware disponível no GitHub.
    
    Compara a versão mais recente no GitHub com a versão mais recente
    no banco de dados local.
    """
    github_client = GitHubClient()
    
    try:
        # Buscar release mais recente do GitHub
        release_data = await github_client.get_latest_release()
        github_version = release_data.get('tag_name', '').lstrip('v')
        
        # Buscar versão mais recente no banco
        stmt = select(FirmwareRelease).order_by(FirmwareRelease.uploaded_at.desc())
        result = await session.execute(stmt)
        latest_local = result.scalars().first()
        
        # Comparar versões
        update_available = False
        download_url = None
        
        if not latest_local or github_version != latest_local.version:
            update_available = True
            asset = github_client.extract_firmware_asset(release_data)
            if asset:
                download_url = asset['browser_download_url']
        
        logger.info(f"OTA: GitHub check - latest version: {github_version}")
        
        return CheckGitHubResponse(
            update_available=update_available,
            version=github_version if update_available else None,
            download_url=download_url
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OTA: GitHub check failed - {e}")
        raise HTTPException(503, "Falha ao consultar GitHub API")
    finally:
        await github_client.close()


@router.post("/firmware/download-github", response_model=FirmwareReleaseOut, status_code=201)
async def download_firmware_from_github(
    request: DownloadGitHubRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
    """
    Baixa firmware do GitHub Release.
    
    Se version não for especificada, baixa a versão mais recente.
    Se version for especificada, baixa a versão correspondente.
    """
    github_client = GitHubClient()
    ota_service = OTAService(session)
    
    try:
        # Buscar release
        if request.version:
            # Buscar release específico por tag
            tag = request.version if request.version.startswith('v') else f'v{request.version}'
            release_data = await github_client.get_release_by_tag(tag)
        else:
            # Buscar release mais recente
            release_data = await github_client.get_latest_release()
        
        # Baixar firmware
        release = await ota_service.download_firmware_from_github(
            release_data,
            current_user.username
        )
        
        # Calcular device_count
        stmt_count = select(OTAUpdateLog).where(
            OTAUpdateLog.firmware_release_id == release.id,
            OTAUpdateLog.status == "success"
        )
        count_result = await session.execute(stmt_count)
        device_count = len(count_result.scalars().all())
        
        return FirmwareReleaseOut(
            id=release.id,
            version=release.version,
            filename=release.filename,
            file_size=release.file_size,
            source=release.source.value,
            github_release_id=release.github_release_id,
            download_url=release.download_url,
            uploaded_at=release.uploaded_at,
            uploaded_by=release.uploaded_by,
            is_latest=True,  # Assumir que é a mais recente após download
            device_count=device_count
        )
    
    except HTTPException:
        raise
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        logger.exception(f"OTA: GitHub download failed [ref:{request_id}]: {e}")
        raise HTTPException(500, f"Erro ao baixar firmware [ref: {request_id}]")
    finally:
        await github_client.close()


@router.post("/firmware/upload", response_model=FirmwareReleaseOut, status_code=201)
async def upload_firmware_manually(
    file: UploadFile = File(...),
    version: str = Form(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
    """
    Upload manual de firmware via interface web.
    
    Aceita arquivo .bin e versão semântica (ex: 1.2.0).
    Valida tamanho (100KB - 2MB) e formato de versão.
    """
    ota_service = OTAService(session)
    
    # Salvar firmware
    release = await ota_service.save_uploaded_firmware(
        file,
        version,
        current_user.username
    )
    
    # Calcular device_count
    stmt_count = select(OTAUpdateLog).where(
        OTAUpdateLog.firmware_release_id == release.id,
        OTAUpdateLog.status == "success"
    )
    count_result = await session.execute(stmt_count)
    device_count = len(count_result.scalars().all())
    
    return FirmwareReleaseOut(
        id=release.id,
        version=release.version,
        filename=release.filename,
        file_size=release.file_size,
        source=release.source.value,
        github_release_id=release.github_release_id,
        download_url=release.download_url,
        uploaded_at=release.uploaded_at,
        uploaded_by=release.uploaded_by,
        is_latest=True,  # Assumir que é a mais recente após upload
        device_count=device_count
    )


@router.post("/trigger", response_model=TriggerOTAResponse, status_code=202)
async def trigger_ota_update(
    request: TriggerOTARequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
    """
    Dispara atualização OTA em massa para todos os dispositivos.
    
    Cria logs de atualização para cada dispositivo e publica comando MQTT.
    Rate limited a 1 requisição por segundo.
    """
    ota_service = OTAService(session)
    
    result = await ota_service.trigger_ota_update(
        request.firmware_release_id,
        current_user.username
    )
    
    return TriggerOTAResponse(
        message=result["message"],
        device_count=result["device_count"],
        root_device_count=result.get("root_device_count", 0),
        mesh_device_count=result.get("mesh_device_count", 0),
        target_version=result["target_version"]
    )


@router.post("/cancel", response_model=CancelOTAResponse)
async def cancel_ota_update(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
    """
    Cancela atualizações OTA pendentes (status downloading/installing).
    
    Marca todos os logs ativos como falha e publica comando MQTT de cancelamento.
    Dispositivos que já iniciaram o download não podem ser interrompidos remotamente —
    o firmware irá concluir o download mas não instalará se receber o comando de cancel.
    """
    ota_service = OTAService(session)
    result = await ota_service.cancel_ota_update(current_user.username)
    
    return CancelOTAResponse(
        message=result["message"],
        cancelled_count=result["cancelled_count"]
    )


@router.get("/devices/count")
async def get_online_device_count(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
    """
    Retorna a contagem de dispositivos ESP32, separados por status e tipo.
    
    Usado pelo modal de confirmação para exibir quantos dispositivos
    serão afetados pela atualização OTA.
    """
    stmt_all = select(ESPDevice)
    all_devices = (await session.execute(stmt_all)).scalars().all()

    online_devices = [d for d in all_devices if d.status == DeviceStatus.online]
    
    root_count = sum(1 for d in all_devices if d.is_root or d.connection_type == "wifi")
    mesh_count = sum(1 for d in all_devices if not d.is_root and d.connection_type != "wifi")
    
    return {
        "total": len(all_devices),
        "online": len(online_devices),
        "offline": len(all_devices) - len(online_devices),
        "root_count": root_count,
        "mesh_count": mesh_count
    }


@router.get("/devices/diagnostics")
async def get_ota_device_diagnostics(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
    """
    Diagnóstico completo: retorna todos os devices com status detalhado.
    Útil para depurar problemas de filtro online/offline e conectividade MQTT.
    """
    stmt_all = select(ESPDevice).order_by(ESPDevice.created_at.desc())
    all_devices = (await session.execute(stmt_all)).scalars().all()

    # Verificar se há logs OTA ativos
    stmt_active_ota = select(OTAUpdateLog).where(
        OTAUpdateLog.status.in_([OTAStatus.downloading, OTAStatus.installing])
    )
    active_ota_logs = (await session.execute(stmt_active_ota)).scalars().all()

    return {
        "total_devices": len(all_devices),
        "mqtt_broker": f"{settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT}",
        "backend_host": getattr(settings, 'BACKEND_HOST', 'localhost:8000'),
        "ota_storage_path": settings.OTA_STORAGE_PATH,
        "active_ota_updates": len(active_ota_logs),
        "devices": [
            {
                "mac_address": d.mac_address,
                "device_name": d.device_name,
                "status_raw": str(d.status),
                "status_value": d.status.value if hasattr(d.status, "value") else str(d.status),
                "status_type": type(d.status).__name__,
                "is_root": d.is_root,
                "connection_type": d.connection_type,
                "firmware_version": d.firmware_version,
                "last_seen_at": str(d.last_seen_at) if d.last_seen_at else None,
                "rssi": d.rssi,
                "ip_address": d.ip_address,
            }
            for d in all_devices
        ],
        "active_ota_logs": [
            {
                "device_id": str(log.device_id),
                "target_version": log.target_version,
                "status": log.status.value,
                "progress_percent": log.progress_percent,
                "started_at": str(log.started_at),
            }
            for log in active_ota_logs
        ]
    }


@router.get("/status", response_model=OTAStatusResponse)
async def get_ota_status(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
    """
    Retorna status de atualização de todos os dispositivos.
    
    Inclui versão atual, versão alvo, status, progresso e erros.
    """
    ota_service = OTAService(session)
    
    status_list = await ota_service.get_fleet_status()
    
    devices = [
        DeviceOTAStatus(
            device_id=s["device_id"],
            mac_address=s["mac_address"],
            device_name=s["device_name"],
            current_version=s["current_version"],
            target_version=s["target_version"],
            status=s["status"],
            progress_percent=s["progress_percent"],
            error_message=s["error_message"],
            started_at=s["started_at"],
            completed_at=s["completed_at"],
            is_root=s.get("is_root", False),
            connection_type=s.get("connection_type", "mesh"),
            device_status=s.get("device_status", "offline"),
        )
        for s in status_list
    ]
    
    return OTAStatusResponse(devices=devices)


@router.get("/history/{mac_address}", response_model=List[OTAHistoryItem])
async def get_device_ota_history(
    mac_address: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
    """
    Retorna histórico completo de atualizações de um dispositivo.
    
    Inclui todas as tentativas de atualização (sucesso e falha) ordenadas
    por data (mais recente primeiro).
    """
    ota_service = OTAService(session)
    
    history = await ota_service.get_device_history(mac_address)
    
    return [
        OTAHistoryItem(
            id=h["id"],
            firmware_release_id=h["firmware_release_id"],
            started_at=h["started_at"],
            completed_at=h["completed_at"],
            status=h["status"],
            progress_percent=h["progress_percent"],
            error_message=h["error_message"],
            previous_version=h["previous_version"],
            target_version=h["target_version"],
            duration_seconds=h["duration_seconds"]
        )
        for h in history
    ]


@router.delete("/firmware/{release_id}", status_code=204)
async def delete_firmware_release(
    release_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_current_user)
):
    """
    Deleta um firmware release.
    
    Remove o arquivo .bin do storage e o registro do banco de dados.
    """
    from pathlib import Path
    
    # Buscar release
    stmt = select(FirmwareRelease).where(FirmwareRelease.id == release_id)
    release = (await session.execute(stmt)).scalars().first()
    
    if not release:
        raise HTTPException(404, "Firmware release não encontrado")
    
    # Deletar arquivo do storage
    file_path = Path(release.local_path)
    if file_path.exists():
        file_path.unlink()
        logger.info(f"OTA: Deleted firmware file {file_path}")
    
    # Deletar registro do banco
    await session.delete(release)
    await session.commit()
    
    logger.info(f"OTA: Firmware release {release.version} deleted by user {current_user.username}")
    
    return None


