"""
Endpoint de diagnóstico de performance e integração com Odoo.
Permite monitorar carga no servidor Odoo e identificar gargalos.
"""
from typing import Any, Dict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
import time
import logging

from app.api.deps import get_session, get_odoo_client, get_current_user
from app.services.cache_service import get_cache
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/odoo-performance", response_model=Dict[str, Any])
async def get_odoo_performance_metrics(
    session: AsyncSession = Depends(get_session),
    odoo: Any = Depends(get_odoo_client),
    current_user: Any = Depends(get_current_user)
):
    """
    Diagnóstico de performance da integração com Odoo.
    
    Testa tempo de resposta de operações comuns e retorna métricas de cache.
    Útil para identificar se o app está causando lentidão no Odoo.
    
    Returns:
        - odoo_connection: Status da conexão
        - response_times: Tempo de resposta de operações (ms)
        - cache_stats: Estatísticas de uso do cache
        - recommendations: Recomendações de otimização
    """
    metrics = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "odoo_url": settings.ODOO_URL,
        "odoo_db": settings.ODOO_DB,
        "odoo_connection": "unknown",
        "response_times_ms": {},
        "cache_stats": {},
        "recommendations": []
    }
    
    try:
        # 1. Teste de conectividade básica
        start = time.time()
        try:
            # Tenta buscar 1 workcenter para testar conexão
            await odoo.search_read('mrp.workcenter', domain=[], fields=['id'], limit=1)
            metrics["odoo_connection"] = "ok"
            metrics["response_times_ms"]["connectivity_test"] = round((time.time() - start) * 1000, 2)
        except Exception as e:
            metrics["odoo_connection"] = "error"
            metrics["error"] = str(e)
            logger.error(f"Odoo connectivity test failed: {e}")
        
        # 2. Teste de operações comuns (apenas se conexão OK)
        if metrics["odoo_connection"] == "ok":
            # Teste: Buscar workcenters
            start = time.time()
            try:
                await odoo.get_workcenters()
                metrics["response_times_ms"]["get_workcenters"] = round((time.time() - start) * 1000, 2)
            except Exception as e:
                metrics["response_times_ms"]["get_workcenters"] = "error"
                logger.warning(f"get_workcenters test failed: {e}")
            
            # Teste: Buscar workorders (limit 10)
            start = time.time()
            try:
                await odoo.search_read(
                    'mrp.workorder',
                    domain=[['state', 'in', ['progress', 'ready']]],
                    fields=['id', 'name'],
                    limit=10
                )
                metrics["response_times_ms"]["search_workorders_limit10"] = round((time.time() - start) * 1000, 2)
            except Exception as e:
                metrics["response_times_ms"]["search_workorders_limit10"] = "error"
                logger.warning(f"search_workorders test failed: {e}")
            
            # Teste: Buscar activities (limit 10)
            start = time.time()
            try:
                await odoo.search_read(
                    'mail.activity',
                    domain=[['res_model', '=', 'mrp.production']],
                    fields=['id', 'summary'],
                    limit=10
                )
                metrics["response_times_ms"]["search_activities_limit10"] = round((time.time() - start) * 1000, 2)
            except Exception as e:
                metrics["response_times_ms"]["search_activities_limit10"] = "error"
                logger.warning(f"search_activities test failed: {e}")
        
        # 3. Estatísticas de cache
        cache = get_cache()
        metrics["cache_stats"] = await cache.get_stats()
        
        # 4. Análise e recomendações
        recommendations = []
        
        # Recomendação: Cache hit rate baixo
        if metrics["cache_stats"].get("hit_rate_percent", 0) < 50:
            recommendations.append({
                "severity": "warning",
                "message": "Taxa de acerto do cache está baixa (< 50%). Considere aumentar o TTL do cache.",
                "action": "Aumentar TTL do cache de 30s para 60s em endpoints de polling."
            })
        
        # Recomendação: Tempo de resposta alto
        for operation, time_ms in metrics["response_times_ms"].items():
            if isinstance(time_ms, (int, float)) and time_ms > 1000:
                recommendations.append({
                    "severity": "critical",
                    "message": f"Operação '{operation}' está lenta ({time_ms}ms > 1000ms).",
                    "action": "Verificar carga no servidor Odoo ou adicionar índices no banco de dados."
                })
            elif isinstance(time_ms, (int, float)) and time_ms > 500:
                recommendations.append({
                    "severity": "warning",
                    "message": f"Operação '{operation}' está moderadamente lenta ({time_ms}ms > 500ms).",
                    "action": "Considere adicionar cache ou otimizar a query."
                })
        
        # Recomendação: Conexão com erro
        if metrics["odoo_connection"] != "ok":
            recommendations.append({
                "severity": "critical",
                "message": "Falha na conexão com Odoo.",
                "action": "Verificar ODOO_URL, ODOO_DB, ODOO_SERVICE_LOGIN e ODOO_SERVICE_PASSWORD no .env."
            })
        
        # Recomendação: Tudo OK
        if not recommendations and metrics["odoo_connection"] == "ok":
            recommendations.append({
                "severity": "info",
                "message": "Integração com Odoo está funcionando corretamente.",
                "action": "Nenhuma ação necessária."
            })
        
        metrics["recommendations"] = recommendations
        
        return metrics
        
    except Exception as e:
        logger.exception(f"Error in odoo_performance_metrics: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao coletar métricas de performance: {str(e)}"
        )


@router.get("/cache-stats", response_model=Dict[str, Any])
async def get_cache_statistics(
    current_user: Any = Depends(get_current_user)
):
    """
    Retorna estatísticas detalhadas do cache em memória.
    
    Returns:
        - entries: Número de entradas no cache
        - hits: Número de cache hits
        - misses: Número de cache misses
        - hit_rate_percent: Taxa de acerto (%)
    """
    cache = get_cache()
    stats = await cache.get_stats()
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **stats
    }


@router.post("/cache-clear", response_model=Dict[str, str])
async def clear_cache(
    current_user: Any = Depends(get_current_user)
):
    """
    Limpa todo o cache em memória.
    
    Útil para forçar atualização de dados do Odoo após mudanças manuais.
    """
    cache = get_cache()
    await cache.clear()
    logger.info(f"Cache cleared by user {current_user.username if hasattr(current_user, 'username') else 'unknown'}")
    return {
        "status": "success",
        "message": "Cache limpo com sucesso. Próximas requisições buscarão dados atualizados do Odoo."
    }


@router.post("/cache-cleanup", response_model=Dict[str, Any])
async def cleanup_expired_cache(
    current_user: Any = Depends(get_current_user)
):
    """
    Remove apenas entradas expiradas do cache (manutenção).
    
    Returns:
        - removed_entries: Número de entradas removidas
    """
    cache = get_cache()
    removed = await cache.cleanup_expired()
    logger.info(f"Cache cleanup: {removed} expired entries removed by user {current_user.username if hasattr(current_user, 'username') else 'unknown'}")
    return {
        "status": "success",
        "removed_entries": removed,
        "message": f"{removed} entradas expiradas foram removidas do cache."
    }
