"""
Cliente para integração com GitHub API.

Este módulo implementa a comunicação com a API REST do GitHub para
buscar releases e baixar assets de firmware.
"""
import logging
from pathlib import Path
from typing import Optional
import httpx
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)


class GitHubClient:
    """Cliente para interação com GitHub API."""
    
    def __init__(self):
        """Inicializa o cliente GitHub com configurações do ambiente."""
        self.base_url = "https://api.github.com"
        self.owner = getattr(settings, "GITHUB_REPO_OWNER", "")
        self.repo = getattr(settings, "GITHUB_REPO_NAME", "")
        self.token = getattr(settings, "GITHUB_TOKEN", "")
        
        # Headers para autenticação (se token fornecido)
        self.headers = {}
        if self.token:
            self.headers["Authorization"] = f"Bearer {self.token}"
        
        self.client = httpx.AsyncClient(timeout=30.0, headers=self.headers)
    
    async def get_latest_release(self) -> dict:
        """
        Busca o release mais recente do repositório GitHub.
        
        Returns:
            dict: Dados do release incluindo tag_name, id, assets
            
        Raises:
            HTTPException: Se a API falhar ou não houver releases
        """
        if not self.owner or not self.repo:
            raise HTTPException(
                503,
                "Configuração GitHub incompleta. Defina GITHUB_REPO_OWNER e GITHUB_REPO_NAME"
            )
        
        url = f"{self.base_url}/repos/{self.owner}/{self.repo}/releases/latest"
        
        try:
            response = await self.client.get(url)
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"GitHub: Latest release fetched - {data.get('tag_name')}")
            return data
            
        except httpx.TimeoutException:
            logger.error("GitHub API timeout after 30s")
            raise HTTPException(503, "GitHub API não respondeu a tempo")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.error(f"GitHub: Repository or releases not found - {self.owner}/{self.repo}")
                raise HTTPException(503, "Repositório ou releases não encontrados no GitHub")
            logger.error(f"GitHub API error: {e.response.status_code}")
            raise HTTPException(503, "Erro ao consultar GitHub API")
        except Exception as e:
            logger.error(f"GitHub: Unexpected error - {e}")
            raise HTTPException(503, "Erro inesperado ao consultar GitHub")
    
    async def get_release_by_tag(self, tag: str) -> dict:
        """
        Busca um release específico por tag.
        
        Args:
            tag: Tag do release (ex: "v1.2.0" ou "1.2.0")
            
        Returns:
            dict: Dados do release
            
        Raises:
            HTTPException: Se o release não for encontrado
        """
        if not self.owner or not self.repo:
            raise HTTPException(
                503,
                "Configuração GitHub incompleta. Defina GITHUB_REPO_OWNER e GITHUB_REPO_NAME"
            )
        
        url = f"{self.base_url}/repos/{self.owner}/{self.repo}/releases/tags/{tag}"
        
        try:
            response = await self.client.get(url)
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"GitHub: Release {tag} fetched")
            return data
            
        except httpx.TimeoutException:
            logger.error(f"GitHub API timeout fetching release {tag}")
            raise HTTPException(503, "GitHub API não respondeu a tempo")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.error(f"GitHub: Release {tag} not found")
                raise HTTPException(404, f"Release {tag} não encontrado no GitHub")
            logger.error(f"GitHub API error: {e.response.status_code}")
            raise HTTPException(503, "Erro ao consultar GitHub API")
    
    def extract_firmware_asset(self, release_data: dict) -> Optional[dict]:
        """
        Extrai o primeiro asset .bin de um release.
        
        Args:
            release_data: Dados do release do GitHub
            
        Returns:
            dict com name, size, browser_download_url ou None se não encontrado
        """
        assets = release_data.get("assets", [])
        
        for asset in assets:
            if asset.get("name", "").endswith(".bin"):
                return {
                    "name": asset["name"],
                    "size": asset["size"],
                    "browser_download_url": asset["browser_download_url"]
                }
        
        return None
    
    async def download_asset(self, download_url: str, dest_path: Path, expected_size: int) -> None:
        """
        Baixa um asset do GitHub via streaming.
        
        Args:
            download_url: URL de download do asset
            dest_path: Caminho de destino para salvar o arquivo
            expected_size: Tamanho esperado do arquivo em bytes
            
        Raises:
            HTTPException: Se o download falhar ou tamanho não corresponder
        """
        try:
            # Criar diretório pai se não existir
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream('GET', download_url) as response:
                    response.raise_for_status()
                    
                    with open(dest_path, 'wb') as f:
                        async for chunk in response.aiter_bytes(chunk_size=8192):
                            f.write(chunk)
            
            # Validar tamanho do arquivo baixado
            actual_size = dest_path.stat().st_size
            if actual_size != expected_size:
                dest_path.unlink(missing_ok=True)
                logger.error(f"GitHub: Download size mismatch - expected {expected_size}, got {actual_size}")
                raise HTTPException(500, "Download incompleto - tamanho não corresponde")
            
            logger.info(f"GitHub: Asset downloaded successfully - {dest_path.name} ({actual_size} bytes)")
            
        except httpx.TimeoutException:
            dest_path.unlink(missing_ok=True)
            logger.error(f"GitHub: Download timeout after 300s - {download_url}")
            raise HTTPException(500, "Download de firmware excedeu o tempo limite")
        except httpx.HTTPStatusError as e:
            dest_path.unlink(missing_ok=True)
            logger.error(f"GitHub: Download HTTP error {e.response.status_code}")
            raise HTTPException(500, "Erro HTTP ao baixar firmware")
        except Exception as e:
            dest_path.unlink(missing_ok=True)
            logger.error(f"GitHub: Download failed - {e}")
            raise HTTPException(500, "Erro ao baixar firmware")
    
    async def close(self) -> None:
        """Fecha o cliente HTTP."""
        await self.client.aclose()
