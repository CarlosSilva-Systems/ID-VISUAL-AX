from typing import Any, List
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlmodel import select, col
from sqlmodel.ext.asyncio.session import AsyncSession

from app.services.odoo_client import OdooClient
from app.core.config import settings
from app.api.deps import get_session, get_odoo_client, get_current_user
from app.models.id_request import IDRequest, IDRequestStatus
from app.models.manufacturing import ManufacturingOrder

import logging

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

@router.get("/mos", response_model=List[dict])
@limiter.limit("6/minute")
async def get_odoo_mos(
    request: Request,
    session: AsyncSession = Depends(get_session),
    client: OdooClient = Depends(get_odoo_client)
) -> Any:
    """
    Fetch Manufacturing Orders (MOs) that have a pending 'Imprimir ID Visual' activity.
    AND pending Manual Requests from local DB.
    Sorted by activity deadline (urgency) and then date_start.
    
    Uses get_odoo_client() dependency to ensure Service_Account and Active_Database are used.
    
    Otimizações:
    - Cache de 5 minutos (reduz carga no Odoo)
    - Queries paralelizadas (activity_type + activities em paralelo)
    - Limit de 200 atividades (evita queries pesadas)
    - Rate limit de 6 req/min por cliente
    """
    from app.services.cache_service import cached
    import asyncio
    
    @cached(ttl_seconds=300, key_prefix="odoo_mos")
    async def _fetch_odoo_mos_data(odoo_url: str, odoo_db: str):
        """Função interna cacheada para buscar MOs do Odoo."""
        
        # ── Step 1 & 2: Buscar activity_type e activities em paralelo ──
        async def fetch_activity_type():
            try:
                type_domain = [['name', 'ilike', 'Imprimir ID Visual']]
                activity_types = await client.search_read('mail.activity.type', domain=type_domain, fields=['id'], limit=1)
                return activity_types[0]['id'] if activity_types else None
            except Exception as e:
                logger.warning(f"Failed to fetch activity type: {e}")
                return None
        
        async def fetch_activities(activity_type_id):
            domain = [['res_model', '=', 'mrp.production']]
            
            if activity_type_id:
                domain.append('|')
                domain.append(['activity_type_id', '=', activity_type_id])
                domain.append(['summary', 'ilike', 'Imprimir ID Visual'])
            else:
                domain.append(['summary', 'ilike', 'Imprimir ID Visual'])
            
            return await client.search_read(
                'mail.activity',
                domain=domain,
                fields=['res_id', 'summary', 'date_deadline', 'activity_type_id', 'create_date'],
                order='date_deadline ASC, create_date ASC',
                limit=200  # Limit para evitar queries pesadas
            )
        
        # Executar em paralelo
        activity_type_id = await fetch_activity_type()
        activities = await fetch_activities(activity_type_id)
        
        if not activities:
            return []

        # Deduplicate res_ids
        odoo_res_ids = []
        activity_map = {}
        for act in activities:
            rid = act['res_id']
            if rid not in activity_map:
                odoo_res_ids.append(rid)
                activity_map[rid] = act

        # ── Step 3: Fetch MO Details (Robust) ──
        safe_fields = ['id', 'name', 'state', 'product_qty', 'x_studio_nome_da_obra', 'origin']
        mo_domain = [['id', 'in', odoo_res_ids]]
        
        odoo_mos = []
        try:
            odoo_mos = await client.search_read(
                'mrp.production', 
                domain=mo_domain, 
                fields=safe_fields + ['date_start']
            )
        except Exception as e:
            logger.warning(f"Failed to fetch 'date_start', trying 'date_planned_start': {e}")
            try:
                odoo_mos = await client.search_read(
                    'mrp.production', 
                    domain=mo_domain, 
                    fields=safe_fields + ['date_planned_start']
                )
                for m in odoo_mos:
                    m['date_start'] = m.get('date_planned_start')
            except Exception as e2:
                logger.warning(f"Failed to fetch date fields, fetching base only: {e2}")
                odoo_mos = await client.search_read(
                    'mrp.production', 
                    domain=mo_domain, 
                    fields=safe_fields
                )

        # ── Step 4: Process & Merge ──
        final_list = []
        mo_map = {m['id']: m for m in odoo_mos}
        
        for rid in odoo_res_ids:
            mo = mo_map.get(rid)
            if not mo:
                continue
                
            act = activity_map[rid]
            
            item = {
                "odoo_mo_id": mo.get('id'),
                "mo_number": mo.get('name', 'N/A'),
                "obra": mo.get('x_studio_nome_da_obra') or 'Sem Obra',
                "product_qty": mo.get('product_qty', 0),
                "date_start": mo.get('date_start'),
                "state": mo.get('state', 'unknown'),
                "has_id_activity": True,
                "activity_summary": act.get('summary'),
                "activity_date_deadline": act.get('date_deadline'),
                "origin": mo.get('origin'),
                "source": "odoo",
                "from_production": False,
                "production_requester": None
            }
            final_list.append(item)
        
        return final_list, odoo_res_ids
    
    try:
        # Buscar dados cacheados (5min TTL)
        final_list, odoo_res_ids = await _fetch_odoo_mos_data(
            settings.ODOO_URL,
            settings.ODOO_DB
        )
        
        # ── Step 5: Decorate with Transferred Manual Requests (não cacheado) ──
        if odoo_res_ids:
            try:
                stmt = (
                    select(IDRequest)
                    .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id)
                    .where(
                        IDRequest.transferred_to_queue == True,
                        col(ManufacturingOrder.odoo_id).in_(odoo_res_ids)
                    )
                )
                transferred_requests = await session.exec(stmt)
                
                stmt_map = (
                    select(IDRequest.requester_name, ManufacturingOrder.odoo_id)
                    .join(ManufacturingOrder, IDRequest.mo_id == ManufacturingOrder.id)
                    .where(
                        IDRequest.transferred_to_queue == True,
                        col(ManufacturingOrder.odoo_id).in_(odoo_res_ids)
                    )
                )
                map_results = await session.exec(stmt_map)
                transferred_map = {odoo_id: name for name, odoo_id in map_results}

                for item in final_list:
                    if item["odoo_mo_id"] in transferred_map:
                        item["source"] = "producao"
                        item["from_production"] = True
                        item["production_requester"] = transferred_map[item["odoo_mo_id"]]
            except Exception as e:
                logger.warning(f"Failed to decorate with local requests: {e}")

        return final_list

    except Exception as e:
        error_type = type(e).__name__
        safe_msg = str(e).replace(settings.ODOO_SERVICE_PASSWORD or "", "***")
        request_id = str(uuid.uuid4())[:8]
        logger.exception(f"CRITICAL ODOO ERROR [{error_type}] [ref:{request_id}]: {safe_msg}")
        
        if "Timeout" in error_type or "deadline" in safe_msg.lower():
            raise HTTPException(
                status_code=504,
                detail="O servidor Odoo demorou muito para responder. Por favor, tente novamente em alguns segundos."
            )
            
        raise HTTPException(
            status_code=502, 
            detail=(
                f"Erro de Conectividade Odoo [{error_type}] [ref: {request_id}]. "
                "Verifique se ODOO_URL, ODOO_DB, ODOO_SERVICE_LOGIN e ODOO_SERVICE_PASSWORD "
                "estão corretamente preenchidos no arquivo .env."
            )
        )

