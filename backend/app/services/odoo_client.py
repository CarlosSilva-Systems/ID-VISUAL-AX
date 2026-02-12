import httpx
import json
import logging
from typing import Any, Dict, List, Optional
from app.models.odoo_connection import OdooAuthType

logger = logging.getLogger(__name__)

class OdooClient:
    def __init__(self, url: str, db: str, auth_type: str, login: Optional[str], secret: str):
        self.url = url.rstrip('/')
        self.db = db
        self.auth_type = auth_type
        self.login = login
        self.secret = secret # Decrypted secret
        self.session = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        await self.session.aclose()

    async def _json2_call(self, model: str, method: str, args: List = None, kwargs: Dict = None) -> Any:
        # JSON-2 Pattern: POST /json/2/<model>/<method>
        # Headers: Authorization: Bearer <API_KEY>, X-Db: <DB_NAME>
        
        args = args or []
        kwargs = kwargs or {}
        
        headers = {
            "Authorization": f"Bearer {self.secret}",
            "X-Db": self.db,
            "Content-Type": "application/json"
        }
        
        endpoint = f"{self.url}/json/2/{model}/{method}"
        payload = {
            "args": args,
            "kwargs": kwargs
        }

        try:
            response = await self.session.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"JSON-2 Error: {e.response.text}")
            raise

    async def _jsonrpc_authenticate(self) -> str:
        # Authenticate and get session_id
        endpoint = f"{self.url}/web/session/authenticate"
        payload = {
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "db": self.db,
                "login": self.login,
                "password": self.secret
            },
            "id": 1
        }
        response = await self.session.post(endpoint, json=payload)
        data = response.json()
        if "error" in data:
            raise Exception(f"Auth Error: {data['error']}")
        
        # Session ID is usually in cookies or result
        # Standard Odoo online sets a session_id cookie
        return response.cookies.get("session_id")

    async def _jsonrpc_call_kw(self, model: str, method: str, args: List = None, kwargs: Dict = None) -> Any:
        if not self.session.cookies.get("session_id"):
             await self._jsonrpc_authenticate()
             
        endpoint = f"{self.url}/web/dataset/call_kw/{model}/{method}"
        payload = {
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "model": model,
                "method": method,
                "args": args or [],
                "kwargs": kwargs or {}
            },
            "id": 2
        }
        
        response = await self.session.post(endpoint, json=payload)
        data = response.json()
        if "error" in data:
             # If Session Expired, retry once?
             if "Session expired" in str(data['error']):
                 await self._jsonrpc_authenticate()
                 response = await self.session.post(endpoint, json=payload)
                 data = response.json()
        
        if "error" in data:
            raise Exception(f"RPC Error: {data['error']}")
            
        return data.get("result")

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
            logger.warning(f"Odoo Call Failed: {e}. If JSON-2, might fallback or fail.")
            raise e

    async def call_kw(self, model: str, method: str, args: List = None, kwargs: Dict = None) -> Any:
        """
        Public wrapper for JSON-RPC call_kw. Used for action_done, write, etc.
        """
        return await self._jsonrpc_call_kw(model, method, args=args, kwargs=kwargs)

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

