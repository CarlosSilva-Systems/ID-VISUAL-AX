"""
Sistema de cache em memória com TTL para otimizar chamadas ao Odoo.
Reduz carga no servidor Odoo e melhora tempo de resposta do app.
"""
from typing import Any, Optional, Callable, TypeVar
from datetime import datetime, timedelta, timezone
from functools import wraps
import asyncio
import hashlib
import json
import logging

logger = logging.getLogger(__name__)

T = TypeVar('T')

class CacheEntry:
    """Entrada de cache com timestamp de expiração."""
    def __init__(self, value: Any, ttl_seconds: int):
        self.value = value
        self.expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    
    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) >= self.expires_at


class MemoryCache:
    """
    Cache em memória thread-safe com TTL por entrada.
    Usado para cachear respostas de endpoints Odoo e reduzir carga no servidor.
    """
    def __init__(self):
        self._cache: dict[str, CacheEntry] = {}
        self._lock = asyncio.Lock()
        self._hits = 0
        self._misses = 0
    
    async def get(self, key: str) -> Optional[Any]:
        """Busca valor no cache. Retorna None se não existir ou expirado."""
        async with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._misses += 1
                return None
            
            if entry.is_expired():
                del self._cache[key]
                self._misses += 1
                return None
            
            self._hits += 1
            return entry.value
    
    async def set(self, key: str, value: Any, ttl_seconds: int):
        """Armazena valor no cache com TTL em segundos."""
        async with self._lock:
            self._cache[key] = CacheEntry(value, ttl_seconds)
    
    async def delete(self, key: str):
        """Remove entrada do cache."""
        async with self._lock:
            self._cache.pop(key, None)
    
    async def clear(self):
        """Limpa todo o cache."""
        async with self._lock:
            self._cache.clear()
            self._hits = 0
            self._misses = 0
    
    async def get_stats(self) -> dict:
        """Retorna estatísticas de uso do cache."""
        async with self._lock:
            total = self._hits + self._misses
            hit_rate = (self._hits / total * 100) if total > 0 else 0
            return {
                "entries": len(self._cache),
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate_percent": round(hit_rate, 2),
            }
    
    async def cleanup_expired(self):
        """Remove entradas expiradas do cache (manutenção)."""
        async with self._lock:
            expired_keys = [k for k, v in self._cache.items() if v.is_expired()]
            for key in expired_keys:
                del self._cache[key]
            return len(expired_keys)


# Instância global do cache
_cache = MemoryCache()


def get_cache() -> MemoryCache:
    """Retorna a instância global do cache."""
    return _cache


def cache_key(*args, **kwargs) -> str:
    """
    Gera chave de cache determinística a partir de argumentos.
    Usa hash MD5 para garantir tamanho fixo.
    """
    # Serializa args e kwargs de forma determinística
    key_data = {
        "args": args,
        "kwargs": sorted(kwargs.items()),
    }
    key_str = json.dumps(key_data, sort_keys=True, default=str)
    return hashlib.md5(key_str.encode()).hexdigest()


def cached(ttl_seconds: int, key_prefix: str = ""):
    """
    Decorator para cachear resultado de função async com TTL.
    
    Args:
        ttl_seconds: Tempo de vida do cache em segundos
        key_prefix: Prefixo para a chave de cache (útil para namespacing)
    
    Exemplo:
        @cached(ttl_seconds=30, key_prefix="workcenters")
        async def get_workcenters_data(session, odoo):
            # ... operações pesadas ...
            return data
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            # Gera chave única baseada em função + argumentos
            func_name = f"{func.__module__}.{func.__qualname__}"
            arg_hash = cache_key(*args, **kwargs)
            cache_key_str = f"{key_prefix}:{func_name}:{arg_hash}" if key_prefix else f"{func_name}:{arg_hash}"
            
            # Tenta buscar no cache
            cached_value = await _cache.get(cache_key_str)
            if cached_value is not None:
                logger.debug(f"Cache HIT: {cache_key_str}")
                return cached_value
            
            # Cache miss — executa função
            logger.debug(f"Cache MISS: {cache_key_str}")
            result = await func(*args, **kwargs)
            
            # Armazena no cache
            await _cache.set(cache_key_str, result, ttl_seconds)
            return result
        
        return wrapper
    return decorator


async def invalidate_cache_pattern(pattern: str):
    """
    Invalida todas as entradas de cache que correspondem ao padrão.
    Útil para invalidação em cascata após mutações.
    
    Exemplo:
        await invalidate_cache_pattern("workcenters:")
    """
    cache = get_cache()
    async with cache._lock:
        keys_to_delete = [k for k in cache._cache.keys() if pattern in k]
        for key in keys_to_delete:
            del cache._cache[key]
        logger.info(f"Invalidated {len(keys_to_delete)} cache entries matching pattern: {pattern}")
