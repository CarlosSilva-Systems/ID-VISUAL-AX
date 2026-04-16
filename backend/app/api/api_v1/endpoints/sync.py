from fastapi import APIRouter
import asyncio
import time

router = APIRouter()

# Contador atômico de versão — incrementa a cada mudança, sem colisão de timestamps
# Usar contador garante que TODA mudança gera uma versão diferente,
# independente de quantas mudanças ocorram no mesmo segundo.
_version_counter = int(time.time() * 1000)  # inicia com ms para evitar colisão após restart

_sync_state = {
    "odoo_version": str(int(time.time())),
    "requests_version": str(int(time.time())),
    "andon_version": str(_version_counter),
}


def update_sync_version(key: str):
    """
    Atualiza a versão de um domínio de dados.
    Para 'andon_version': usa contador incremental (garante unicidade mesmo
    com múltiplas mudanças no mesmo segundo) e agenda broadcast WebSocket.

    IMPORTANTE: deve ser chamado APÓS session.commit() para garantir que
    os dados já estão persistidos quando o frontend fizer o fetch.
    """
    global _version_counter
    if key == "andon_version":
        _version_counter += 1
        _sync_state[key] = str(_version_counter)
        _try_broadcast_andon()
    else:
        _sync_state[key] = str(int(time.time()))


def _try_broadcast_andon():
    """
    Agenda o broadcast WebSocket no event loop ativo.
    FastAPI sempre roda em um event loop async.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_do_broadcast())
    except RuntimeError:
        pass  # contexto síncrono (testes) — ignorar


async def _do_broadcast():
    """Envia 'andon_version_changed' para todos os clientes WebSocket conectados."""
    try:
        from app.services.websocket_manager import ws_manager
        await ws_manager.broadcast("andon_version_changed", {
            "version": _sync_state["andon_version"]
        })
    except Exception:
        pass


@router.get("/status")
async def get_sync_status():
    """
    Returns the current version/timestamp of different data domains.
    The frontend uses this to decide if a full fetch is needed.
    """
    return _sync_state
