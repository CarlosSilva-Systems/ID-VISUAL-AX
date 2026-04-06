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

# Tamanho mínimo e máximo aceitável para um firmware ESP32
_MIN_FIRMWARE_SIZE = 100 * 1024       # 100 KB
_MAX_FIRMWARE_SIZE = 4 * 1024 * 1024  # 4 MB


class GitHubClient:
    """Cliente para interação com GitHub API."""

    def __init__(self) -> None:
        self.base_url = "https://api.github.com"
        self.owner: str = getattr(settings, "GITHUB_REPO_OWNER", "")
        self.repo: str = getattr(settings, "GITHUB_REPO_NAME", "")
        self.token: str = getattr(settings, "GITHUB_TOKEN", "")

        headers: dict[str, str] = {"Accept": "application/vnd.github+json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        # Cliente reutilizável para chamadas à API (sem follow_redirects — a API
        # do GitHub não redireciona nas rotas /repos/…)
        self._api_client = httpx.AsyncClient(
            timeout=30.0,
            headers=headers,
            follow_redirects=True,
        )

    # ─── helpers ────────────────────────────────────────────────────────────

    def _check_config(self) -> None:
        if not self.owner or not self.repo:
            raise HTTPException(
                503,
                "Configuração GitHub incompleta. Defina GITHUB_REPO_OWNER e GITHUB_REPO_NAME",
            )

    # ─── API calls ──────────────────────────────────────────────────────────

    async def get_latest_release(self) -> dict:
        """Busca o release mais recente do repositório."""
        self._check_config()
        url = f"{self.base_url}/repos/{self.owner}/{self.repo}/releases/latest"
        try:
            response = await self._api_client.get(url)
            response.raise_for_status()
            data: dict = response.json()
            logger.info("GitHub: latest release fetched — %s", data.get("tag_name"))
            return data
        except httpx.TimeoutException:
            logger.error("GitHub API timeout (30s)")
            raise HTTPException(503, "GitHub API não respondeu a tempo")
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status == 404:
                logger.error("GitHub: repo/releases not found — %s/%s", self.owner, self.repo)
                raise HTTPException(503, "Repositório ou releases não encontrados no GitHub")
            logger.error("GitHub API error %s", status)
            raise HTTPException(503, "Erro ao consultar GitHub API")
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("GitHub: unexpected error — %s", exc)
            raise HTTPException(503, "Erro inesperado ao consultar GitHub")

    async def get_release_by_tag(self, tag: str) -> dict:
        """Busca um release específico por tag (ex: 'v1.0.0')."""
        self._check_config()
        url = f"{self.base_url}/repos/{self.owner}/{self.repo}/releases/tags/{tag}"
        try:
            response = await self._api_client.get(url)
            response.raise_for_status()
            data: dict = response.json()
            logger.info("GitHub: release %s fetched", tag)
            return data
        except httpx.TimeoutException:
            logger.error("GitHub API timeout fetching release %s", tag)
            raise HTTPException(503, "GitHub API não respondeu a tempo")
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status == 404:
                logger.error("GitHub: release %s not found", tag)
                raise HTTPException(404, f"Release {tag} não encontrado no GitHub")
            logger.error("GitHub API error %s", status)
            raise HTTPException(503, "Erro ao consultar GitHub API")
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("GitHub: unexpected error — %s", exc)
            raise HTTPException(503, "Erro inesperado ao consultar GitHub")

    # ─── asset helpers ──────────────────────────────────────────────────────

    def extract_firmware_asset(self, release_data: dict) -> Optional[dict]:
        """Retorna o primeiro asset .bin do release, ou None."""
        for asset in release_data.get("assets", []):
            if asset.get("name", "").endswith(".bin"):
                return {
                    "name": asset["name"],
                    "size": asset["size"],
                    "browser_download_url": asset["browser_download_url"],
                }
        return None

    async def download_asset(
        self,
        download_url: str,
        dest_path: Path,
        expected_size: int,
    ) -> None:
        """
        Baixa um asset do GitHub via streaming com follow_redirects.

        O GitHub redireciona assets para o CDN (302 → S3/CDN), por isso
        follow_redirects=True é obrigatório aqui.

        A validação de tamanho usa uma tolerância de ±5% para cobrir
        diferenças entre o tamanho reportado pela API e o arquivo real.
        """
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=5.0),
                follow_redirects=True,
            ) as client:
                async with client.stream("GET", download_url) as response:
                    response.raise_for_status()

                    with open(dest_path, "wb") as fh:
                        async for chunk in response.aiter_bytes(chunk_size=8192):
                            fh.write(chunk)

            actual_size = dest_path.stat().st_size

            # Validar tamanho mínimo/máximo
            if actual_size < _MIN_FIRMWARE_SIZE:
                dest_path.unlink(missing_ok=True)
                logger.error("GitHub: firmware too small — %d bytes", actual_size)
                raise HTTPException(500, "Arquivo de firmware muito pequeno (< 100 KB)")

            if actual_size > _MAX_FIRMWARE_SIZE:
                dest_path.unlink(missing_ok=True)
                logger.error("GitHub: firmware too large — %d bytes", actual_size)
                raise HTTPException(500, "Arquivo de firmware muito grande (> 4 MB)")

            # Tolerância de ±5% em relação ao tamanho reportado pela API
            if expected_size > 0:
                tolerance = expected_size * 0.05
                if abs(actual_size - expected_size) > tolerance:
                    dest_path.unlink(missing_ok=True)
                    logger.error(
                        "GitHub: size mismatch — expected %d, got %d",
                        expected_size,
                        actual_size,
                    )
                    raise HTTPException(500, "Download incompleto — tamanho não corresponde")

            logger.info(
                "GitHub: asset downloaded — %s (%d bytes)", dest_path.name, actual_size
            )

        except httpx.TimeoutException:
            dest_path.unlink(missing_ok=True)
            logger.error("GitHub: download timeout — %s", download_url)
            raise HTTPException(500, "Download de firmware excedeu o tempo limite")
        except httpx.HTTPStatusError as exc:
            dest_path.unlink(missing_ok=True)
            logger.error("GitHub: download HTTP error %s", exc.response.status_code)
            raise HTTPException(500, f"Erro HTTP {exc.response.status_code} ao baixar firmware")
        except HTTPException:
            raise
        except Exception as exc:
            dest_path.unlink(missing_ok=True)
            logger.exception("GitHub: download failed — %s", exc)
            raise HTTPException(500, "Erro inesperado ao baixar firmware")

    async def close(self) -> None:
        """Fecha o cliente HTTP reutilizável."""
        await self._api_client.aclose()