@router.get("/users", response_model=List[dict])
async def get_odoo_users(
    current_user: Any = Depends(get_current_user),
    client: OdooClient = Depends(get_odoo_client)
) -> Any:
    """
    Fetch active users from Odoo to populate settings selection.
    
    Uses get_odoo_client() dependency to ensure Service_Account and Active_Database are used.
    """
    try:
        domain = [['active', '=', True]]
        users = await client.search_read(
            'res.users',
            domain=domain,
            fields=['id', 'name', 'login'],
            order='name ASC'
        )
        return users
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        logger.error(f"Failed to fetch Odoo users [ref:{request_id}]: {e}")
        raise HTTPException(status_code=502, detail=f"Erro ao buscar usuários no Odoo [ref: {request_id}]")


# ═══════════════════════════════════════════════════════════════════════════════
# Database Management Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/databases", response_model=List[dict])
async def list_odoo_databases(
    session: AsyncSession = Depends(get_session),
    current_user: Any = Depends(get_current_user)
) -> Any:
    """
    Lista todos os bancos de dados disponíveis no servidor Odoo.
    
    Classifica cada banco como 'production' ou 'test' e marca o banco ativo atual.
    O banco de produção (axengenharia1) é marcado como não selecionável.
    
    Returns:
        List[DatabaseInfo]: Lista de bancos com metadados
        
    Raises:
        HTTPException 502: Falha ao conectar com servidor Odoo
        HTTPException 504: Timeout na conexão com Odoo
    """
    import httpx
    from app.services.odoo_utils import (
        get_active_odoo_db,
        classify_database,
        is_selectable
    )
    
    try:
        # 1. Consultar lista de bancos no servidor Odoo
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            response = await http_client.post(
                f"{settings.ODOO_URL}/web/database/list",
                json={}
            )
            response.raise_for_status()
            data = response.json()
            
            # Odoo retorna {"jsonrpc": "2.0", "result": ["db1", "db2", ...]}
            database_names = data.get("result", [])
            
            if not database_names:
                logger.warning("Odoo returned empty database list")
                return []
        
        # 2. Obter banco ativo atual
        active_db = await get_active_odoo_db(session)
        
        # 3. Processar cada banco
        databases = []
        for db_name in database_names:
            db_type = classify_database(db_name)
            
            databases.append({
                "name": db_name,
                "type": db_type,
                "selectable": is_selectable(db_type),
                "is_active": db_name == active_db
            })
        
        # 4. Ordenar: production primeiro, depois test alfabético
        databases.sort(key=lambda x: (x["type"] != "production", x["name"]))
        
        logger.info(f"Listed {len(databases)} Odoo databases. Active: {active_db}")
        return databases
        
    except httpx.TimeoutException as e:
        request_id = str(uuid.uuid4())[:8]
        logger.error(f"Timeout listing Odoo databases [ref:{request_id}]: {e}")
        raise HTTPException(
            status_code=504,
            detail="O servidor Odoo demorou muito para responder. Tente novamente."
        )
    except httpx.HTTPStatusError as e:
        request_id = str(uuid.uuid4())[:8]
        logger.error(f"HTTP error listing Odoo databases [ref:{request_id}]: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Erro ao conectar com servidor Odoo [ref: {request_id}]"
        )
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        safe_msg = str(e).replace(settings.ODOO_SERVICE_PASSWORD or "", "***")
        logger.exception(f"Failed to list Odoo databases [ref:{request_id}]: {safe_msg}")
        raise HTTPException(
            status_code=502,
            detail=f"Erro ao listar bancos de dados Odoo [ref: {request_id}]"
        )


