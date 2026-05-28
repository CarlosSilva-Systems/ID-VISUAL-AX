"""Endpoint temporário para debug de duplicatas - REMOVER APÓS INVESTIGAÇÃO."""
from fastapi import APIRouter, Depends
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

from app.api.deps import get_session
from app.models.andon import AndonCall

router = APIRouter()


@router.get("/debug/andon-duplicates")
async def debug_andon_duplicates(
    hours: int = 2,
    session: AsyncSession = Depends(get_session)
) -> Dict[str, Any]:
    """
    Endpoint temporário para investigar duplicatas de chamados Andon.
    
    Retorna todos os chamados das últimas N horas e identifica possíveis duplicatas.
    """
    threshold = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
    
    stmt = select(AndonCall).where(
        AndonCall.created_at >= threshold
    ).order_by(AndonCall.created_at.desc())
    
    result = await session.execute(stmt)
    calls = result.scalars().all()
    
    # Agrupar por workcenter + color + minuto para detectar duplicatas
    groups: Dict[tuple, List[AndonCall]] = {}
    for call in calls:
        # Agrupar por workcenter, cor e minuto (ignorar segundos)
        minute_key = call.created_at.replace(second=0, microsecond=0)
        key = (call.workcenter_id, call.color, minute_key.isoformat())
        if key not in groups:
            groups[key] = []
        groups[key].append(call)
    
    # Identificar duplicatas
    duplicates = []
    for key, group in groups.items():
        if len(group) > 1:
            wc_id, color, minute = key
            duplicates.append({
                "workcenter_id": wc_id,
                "color": color,
                "minute": minute,
                "count": len(group),
                "calls": [
                    {
                        "id": c.id,
                        "created_at": c.created_at.isoformat(),
                        "status": c.status,
                        "triggered_by": c.triggered_by,
                        "reason": c.reason
                    }
                    for c in group
                ]
            })
    
    # Todos os chamados
    all_calls = [
        {
            "id": c.id,
            "workcenter_id": c.workcenter_id,
            "color": c.color,
            "status": c.status,
            "created_at": c.created_at.isoformat(),
            "triggered_by": c.triggered_by,
            "reason": c.reason
        }
        for c in calls
    ]
    
    return {
        "total_calls": len(calls),
        "hours_analyzed": hours,
        "duplicates_found": len(duplicates),
        "duplicates": duplicates,
        "all_calls": all_calls
    }


@router.get("/debug/mqtt-logs")
async def debug_mqtt_logs() -> Dict[str, Any]:
    """
    Endpoint temporário para ver logs MQTT recentes.
    
    Retorna os últimos logs do handler MQTT para debug.
    """
    import logging
    
    # Capturar logs do logger mqtt_service
    mqtt_logger = logging.getLogger("app.services.mqtt_service")
    
    # Retornar informações sobre o estado atual
    from app.services.mqtt_service import _button_dedup, _BUTTON_DEDUP_WINDOW_S
    
    return {
        "debounce_window_seconds": _BUTTON_DEDUP_WINDOW_S,
        "current_dedup_state": {
            mac: {color: f"{ts:.3f}" for color, ts in colors.items()}
            for mac, colors in _button_dedup.items()
        },
        "message": "Aperte o botão e chame este endpoint novamente para ver o estado atualizado"
    }
