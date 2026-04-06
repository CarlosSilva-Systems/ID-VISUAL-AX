"""
Serviço de gerenciamento de OTA (Over-The-Air) updates.

Este módulo implementa a lógica de negócio para gerenciamento de firmware releases,
download do GitHub, upload manual, e orquestração de atualizações OTA.
"""
import logging
import re
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException, UploadFile
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.models.ota import FirmwareRelease, FirmwareSource, OTAUpdateLog, OTAStatus
from app.models.esp_device import ESPDevice
from app.services.github_client import GitHubClient
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)


class OTAService:
    """Serviço de gerenciamento de OTA updates."""
    
    def __init__(self, session: AsyncSession):
        """
        Inicializa o serviço OTA.
        
        Args:
            session: Sessão assíncrona do banco de dados
        """
        self.session = session
        self.github_client = GitHubClient()
        self.storage_path = Path(settings.OTA_STORAGE_PATH)
        
        # Criar diretório de storage se não existir
        self.storage_path.mkdir(parents=True, exist_ok=True)
    
    def validate_firmware_file(self, file: UploadFile) -> None:
        """
        Valida arquivo de firmware enviado.
        
        Args:
            file: Arquivo enviado via upload
            
        Raises:
            HTTPException: Se validação falhar
        """
        # Validar extensão
        if not file.filename or not file.filename.endswith('.bin'):
            raise HTTPException(422, "Arquivo deve ter extensão .bin")
        
        # Validar nome do arquivo (sem path traversal)
        if '..' in file.filename or '/' in file.filename or '\\' in file.filename:
            raise HTTPException(422, "Nome de arquivo inválido - caracteres não permitidos")
        
        # Validar tamanho (será validado durante leitura)
        # O tamanho será verificado ao ler o conteúdo do arquivo
    
    def validate_version(self, version: str) -> None:
        """
        Valida formato de versão semântica.
        
        Args:
            version: String de versão a validar
            
        Raises:
            HTTPException: Se formato for inválido
        """
        if not re.match(r'^\d+\.\d+\.\d+$', version):
            raise HTTPException(422, "Versão deve seguir formato semântico (ex: 1.2.0)")
    
    async def save_uploaded_firmware(
        self, 
        file: UploadFile, 
        version: str, 
        username: str
    ) -> FirmwareRelease:
        """
        Salva firmware enviado manualmente.
        
        Args:
            file: Arquivo .bin enviado
            version: Versão do firmware
            username: Usuário que fez o upload
            
        Returns:
            FirmwareRelease criado
            
        Raises:
            HTTPException: Se validação falhar ou versão já existir
        """
        # Validar arquivo e versão
        self.validate_firmware_file(file)
        self.validate_version(version)
        
        # Verificar unicidade de versão
        stmt = select(FirmwareRelease).where(FirmwareRelease.version == version)
        existing = (await self.session.execute(stmt)).scalars().first()
        if existing:
            raise HTTPException(409, f"Versão {version} já existe")
        
        # Ler conteúdo do arquivo
        content = await file.read()
        file_size = len(content)
        
        # Validar tamanho (100KB - 2MB)
        if file_size < 100 * 1024:
            raise HTTPException(422, "Arquivo muito pequeno (mínimo 100KB)")
        if file_size > 2 * 1024 * 1024:
            raise HTTPException(422, "Arquivo muito grande (máximo 2MB)")
        
        # Salvar arquivo
        filename = f"firmware-{version}.bin"
        file_path = self.storage_path / filename
        
        with open(file_path, 'wb') as f:
            f.write(content)
        
        # Criar registro no banco
        release = FirmwareRelease(
            version=version,
            filename=filename,
            file_size=file_size,
            source=FirmwareSource.manual_upload,
            local_path=str(file_path),
            uploaded_by=username
        )
        
        self.session.add(release)
        await self.session.commit()
        await self.session.refresh(release)
        
        logger.info(f"OTA: Firmware {version} uploaded manually by user {username}")
        
        return release
    
    async def download_firmware_from_github(
        self, 
        release_info: dict, 
        username: str
    ) -> FirmwareRelease:
        """
        Baixa firmware do GitHub Release.
        
        Args:
            release_info: Dados do release do GitHub
            username: Usuário que solicitou o download
            
        Returns:
            FirmwareRelease criado
            
        Raises:
            HTTPException: Se download falhar ou versão já existir
        """
        # Extrair informações do release
        version = release_info.get('tag_name', '').lstrip('v')
        github_release_id = release_info.get('id')
        
        # Validar versão
        self.validate_version(version)
        
        # Verificar unicidade de versão
        stmt = select(FirmwareRelease).where(FirmwareRelease.version == version)
        existing = (await self.session.execute(stmt)).scalars().first()
        if existing:
            raise HTTPException(409, f"Versão {version} já existe")
        
        # Extrair asset .bin
        asset = self.github_client.extract_firmware_asset(release_info)
        if not asset:
            raise HTTPException(500, "Nenhum arquivo .bin encontrado no release")
        
        # Preparar caminho de destino
        filename = f"firmware-{version}.bin"
        file_path = self.storage_path / filename
        
        # Baixar arquivo
        try:
            await self.github_client.download_asset(
                asset['browser_download_url'],
                file_path,
                asset['size']
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"OTA: GitHub download failed - {e}")
            raise HTTPException(500, f"Erro ao baixar firmware: {str(e)}")
        
        # Criar registro no banco
        release = FirmwareRelease(
            version=version,
            filename=filename,
            file_size=asset['size'],
            source=FirmwareSource.github,
            github_release_id=github_release_id,
            download_url=asset['browser_download_url'],
            local_path=str(file_path),
            uploaded_by=username
        )
        
        self.session.add(release)
        await self.session.commit()
        await self.session.refresh(release)
        
        logger.info(f"OTA: Firmware {version} downloaded from GitHub by user {username}")
        
        return release
    
    async def trigger_ota_update(
        self, 
        firmware_release_id: uuid.UUID, 
        username: str
    ) -> dict:
        """
        Dispara atualização OTA em massa para todos os dispositivos.
        
        Args:
            firmware_release_id: ID do firmware release a instalar
            username: Usuário que disparou a atualização
            
        Returns:
            Dict com mensagem e contagem de dispositivos
            
        Raises:
            HTTPException: Se firmware não existir ou arquivo não for encontrado
        """
        # Buscar firmware release
        stmt = select(FirmwareRelease).where(FirmwareRelease.id == firmware_release_id)
        release = (await self.session.execute(stmt)).scalars().first()
        
        if not release:
            raise HTTPException(404, "Firmware release não encontrado")
        
        # Validar que arquivo existe no storage
        file_path = Path(release.local_path)
        if not file_path.exists():
            logger.error(f"OTA: Firmware file not found - {file_path}")
            raise HTTPException(500, "Arquivo de firmware não encontrado no storage")
        
        # Buscar todos os dispositivos ESP32
        stmt_devices = select(ESPDevice)
        result = await self.session.execute(stmt_devices)
        devices = result.scalars().all()
        
        if not devices:
            raise HTTPException(400, "Nenhum dispositivo ESP32 cadastrado")
        
        # Criar logs de atualização para cada dispositivo
        for device in devices:
            # Buscar versão anterior (última atualização bem-sucedida)
            stmt_prev = select(OTAUpdateLog).where(
                OTAUpdateLog.device_id == device.id,
                OTAUpdateLog.status == OTAStatus.success
            ).order_by(OTAUpdateLog.completed_at.desc())
            prev_log = (await self.session.execute(stmt_prev)).scalars().first()
            previous_version = prev_log.target_version if prev_log else None
            
            # Criar novo log
            log = OTAUpdateLog(
                device_id=device.id,
                firmware_release_id=firmware_release_id,
                status=OTAStatus.downloading,
                progress_percent=0,
                previous_version=previous_version,
                target_version=release.version
            )
            self.session.add(log)
        
        await self.session.commit()
        
        # Construir payload MQTT
        backend_host = getattr(settings, 'BACKEND_HOST', 'localhost:8000')
        firmware_url = f"http://{backend_host}/static/ota/{release.filename}"
        
        payload = {
            "version": release.version,
            "url": firmware_url,
            "size": release.file_size
        }
        
        # Publicar comando MQTT (best-effort — falha não bloqueia o trigger)
        import json
        mqtt_payload = json.dumps(payload)
        mqtt_published = False
        try:
            import aiomqtt
            mqtt_host = settings.MQTT_BROKER_HOST
            mqtt_port = int(settings.MQTT_BROKER_PORT)
            async with aiomqtt.Client(hostname=mqtt_host, port=mqtt_port) as client:
                await client.publish("andon/ota/trigger", mqtt_payload, qos=1)
            mqtt_published = True
            logger.info(f"OTA: MQTT trigger published for version {release.version}")
        except ImportError:
            logger.warning("OTA: aiomqtt não instalado — trigger salvo no banco, MQTT ignorado")
        except Exception as e:
            logger.error(f"OTA: MQTT publish failed — {e}. Trigger registrado no banco.")
        
        # Emitir evento WebSocket
        await ws_manager.broadcast("ota_triggered", {
            "version": release.version,
            "device_count": len(devices)
        })
        
        logger.info(f"OTA: Update triggered for version {release.version} by user {username}")
        
        return {
            "message": f"Atualização OTA disparada para {len(devices)} dispositivos",
            "device_count": len(devices),
            "target_version": release.version
        }    
    async def get_fleet_status(self) -> list[dict]:
        """
        Retorna status de atualização de todos os dispositivos.
        
        Returns:
            Lista de dicts com status de cada dispositivo
        """
        # Buscar todos os dispositivos
        stmt = select(ESPDevice)
        result = await self.session.execute(stmt)
        devices = result.scalars().all()
        
        status_list = []
        
        for device in devices:
            # Buscar versão atual (última atualização bem-sucedida)
            stmt_current = select(OTAUpdateLog).where(
                OTAUpdateLog.device_id == device.id,
                OTAUpdateLog.status == OTAStatus.success
            ).order_by(OTAUpdateLog.completed_at.desc())
            current_log = (await self.session.execute(stmt_current)).scalars().first()
            current_version = current_log.target_version if current_log else None
            
            # Buscar log mais recente (qualquer status)
            stmt_latest = select(OTAUpdateLog).where(
                OTAUpdateLog.device_id == device.id
            ).order_by(OTAUpdateLog.started_at.desc())
            latest_log = (await self.session.execute(stmt_latest)).scalars().first()
            
            if latest_log:
                status_list.append({
                    "device_id": device.id,
                    "mac_address": device.mac_address,
                    "device_name": device.device_name,
                    "current_version": current_version,
                    "target_version": latest_log.target_version,
                    "status": latest_log.status.value,
                    "progress_percent": latest_log.progress_percent,
                    "error_message": latest_log.error_message,
                    "started_at": latest_log.started_at,
                    "completed_at": latest_log.completed_at
                })
        
        return status_list
    
    async def get_device_history(self, mac_address: str) -> list[dict]:
        """
        Retorna histórico de atualizações de um dispositivo.
        
        Args:
            mac_address: MAC address do dispositivo
            
        Returns:
            Lista de dicts com histórico de atualizações
            
        Raises:
            HTTPException: Se dispositivo não for encontrado
        """
        # Buscar dispositivo
        stmt = select(ESPDevice).where(ESPDevice.mac_address == mac_address)
        device = (await self.session.execute(stmt)).scalars().first()
        
        if not device:
            raise HTTPException(404, "Dispositivo não encontrado")
        
        # Buscar histórico de logs
        stmt_logs = select(OTAUpdateLog).where(
            OTAUpdateLog.device_id == device.id
        ).order_by(OTAUpdateLog.started_at.desc())
        result = await self.session.execute(stmt_logs)
        logs = result.scalars().all()
        
        history = []
        for log in logs:
            # Calcular duração em segundos
            duration_seconds = None
            if log.completed_at and log.started_at:
                duration_seconds = int((log.completed_at - log.started_at).total_seconds())
            
            history.append({
                "id": log.id,
                "firmware_release_id": log.firmware_release_id,
                "started_at": log.started_at,
                "completed_at": log.completed_at,
                "status": log.status.value,
                "progress_percent": log.progress_percent,
                "error_message": log.error_message,
                "previous_version": log.previous_version,
                "target_version": log.target_version,
                "duration_seconds": duration_seconds
            })
        
        return history

