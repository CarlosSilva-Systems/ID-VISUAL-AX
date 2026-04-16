from fastapi import APIRouter
import asyncio
import time

router = APIRouter()

# Global state for sync (simple implementation for now)
_sync_state = {
    "odoo_version": str(int(time.time())),
    "requests_version": str(int(time.time())),
    "andon_version": str(int(time.time()))
}


def update_sync_version(key: str):
    """
    Atualiza a versão de um domínio de dados.
    Quando a chave é 'andon_version', agenda broadcast WebSocket imediato
    para notificar o Andon TV sem esperar o próximo ciclo de polling.

    IMPORTANTE: deve ser chamado APÓS o session.commit() para garantir que
    os dados já estão persistidos quando o frontend fizer o fetch.
    """
    _sync_state[key] = str(int(time.time()))
    if key == "andon_version":
        _try_broadcast_andon()


def _try_broadcast_andon():
    """
    Tenta agendar o broadcast WebSocket no event loop ativo.
    FastAPI sempre roda em um event loop async, então get_running_loop()
    deve funcionar em todos os endpoints.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_do_broadcast())
    except RuntimeError:
        # Sem event loop (ex: testes síncronos) — ignorar silenciosamente
        pass


async def _do_broadcast():
    """Envia 'andon_version_changed' para todos os clientes WebSocket conectados."""
    try:
        from app.services.websocket_manager import ws_manager
        await ws_manager.broadcast("andon_version_changed", {
            "version": _sync_state["andon_version"]
        })
    except Exception:
        pass  # Broadcast nunca deve quebrar o fluxo principal


async def broadcast_andon_now():
    """
    Versão awaitable para uso direto em handlers async.
    Garante que o broadcast acontece imediatamente, sem agendamento.
    Use quando precisar de garantia de ordem (ex: logo após session.commit()).
    """
    await _do_broadcast()


@router.get("/status")
async def get_sync_status():
    """
    Returns the current version/timestamp of different data domains.
    The frontend uses this to decide if a full fetch is needed.
    """
    return _sync_state
