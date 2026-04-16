import httpx
import json
import logging
import asyncio
import random
from typing import Any, Dict, List, Optional
from app.models.odoo_connection import OdooAuthType

logger = logging.getLogger(__name__)

class OdooClient:
    def __init__(self, url: str, db: str, auth_type: str, login: Optional[str], secret: str, company_ids: List[int] = None):
        self.url = url.rstrip('/')
        self.db = db
        self.auth_type = OdooAuthType(auth_type)
        self.login = login
        self.secret = secret # Decrypted secret
        self.uid = None
        self.company_ids = company_ids or []
        # Reduzido timeout para 15s - 60s era excessivo e causava hangs na UI
        self.session = httpx.AsyncClient(timeout=15.0, follow_redirects=True)
        self.session_id = None

    async def close(self):
        await self.session.aclose()

    async def _call_with_retry(self, func, *args, **kwargs):
        """Helper para executar chamadas com retentativa e backoff exponencial."""
        max_retries = 2 # Reduzido de 3 para 2
        base_delay = 0.5
        
        for attempt in range(max_retries + 1):
            try:
                return await func(*args, **kwargs)
            except (httpx.NetworkError, httpx.TimeoutException, httpx.HTTPStatusError) as e:
                # Se for erro de auth ou permissão, não retenta (401, 403)
                if isinstance(e, httpx.HTTPStatusError) and e.response.status_code in [401, 403]:
                    self.uid = None # Força re-autenticação na próxima
                    logger.error(
                        f"[Odoo RPC] Erro HTTP {e.response.status_code} (não retentar) → "
                        f"url={self.url} db={self.db} | {e}"
                    )
                    raise

                if attempt == max_retries:
                    logger.error(
                        f"[Odoo RPC] Falha definitiva após {max_retries} tentativas → "
                        f"url={self.url} db={self.db} | Erro: {type(e).__name__}: {e}"
                    )
                    raise
                
                # Somente retentar em erros que parecem transitórios
                if isinstance(e, httpx.HTTPStatusError) and e.response.status_code not in [502, 503, 504, 429]:
                    logger.error(
                        f"[Odoo RPC] Erro HTTP {e.response.status_code} (não retentar) → "
                        f"url={self.url} db={self.db} | {e}"
                    )
                    raise

                delay = base_delay * (2 ** attempt) + random.uniform(0, 0.5)
                logger.warning(
                    f"[Odoo RPC] Erro transitório (tentativa {attempt+1}/{max_retries+1}) → "
                    f"url={self.url} db={self.db} | {type(e).__name__}: {e} | "
                    f"Retentando em {delay:.2f}s..."
                )
                await asyncio.sleep(delay)
            except Exception as e:
                if "Auth Error" in str(e) or "AUTHENTICATION_FAILED" in str(e):
                    self.uid = None
                raise

    async def _json2_call(self, model: str, method: str, args: List = None, kwargs: Dict = None) -> Any:
        async def _do_call():
            nonlocal args, kwargs
            headers = {
                "Authorization": f"Bearer {self.secret}",
                "X-Db": self.db,
                "Content-Type": "application/json"
            }
            endpoint = f"{self.url}/json/2/{model}/{method}"
            payload = {"args": args or [], "kwargs": kwargs or {}}
            response = await self.session.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()

        return await self._call_with_retry(_do_call)

    async def _jsonrpc_authenticate(self) -> int:
        """Autenticação direta sem o wrapper de retry para evitar recursão no UID."""
        endpoint = f"{self.url}/jsonrpc"
        payload = {
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "service": "common",
                "method": "authenticate",
                "args": [self.db, self.login, self.secret, {}]
            },
            "id": 1
        }
        logger.debug(f"[Odoo Auth] Tentando autenticar → url={self.url} db={self.db} login={self.login}")
        try:
            response = await self.session.post(endpoint, json=payload)
            response.raise_for_status()
            data = response.json()
            if "error" in data:
                self.uid = None
                err_detail = data['error']
                logger.error(
                    f"[Odoo Auth] ERRO de autenticação → url={self.url} db={self.db} "
                    f"login={self.login} | Resposta Odoo: {err_detail}"
                )
                raise Exception(f"Odoo Auth Error: {err_detail}")
            uid = data.get("result")
            if not uid:
                self.uid = None
                logger.error(
                    f"[Odoo Auth] FALHA — credenciais rejeitadas pelo Odoo → "
                    f"url={self.url} db='{self.db}' login='{self.login}' | "
                    f"Verifique ODOO_DB, ODOO_SERVICE_LOGIN e ODOO_SERVICE_PASSWORD no .env"
                )
                raise Exception("AUTHENTICATION_FAILED")
            self.uid = uid
            logger.info(f"[Odoo Auth] ✓ Autenticado com sucesso → db={self.db} login={self.login} uid={uid}")
            return self.uid
        except Exception:
            self.uid = None
            raise

    async def _jsonrpc_call_kw(self, model: str, method: str, args: List = None, kwargs: Dict = None) -> Any:
        async def _do_rpc():
            if not self.uid:
                await self._jsonrpc_authenticate()
            
            endpoint = f"{self.url}/jsonrpc"
            payload = {
                "jsonrpc": "2.0",
                "method": "call",
                "params": {
                    "service": "object",
                    "method": "execute_kw",
                    "args": [
                        self.db, self.uid, self.secret, model, method, args or [], 
                        {**(kwargs or {}), "context": {**(kwargs.get("context", {}) if kwargs else {}), "allowed_company_ids": self.company_ids}} if self.company_ids else (kwargs or {})
                    ]
                },
                "id": 1
            }
            response = await self.session.post(endpoint, json=payload)
            response.raise_for_status()
            data = response.json()
            if "error" in data:
                # Se o erro for de sessão ou UID inválido, limpamos para re-autenticar
                err_str = str(data['error']).lower()
                if "session" in err_str or "uid" in err_str or "expired" in err_str:
                    self.uid = None
                raise Exception(f"Odoo RPC Error in {model}.{method}: {data['error']}")
            return data.get("result")

        return await self._call_with_retry(_do_rpc)

    async def search_read(self, model: str, domain: List, fields: List[str] = None, limit: int = 0, offset: int = 0, order: str = None) -> List[Dict]:
        """
        Generic search_read that tries JSON-2 first, then falls back to RPC.
        """
        kwargs = {"fields": fields, "limit": limit, "offset": offset}
        if order:
            kwargs["order"] = order
            
        try:
            if self.auth_type == OdooAuthType.JSON2_APIKEY:
                return await self._json2_call(model, "search_read", args=[domain], kwargs=kwargs)
            else:
                return await self._jsonrpc_call_kw(model, "search_read", args=[domain], kwargs=kwargs)
        except Exception as e:
            logger.warning(
                f"[Odoo search_read] Falha → model={model} db={self.db} | "
                f"{type(e).__name__}: {e}"
            )
            raise e

    async def call_kw(self, model: str, method: str, args: List = None, kwargs: Dict = None) -> Any:
        """
        Public wrapper for JSON-RPC call_kw. Used for action_done, write, etc.
        """
        if self.auth_type == OdooAuthType.JSON2_APIKEY:
            return await self._json2_call(model, method, args=args, kwargs=kwargs)
        return await self._jsonrpc_call_kw(model, method, args=args, kwargs=kwargs)

    async def get_user_groups(self, uid: int) -> List[int]:
        """
        Fetch IDs of groups assigned to a user.
        """
        try:
            res = await self.search_read(
                "res.users",
                domain=[["id", "=", uid]],
                fields=["id"],  # groups_id raises ValueError on Odoo 19 SaaS
                limit=1
            )
            if not res:
                return []
            return res[0].get("groups_id", [])
        except Exception as e:
            logger.warning(f"Error fetching user groups for {uid}: {e}")
            return []

    async def get_user_info(self, login: str) -> Optional[Dict]:
        """
        Fetch user ID, name, and groups in a single optimized logic.
        """
        try:
            logger.info(f"Searching Odoo user info for login: '{login}' (subject)")
            res = await self.search_read(
                "res.users",
                domain=[["login", "ilike", login]],
                fields=["id", "name"],
                limit=1
            )
            if not res:
                logger.warning(f"Odoo user NOT FOUND for login: '{login}'")
                # Try search by email as fallback
                res = await self.search_read(
                    "res.users",
                    domain=[["email", "ilike", login]],
                    fields=["id", "name"],
                    limit=1
                )
            
            if res:
                logger.info(f"Odoo user found: ID={res[0]['id']}, Name='{res[0].get('name')}'")
                return res[0]
            
            return None
        except Exception as e:
            logger.warning(f"Error fetching user info for {login}: {e}")
            return None

    # --- Activity Management Helpers ---

    async def get_activity_type_id(self, name: str) -> Optional[int]:
        """
        Find the mail.activity.type ID by name (e.g. 'Imprimir ID Visual').
        Returns None if not found.
        """
        try:
            results = await self.search_read(
                'mail.activity.type',
                domain=[['name', '=', name]],
                fields=['id', 'name'],
                limit=1
            )
            if results:
                return results[0]['id']
            return None
        except Exception as e:
            logger.error(f"Failed to get activity type ID for '{name}': {e}")
            return None

    async def find_activities_for_mo(self, odoo_mo_id: int, activity_type_id: int) -> List[Dict]:
        """
        Search active mail.activity records for a specific Manufacturing Order.
        """
        domain = [
            ['res_model', '=', 'mrp.production'],
            ['res_id', '=', odoo_mo_id],
            ['active', '=', True],
        ]
        if activity_type_id:
            domain.append(['activity_type_id', '=', activity_type_id])
        
        try:
            return await self.search_read(
                'mail.activity',
                domain=domain,
                fields=['id', 'res_id', 'date_deadline', 'summary', 'activity_type_id'],
                order='date_deadline asc, create_date asc'
            )
        except Exception as e:
            logger.error(f"Failed to find activities for MO {odoo_mo_id}: {e}")
            return []

    async def close_activities(self, activity_ids: List[int]) -> bool:
        """
        Close activities by calling action_done. Fallback: write active=False.
        Returns True on success, raises on failure.
        """
        if not activity_ids:
            return True  # Nothing to close is success (idempotent)
        
        try:
            # Primary: action_done marks activity as completed
            await self.call_kw(
                'mail.activity', 'action_done',
                args=[activity_ids],
                kwargs={}
            )
            logger.info(f"Closed {len(activity_ids)} activities via action_done")
            return True
        except Exception as e:
            logger.warning(f"action_done failed: {e}. Trying write fallback...")
            try:
                # Fallback: deactivate
                await self.call_kw(
                    'mail.activity', 'write',
                    args=[activity_ids, {'active': False}],
                    kwargs={}
                )
                logger.info(f"Closed {len(activity_ids)} activities via write fallback")
                return True
            except Exception as e2:
                logger.error(f"Both action_done and write failed for activities {activity_ids}: {e2}")
                raise e2

    # --- Document and Attachment Helpers ---

    async def get_model_fields(self, model: str, attributes: List[str] = None) -> Dict[str, Any]:
        """
        Helper to get fields schema via fields_get.
        """
        attributes = attributes or ['string', 'type', 'relation']
        try:
            return await self.call_kw(model, 'fields_get', kwargs={'attributes': attributes})
        except Exception as e:
            logger.error(f"Failed to get fields for model {model}: {e}")
            return {}

    async def discover_product_document_fields(self) -> List[str]:
        """
        Discover document-related fields on product.product.
        """
        fields = await self.get_model_fields('product.product')
        # Look for fields containing 'doc', 'attach', or 'file'
        related = [k for k in fields.keys() if any(x in k.lower() for x in ['doc', 'attach', 'file'])]
        logger.info(f"Discovered document-related fields on product.product: {related}")
        return related

    async def get_product_documents(self, product_id: int) -> List[Dict[str, Any]]:
        """
        Busca e normaliza documentos de um produto.

        Otimizações:
        - fields_get e search_read do produto são executados em paralelo (asyncio.gather)
          quando os campos prioritários já são conhecidos, eliminando uma RPC sequencial.
        - Para cada campo de documento encontrado, os schemas dos modelos-alvo são
          buscados em paralelo antes de buscar os registros.
        """
        # 1. Descobre campos disponíveis no produto
        fields_schema = await self.get_model_fields('product.product')

        priority_fields = ['product_document_ids', 'attachment_ids', 'x_studio_documents']
        available_fields = [f for f in priority_fields if f in fields_schema]

        if not available_fields:
            available_fields = [k for k in fields_schema.keys() if any(x in k.lower() for x in ['doc', 'attach', 'file'])]

        if not available_fields:
            return []

        # 2. Lê dados do produto
        try:
            product_data = await self.search_read(
                'product.product',
                domain=[['id', '=', product_id]],
                fields=available_fields
            )
        except Exception as e:
            logger.error(f"Failed to read product documents fields for {product_id}: {e}")
            return []

        if not product_data:
            return []

        p = product_data[0]

        # 3. Coleta os campos que têm valores e seus modelos-alvo
        fields_to_fetch: List[tuple] = []  # (fld, target_model, ids)
        for fld in available_fields:
            val = p.get(fld)
            if not val:
                continue
            info = fields_schema.get(fld)
            if not info:
                continue
            target_model = info.get('relation')
            if not target_model:
                continue
            ids = val if isinstance(val, list) else [val]
            ids = [i for i in ids if isinstance(i, int)]
            if ids:
                fields_to_fetch.append((fld, target_model, ids))

        if not fields_to_fetch:
            return []

        # 4. Busca schemas dos modelos-alvo em paralelo
        unique_models = list({tm for _, tm, _ in fields_to_fetch})
        schemas_list = await asyncio.gather(
            *[self.get_model_fields(m) for m in unique_models],
            return_exceptions=True
        )
        model_schemas: Dict[str, Dict] = {}
        for model, schema in zip(unique_models, schemas_list):
            if isinstance(schema, Exception):
                logger.error(f"Error fetching schema for {model}: {schema}")
                model_schemas[model] = {}
            else:
                model_schemas[model] = schema

        # 5. Busca os registros de documentos em paralelo
        async def _fetch_docs_for_field(fld: str, target_model: str, ids: List[int]) -> List[Dict[str, Any]]:
            target_schema = model_schemas.get(target_model, {})
            req_fields = ['id', 'name', 'mimetype', 'checksum', 'file_size', 'write_date']
            actual_fields = [f for f in req_fields if f in target_schema]
            if not actual_fields:
                actual_fields = ['id', 'name']

            if target_model == 'product.document' and 'ir_attachment_id' in target_schema:
                actual_fields.append('ir_attachment_id')

            try:
                docs = await self.search_read(target_model, domain=[['id', 'in', ids]], fields=actual_fields)
                result = []
                for d in docs:
                    result.append({
                        "id": f"{target_model}_{d['id']}",
                        "odoo_id": d['id'],
                        "model": target_model,
                        "name": d.get('name', 'unnamed'),
                        "mimetype": d.get('mimetype', 'application/octet-stream'),
                        "size": d.get('file_size', 0),
                        "checksum": d.get('checksum'),
                        "last_modified": d.get('write_date'),
                        "ir_attachment_id": d.get('ir_attachment_id'),
                    })
                return result
            except Exception as e:
                logger.error(f"Error fetching documents from {target_model}: {e}")
                return []

        results = await asyncio.gather(
            *[_fetch_docs_for_field(fld, tm, ids) for fld, tm, ids in fields_to_fetch],
            return_exceptions=True
        )

        all_docs: List[Dict[str, Any]] = []
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Parallel doc fetch error: {r}")
            else:
                all_docs.extend(r)

        # 6. Deduplica por checksum ou name+id
        seen: set = set()
        unique_docs: List[Dict[str, Any]] = []
        for d in all_docs:
            key = d['checksum'] if d['checksum'] else f"{d['name']}_{d['odoo_id']}"
            if key not in seen:
                seen.add(key)
                unique_docs.append(d)

        return unique_docs

    async def get_attachment_data(self, model: str, record_id: int) -> Optional[Dict[str, Any]]:
        """
        Fetch binary data and metadata for a document/attachment.
        Handles both product.document and ir.attachment.
        """
        try:
            # Check schema to see if 'datas' exists
            schema = await self.get_model_fields(model)
            fields = ['name', 'mimetype']
            if 'datas' in schema:
                fields.append('datas')
            elif 'raw' in schema:
                fields.append('raw')
            
            res = await self.search_read(model, domain=[['id', '=', record_id]], fields=fields)
            if not res:
                return None
            
            data = res[0]
            return {
                "name": data.get('name'),
                "mimetype": data.get('mimetype'),
                "content": data.get('datas') or data.get('raw')
            }
        except Exception as e:
            logger.error(f"Failed to fetch attachment data for {model}:{record_id}: {e}")
            return None

    async def pause_workorder(self, workorder_id: int) -> dict:
        """Tenta pausar a WO via fallback encadeado.
        Retorna dict explícito — NUNCA silencia falha. Frontend usa pause_ok."""
        for method in ["button_pending", "button_pause", "action_pause"]:
            try:
                await self.call_kw("mrp.workorder", method, args=[[workorder_id]])
                logger.info(f"pause_workorder: WO {workorder_id} paused via {method}")
                return {"ok": True, "method_used": method, "error": None}
            except Exception as e:
                logger.warning(f"pause_workorder: {method} failed: {e}")

        msg = (
            "Nenhum método de pausa funcionou (button_pending / button_pause / action_pause). "
            "Pause manual necessário no Odoo."
        )
        logger.error(f"pause_workorder: ALL methods failed for WO {workorder_id}")
        return {"ok": False, "method_used": None, "error": msg}

    async def resume_workorder(self, workorder_id: int) -> dict:
        """Tenta retomar a WO via fallback encadeado (inverso do pause).
        Retorna dict explícito — NUNCA silencia falha."""
        for method in ["button_start", "action_start", "button_resume"]:
            try:
                await self.call_kw("mrp.workorder", method, args=[[workorder_id]])
                logger.info(f"resume_workorder: WO {workorder_id} resumed via {method}")
                return {"ok": True, "method_used": method, "error": None}
            except Exception as e:
                logger.warning(f"resume_workorder: {method} failed: {e}")

        msg = (
            "Nenhum método de retomada funcionou (button_start / action_start / button_resume). "
            "Retomada manual necessária no Odoo."
        )
        logger.error(f"resume_workorder: ALL methods failed for WO {workorder_id}")
        return {"ok": False, "method_used": None, "error": msg}

    async def get_workorder_state(self, workorder_id: int) -> Optional[str]:
        """Retorna o estado atual de uma Work Order (progress, pending, pause, etc.)."""
        try:
            res = await self.search_read(
                "mrp.workorder",
                domain=[["id", "=", workorder_id]],
                fields=["state"],
                limit=1
            )
            if res:
                return res[0].get("state")
            return None
        except Exception as e:
            logger.error(f"get_workorder_state: WO {workorder_id}: {e}")
            return None

    async def create_andon_activity(
        self, production_id: int, note: str, user_id: int
    ) -> int | None:
        """Cria mail.activity de parada crítica na MO (mrp.production).
        Busca tipo 'Parada Andon' ou fallback genérico."""
        from datetime import date
        try:
            activity_type_id = (
                await self.get_activity_type_id("Parada Andon")
                or await self.get_activity_type_id("To Do")
                or 4
            )
            activity_id = await self.call_kw(
                "mail.activity", "create",
                args=[{
                    "res_model": "mrp.production",
                    "res_id": production_id,
                    "activity_type_id": activity_type_id,
                    "summary": "Parada Crítica — Andon",
                    "note": note,
                    "user_id": user_id,
                    "date_deadline": date.today().isoformat(),
                }],
            )
            logger.info(f"create_andon_activity: {activity_id} for MO {production_id}")
            return activity_id
        except Exception as e:
            logger.error(f"create_andon_activity: MO {production_id}: {e}")
            return None

    async def post_discuss_message(self, channel_id: int, message: str) -> bool:
        """Posta mensagem no canal Discuss via channel_id fixo (ANDON_CHANNEL_ID).
        Retorna True em sucesso, False em falha — nunca lança exceção."""
        try:
            await self.call_kw(
                "mail.channel", "message_post",
                args=[[channel_id]],
                kwargs={
                    "body": message,
                    "message_type": "comment",
                    "subtype_xmlid": "mail.mt_comment",
                },
            )
            return True
        except Exception as e:
            logger.error(f"post_discuss_message: channel {channel_id}: {e}")
            return False

    async def get_workcenters(self) -> List[Dict]:
        """Fetch all active workcenters."""
        return await self.search_read(
            'mrp.workcenter', 
            domain=[['active', '=', True]], 
            fields=['id', 'name', 'code']
        )

    async def get_active_workorder(self, wc_id: int, states: List[str]) -> Optional[Dict]:
        """Fetch the first active workorder in specified states for a workcenter."""
        res = await self.search_read(
            'mrp.workorder',
            domain=[['workcenter_id', '=', wc_id], ['state', 'in', states]],
            fields=['id', 'name', 'production_id', 'product_id', 'qty_production', 'qty_produced'],
            limit=1,
            order='date_start asc'
        )
        if res:
            wo = res[0]
            # Normalize fields
            def norm(val): return val[0] if isinstance(val, (list, tuple)) else val
            def norm_name(val): return val[1] if isinstance(val, (list, tuple)) else "N/A"

            return {
                "id": wo['id'],
                "name": wo['name'],
                "production_id": wo.get('production_id'), # Keep as tuple [id, name] for frontend
                "product_id": norm(wo.get('product_id')),
                "product_name": norm_name(wo.get('product_id')),
                "qty_production": wo.get('qty_production', 0),
                "qty_produced": wo.get('qty_produced', 0)
            }
        return None

    async def post_chatter_message(self, production_id: int, body: str) -> bool:
        """Post a message to mrp.production chatter."""
        try:
            await self.call_kw(
                'mrp.production', 'message_post',
                args=[[production_id]],
                kwargs={"body": body, "message_type": "comment", "subtype_xmlid": "mail.mt_comment"}
            )
            return True
        except Exception as e:
            logger.error(f"post_chatter_message: MO {production_id}: {e}")
            return False

    async def create_internal_picking(
        self, workorder_id: int, production_id: int, workcenter_name: str, event_id: int, picking_type_id: int
    ) -> Dict:
        """
        Creates an internal picking for missing materials in the MO.
        Returns dict with path and picking_id.
        """
        try:
            # Fetch moves that aren't already linked to a picking
            moves = await self.search_read(
                'stock.move',
                domain=[
                    ['raw_material_production_id', '=', production_id], 
                    ['state', 'not in', ['done', 'cancel']], 
                    ['picking_id', '=', False]
                ],
                fields=['id', 'location_id', 'location_dest_id']
            )
            
            if not moves:
                return {"path": "fallback", "picking_id": None}
            
            # Normalize locations from first move
            loc_id = moves[0]['location_id'][0] if moves[0]['location_id'] else None
            loc_dest_id = moves[0]['location_dest_id'][0] if moves[0]['location_dest_id'] else None
            
            picking_id = await self.call_kw(
                'stock.picking', 'create',
                args=[{
                    'picking_type_id': picking_type_id,
                    'location_id': loc_id,
                    'location_dest_id': loc_dest_id,
                    'origin': f"Andon {workcenter_name} - Event #{event_id}",
                    'move_ids_without_package': [(4, m['id']) for m in moves]
                }]
            )
            
            await self.call_kw('stock.picking', 'action_confirm', args=[[picking_id]])
            
            return {"path": "odoo_picking", "picking_id": picking_id}
        except Exception as e:
            logger.error(f"create_internal_picking: MO {production_id}: {e}")
            return {"path": "fallback", "picking_id": None}