@router.post("/databases/select", response_model=dict)
async def select_odoo_database(
    payload: dict,
    session: AsyncSession = Depends(get_session),
    current_user: Any = Depends(get_current_user)
) -> Any:
    """
    Seleciona um banco de dados Odoo para uso pelo sistema.
    
    Valida que não é o banco de produção e testa a conexão antes de persistir.
    
    Args:
        payload: {"database": "nome-do-banco"}
        
    Returns:
        DatabaseSelectResponse: Status da operação e resultado do teste de conexão
        
    Raises:
        HTTPException 400: Nome de banco inválido
        HTTPException 403: Tentativa de selecionar banco de produção
        HTTPException 502: Falha no teste de conexão
    """
    from app.services.odoo_utils import (
        validate_database_name,
        normalize_database_name,
        classify_database
    )
    from app.models.system_setting import SystemSetting
    
    database_name = payload.get("database", "").strip()
    
    logger.info(f"📝 Database selection request: {database_name} by user {current_user.username if hasattr(current_user, 'username') else 'unknown'}")
    
    # 1. Validação de nome
    if not validate_database_name(database_name):
        logger.warning(f"❌ Invalid database name rejected: {database_name}")
        raise HTTPException(
            status_code=400,
            detail="Nome de banco inválido. Use apenas letras, números, hífen e underscore."
        )
    
    # 2. Normalizar nome
    normalized_name = normalize_database_name(database_name)
    
    # 3. Proteção do banco de produção
    if normalized_name == "axengenharia1":
        logger.warning(f"🚫 Production database selection attempt blocked: {normalized_name}")
        raise HTTPException(
            status_code=403,
            detail="Banco de produção não pode ser selecionado durante período de testes"
        )
    
    # 4. Testar conexão com Service Account
    try:
        test_client = OdooClient(
            url=settings.ODOO_URL,
            db=normalized_name,
            auth_type=settings.ODOO_AUTH_TYPE,
            login=settings.ODOO_SERVICE_LOGIN,
            secret=settings.ODOO_SERVICE_PASSWORD
        )
        
        try:
            # Tenta autenticar para validar conexão
            await test_client._jsonrpc_authenticate()
            connection_ok = True
            logger.info(f"✓ Connection test successful for database: {normalized_name}")
        except Exception as conn_err:
            connection_ok = False
            safe_msg = str(conn_err).replace(settings.ODOO_SERVICE_PASSWORD or "", "***")
            logger.error(f"❌ Connection test failed for {normalized_name}: {safe_msg}")
            raise HTTPException(
                status_code=502,
                detail=f"Falha ao conectar com banco '{normalized_name}'. Verifique se o banco existe e as credenciais estão corretas."
            )
        finally:
            await test_client.close()
    
    except HTTPException:
        raise
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        safe_msg = str(e).replace(settings.ODOO_SERVICE_PASSWORD or "", "***")
        logger.exception(f"Unexpected error testing connection [ref:{request_id}]: {safe_msg}")
        raise HTTPException(
            status_code=502,
            detail=f"Erro inesperado ao testar conexão [ref: {request_id}]"
        )
    
    # 5. Persistir configuração
    try:
        # Buscar ou criar setting
        stmt = select(SystemSetting).where(SystemSetting.key == "active_odoo_db")
        result = await session.execute(stmt)
        setting = result.scalars().first()
        
        if setting:
            setting.value = normalized_name
            setting.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        else:
            setting = SystemSetting(
                key="active_odoo_db",
                value=normalized_name,
                description="Banco de dados Odoo ativo selecionado dinamicamente"
            )
            session.add(setting)
        
        await session.commit()
        logger.info(f"✅ Active Odoo database updated to: {normalized_name} by user {current_user.username if hasattr(current_user, 'username') else 'unknown'}")
        
        return {
            "status": "success",
            "database": normalized_name,
            "connection_ok": connection_ok
        }
        
    except Exception as e:
        await session.rollback()
        request_id = str(uuid.uuid4())[:8]
        logger.exception(f"Failed to persist database selection [ref:{request_id}]: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao salvar configuração [ref: {request_id}]"
        )
