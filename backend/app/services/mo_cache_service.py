"""
Serviço de cache para Manufacturing Orders (MOs) do Odoo.

Problema resolvido: a tabela manufacturing_order local pode ficar com dados
desatualizados (stale) — especialmente o campo `state` — porque o Odoo é a
fonte de verdade e não há webhook para todas as mudanças de estado.

Estratégia:
- Cache em memória com TTL de 5 minutos por odoo_mo_id
- Ao expirar, re-busca do Odoo e atualiza o registro local
- Operação transparente: callers usam get_or_refresh() sem saber do cache
- Thread-safe para uso em contexto async (asyncio.Lock por chave)

Uso:
    mo = await MOCacheService.get_or_refresh(session, odoo_client, odoo_mo_id=12345)
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.manufacturing import ManufacturingOrder

logger = logging.getLogger(__name__)

# TTL padrão: 5 minutos. Configurável via env se necessário.
_DEFAULT_TTL_SECONDS = 300

# Cache em memória: odoo_mo_id → timestamp da última atualização
_last_refresh: Dict[int, datetime] = {}
_refresh_locks: Dict[int, asyncio.Lock] = {}


def _get_lock(odoo_mo_id: int) -> asyncio.Lock:
    """Retorna (ou cria) um lock por odoo_mo_id para evitar refreshes simultâneos."""
    if odoo_mo_id not in _refresh_locks:
        _refresh_locks[odoo_mo_id] = asyncio.Lock()
    return _refresh_locks[odoo_mo_id]


def _is_stale(odoo_mo_id: int, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> bool:
    """Retorna True se o cache expirou ou nunca foi populado."""
    last = _last_refresh.get(odoo_mo_id)
    if last is None:
        return True
    return (datetime.now(timezone.utc) - last).total_seconds() > ttl_seconds


def invalidate(odoo_mo_id: int) -> None:
    """Invalida o cache de uma MO específica, forçando re-fetch na próxima chamada."""
    _last_refresh.pop(odoo_mo_id, None)


def invalidate_all() -> None:
    """Invalida todo o cache (útil após operações em lote)."""
    _last_refresh.clear()


async def get_or_refresh(
    session: AsyncSession,
    odoo_client: Any,
    odoo_mo_id: int,
    ttl_seconds: int = _DEFAULT_TTL_SECONDS,
    force_refresh: bool = False,
) -> Optional[ManufacturingOrder]:
    """
    Retorna a ManufacturingOrder local, re-sincronizando com o Odoo se o cache expirou.

    Args:
        session: AsyncSession do banco local
        odoo_client: Instância autenticada do OdooClient
        odoo_mo_id: ID da MO no Odoo (mrp.production.id)
        ttl_seconds: Tempo de vida do cache em segundos (padrão: 300s)
        force_refresh: Se True, ignora o TTL e força re-fetch

    Returns:
        ManufacturingOrder local atualizada, ou None se não encontrada no Odoo
    """
    lock = _get_lock(odoo_mo_id)

    async with lock:
        # Busca registro local
        stmt = select(ManufacturingOrder).where(ManufacturingOrder.odoo_id == odoo_mo_id)
        result = await session.execute(stmt)
        local_mo = result.scalars().first()

        # Decide se precisa re-fetch
        needs_refresh = force_refresh or _is_stale(odoo_mo_id, ttl_seconds) or local_mo is None

        if not needs_refresh:
            return local_mo

        # Re-fetch do Odoo
        try:
            mos_data = await odoo_client.search_read(
                "mrp.production",
                domain=[["id", "=", odoo_mo_id]],
                fields=["id", "name", "product_qty", "date_start", "state",
                        "x_studio_nome_da_obra", "company_id", "product_id"],
                limit=1,
            )
        except Exception as e:
            logger.warning(
                f"[MOCache] Falha ao re-fetch MO {odoo_mo_id} do Odoo: {e}. "
                f"Retornando dado local (possivelmente stale)."
            )
            return local_mo

        if not mos_data:
            logger.warning(f"[MOCache] MO {odoo_mo_id} não encontrada no Odoo.")
            return local_mo

        odoo_mo = mos_data[0]
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # Extrai campos do Odoo com segurança
        def _safe_str(val: Any) -> Optional[str]:
            return str(val) if val and val is not False else None

        def _safe_float(val: Any) -> float:
            try:
                return float(val) if val else 0.0
            except (ValueError, TypeError):
                return 0.0

        def _parse_date(val: Any) -> Optional[datetime]:
            if not val or val is False:
                return None
            try:
                from datetime import datetime as _dt
                return _dt.fromisoformat(str(val).replace("Z", "+00:00"))
            except (ValueError, TypeError):
                return None

        def _extract_product_name(product_val: Any) -> Optional[str]:
            import re
            if not product_val or product_val is False:
                return None
            if isinstance(product_val, (list, tuple)) and len(product_val) >= 2:
                name = re.sub(r'\[AX\d+\]', '', str(product_val[1])).strip()
                return name or None
            return None

        def _normalize_label(val: Any) -> Optional[str]:
            import re
            if not val or val is False:
                return None
            if isinstance(val, (list, tuple)) and len(val) >= 2:
                return str(val[1])
            if isinstance(val, str):
                match = re.search(r'[\(\[]\d+,\s*[\'"]?(.+?)[\'"]?[\)\]]', val)
                if match:
                    return match.group(1).strip()
                return val.strip() or None
            return str(val)

        if local_mo:
            # Atualiza campos que podem mudar no Odoo
            local_mo.name = _safe_str(odoo_mo.get("name")) or local_mo.name
            local_mo.state = _safe_str(odoo_mo.get("state")) or local_mo.state
            local_mo.product_qty = _safe_float(odoo_mo.get("product_qty"))
            local_mo.date_start = _parse_date(odoo_mo.get("date_start")) or local_mo.date_start
            local_mo.x_studio_nome_da_obra = (
                _normalize_label(odoo_mo.get("x_studio_nome_da_obra"))
                or local_mo.x_studio_nome_da_obra
            )
            local_mo.product_name = (
                _extract_product_name(odoo_mo.get("product_id"))
                or local_mo.product_name
            )
            local_mo.last_sync_at = now
            session.add(local_mo)
        else:
            # Cria novo registro local
            local_mo = ManufacturingOrder(
                odoo_id=odoo_mo["id"],
                name=odoo_mo["name"],
                x_studio_nome_da_obra=_normalize_label(odoo_mo.get("x_studio_nome_da_obra")),
                product_name=_extract_product_name(odoo_mo.get("product_id")),
                product_qty=_safe_float(odoo_mo.get("product_qty")),
                date_start=_parse_date(odoo_mo.get("date_start")),
                state=odoo_mo.get("state", "unknown"),
                company_id=int(odoo_mo["company_id"][0]) if isinstance(odoo_mo.get("company_id"), (list, tuple)) else None,
                last_sync_at=now,
            )
            session.add(local_mo)

        try:
            await session.commit()
            await session.refresh(local_mo)
            _last_refresh[odoo_mo_id] = datetime.now(timezone.utc)
            logger.debug(f"[MOCache] MO {odoo_mo_id} sincronizada com Odoo (state={local_mo.state})")
        except Exception as e:
            await session.rollback()
            logger.error(f"[MOCache] Falha ao persistir MO {odoo_mo_id}: {e}")

        return local_mo
