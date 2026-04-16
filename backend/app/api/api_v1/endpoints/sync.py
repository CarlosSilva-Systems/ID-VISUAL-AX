from fastapi import APIRouter, Depends
from datetime import datetime
import asyncio
import time

router = APIRouter()

# Global state for sync (simple implementation for now)
# In production, this would be tied to DB triggers or a cache layer like Redis
_sync_state = {
    "odoo_version": str(int(time.time())),
    "requests_version": str(int(time.time())),
    "andon_version": str(int(time.time()))
}

def update_sync_version(key: str):
    _sync_state[key] = str(int(time.time()))
    # Notificar clientes WebSocket do Andon TV imediatamente quando andon_version muda
    if key == "andon_version":
        _schedule_andon_broadcast()

def _schedule_andon_broadcast():
    """
    Agenda o broadcast WebSocket de forma segura, sem bloquear a thread síncrona.
    Usa o event loop em execução se disponível.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_broadcast_andon_version_changed())
    except RuntimeError:
        # Sem event loop ativo — contexto síncrono, ignorar silenciosamente
        pass

async def _broadcast_andon_version_changed():
    """Envia evento WebSocket para todos os clientes do Andon TV."""
    try:
        from app.services.websocket_manager import ws_manager
        await ws_manager.broadcast("andon_version_changed", {
            "version": _sync_state["andon_version"]
        })
    except Exception:
        pass  # Broadcast nunca deve quebrar o fluxo principal

@router.get("/status")
async def get_sync_status():
    """
    Returns the current version/timestamp of different data domains.
    The frontend uses this to decide if a full fetch is needed.
    """
    return _sync_state
