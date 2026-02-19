import httpx
import json
import logging
import time
import asyncio
from typing import Any, Dict, List, Optional
from app.models.odoo_connection import OdooAuthType
# Global Counter for Diagnostics
# Minimal overhead, no lock needed for single-process asyncio
class AtomicCounter:
    def __init__(self):
        self._value = 0
    
    @property
    def value(self):
        return self._value

    def inc(self):
        self._value += 1
            
    def dec(self):
        self._value -= 1

ODOO_INFLIGHT_COUNTER = AtomicCounter()

# Global Cache for fields_get with async lock
# key: (url, db, model), value: {"fields": set, "expires": float}
_FIELDS_CACHE = {}
_FIELDS_LOCK = asyncio.Lock()
FIELDS_CACHE_TTL = 600  # 10 minutes

logger = logging.getLogger(__name__)
# Add RPC SEAMPHORE if not defined (it's used later in the file)
RPC_SEMAPHORE = asyncio.Semaphore(10)
STREAM_SEMAPHORE = asyncio.Semaphore(5)

class OdooClient:
    def __init__(self, url: str, db: str, auth_type: str, login: Optional[str], secret: str):
        self.url = url.rstrip('/')
        self.db = db
        self.auth_type = auth_type
        self.login = login
        self.secret = secret # Decrypted secret
        
        # Base settings
        self.rpc_timeout = httpx.Timeout(8.0, connect=3.0, read=5.0)
        self.stream_timeout = httpx.Timeout(20.0, connect=3.0, read=15.0)
        
        # Client for RPC (Fail-fast)
        self.rpc_client = httpx.AsyncClient(timeout=self.rpc_timeout)
        # Client for Streaming (Longer read)
        self.stream_client = httpx.AsyncClient(timeout=self.stream_timeout, follow_redirects=False)

    async def close(self):
        await self.rpc_client.aclose()
        await self.stream_client.aclose()

    async def _json2_call(self, model: str, method: str, args: List = None, kwargs: Dict = None) -> Any:
        async with RPC_SEMAPHORE:
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

            retries = 1
            for attempt in range(retries + 1):
                t0 = time.time()
                ODOO_INFLIGHT_COUNTER.inc()
                try:
                    response = await self.rpc_client.post(endpoint, json=payload, headers=headers)
                    response.raise_for_status()
                    return response.json()
                except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPStatusError) as e:
                    is_server_err = isinstance(e, httpx.HTTPStatusError) and e.response.status_code in [502, 503, 504]
                    is_network = isinstance(e, (httpx.TimeoutException, httpx.ConnectError))
                    
                    if (is_server_err or is_network) and attempt < retries:
                        logger.warning(f"Odoo JSON-2 Error (Attempt {attempt+1}/{retries+1}): {e}. Retrying...")
                        continue
                    
                    if isinstance(e, httpx.HTTPStatusError):
                         logger.error(f"JSON-2 Error: {e.response.text}")
                    raise e
                finally:
                    ODOO_INFLIGHT_COUNTER.dec()
                    dur = (time.time() - t0) * 1000
                    if dur > 500:
                        logger.info(f"Odoo Call {model}.{method} took {dur:.0f}ms")

    async def _jsonrpc_authenticate(self) -> str:
        # Authenticate using RPC client
        endpoint = f"{self.url}/web/session/authenticate"
        
        # DEBUG: unexpected credential issues
        masked = self.secret[:2] + "***" if self.secret else "None"
        logger.info(f"Odoo Auth: DB={self.db} Login={self.login} Pass={masked} URL={endpoint}")

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
        # Auth typically fast, use RPC client
        response = await self.rpc_client.post(endpoint, json=payload)
        data = response.json()
        if "error" in data:
            logger.error(f"Auth Response Payload: {json.dumps(data)}")
            raise Exception(f"Auth Error: {data['error']}")
        
        # Safe extraction of session_id to handle multiple cookies (CookieConflict)
        sid = None
        for cookie in response.cookies.jar:
             if cookie.name == "session_id":
                 sid = cookie.value
                 break # Take first
        return sid

    async def _jsonrpc_call_kw(self, model: str, method: str, args: List = None, kwargs: Dict = None) -> Any:
        async with RPC_SEMAPHORE:
            # Ensure session using RPC client cookies (manually managed or shared?)
            # Since rpc_client is separate, we need to ensure it has cookies if needed.
            # But Odoo JSON-RPC often works with stateless if 'uid' is passed or via session_id in header/cookie.
            # We'll rely on client cookie jar persistence for simplicity.
            
            # Use rpc_client cookies for auth check
            # Safe check to avoid CookieConflict
            has_sid = False
            for c in self.rpc_client.cookies.jar:
                if c.name == "session_id":
                    has_sid = True
                    break

            if not has_sid:
                 # Authenticate and set cookies on rpc_client
                 sid = await self._jsonrpc_authenticate()
                 self.rpc_client.cookies.set("session_id", sid)
                 self.stream_client.cookies.set("session_id", sid) # Share with stream client

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
            
            retries = 1
            for attempt in range(retries + 1):
                t0 = time.time()
                ODOO_INFLIGHT_COUNTER.inc()
                try:
                    response = await self.rpc_client.post(endpoint, json=payload)
                    data = response.json()
                    
                    if "error" in data:
                         if "Session expired" in str(data['error']):
                             logger.warning("Odoo Session expired, re-authenticating...")
                             sid = await self._jsonrpc_authenticate()
                             self.rpc_client.cookies.set("session_id", sid)
                             self.stream_client.cookies.set("session_id", sid)
                             response = await self.rpc_client.post(endpoint, json=payload)
                             data = response.json()
                    
                    if "error" in data:
                        raise Exception(f"RPC Error: {data['error']}")
                        
                    return data.get("result")
                    
                except (httpx.TimeoutException, httpx.ConnectError) as e:
                    if attempt < retries:
                        logger.warning(f"Odoo RPC Timeout/Error (Attempt {attempt+1}/{retries+1}): {e}. Retrying...")
                        continue
                    logger.error(f"Odoo RPC Failed after {retries+1} attempts: {e}")
                    raise e
                finally:
                    ODOO_INFLIGHT_COUNTER.dec()
                    dur = (time.time() - t0) * 1000
                    if dur > 500:
                        logger.info(f"Odoo RPC {model}.{method} took {dur:.0f}ms")

    async def search_read(self, model: str, domain: List, fields: List[str] = None, limit: int = 0, offset: int = 0, order: str = None) -> List[Dict]:
        kwargs = {"fields": fields, "limit": limit, "offset": offset}
        if order:
            kwargs["order"] = order
            
        try:
            if self.auth_type == OdooAuthType.JSON2_APIKEY:
                return await self._json2_call(model, "search_read", args=[domain], kwargs=kwargs)
            else:
                return await self._jsonrpc_call_kw(model, "search_read", args=[domain], kwargs=kwargs)
        except Exception as e:
            logger.warning(f"Odoo Call Failed: {e}")
            raise e
            
    async def search_count(self, model: str, domain: List) -> int:
        """Count records matching domain."""
        return await self.call_kw(model, 'search_count', args=[domain])

    async def call_kw(self, model: str, method: str, args: List = None, kwargs: Dict = None) -> Any:
        return await self._jsonrpc_call_kw(model, method, args=args, kwargs=kwargs)

    async def fields_get(self, model: str) -> set:
        """
        Fetch available fields for a model with 10-minute caching.
        Thread-safe keyed cache by (url, db, model).
        """
        now = time.time()
        cache_key = (self.url, self.db, model)
        
        # 1. Read outside lock
        cached = _FIELDS_CACHE.get(cache_key)
        if cached and now < cached["expires"]:
            return cached["fields"]
            
        async with _FIELDS_LOCK:
            # 2. Re-check inside lock
            cached = _FIELDS_CACHE.get(cache_key)
            if cached and now < cached["expires"]:
                return cached["fields"]
                
            try:
                # fields_get usually returns a dict {field_name: {string, type, ...}}
                res = await self.call_kw(model, 'fields_get', kwargs={'attributes': ['string']})
                if isinstance(res, dict):
                    field_set = set(res.keys())
                    _FIELDS_CACHE[cache_key] = {
                        "fields": field_set,
                        "expires": now + FIELDS_CACHE_TTL
                    }
                    return field_set
            except Exception as e:
                logger.warning(f"Failed to fetch fields_get for {model}: {e}")
            
            return set() # Fallback to empty

    # --- Activity Management (Keep existing helpers) ---
    async def get_activity_type_id(self, name: str) -> Optional[int]:
        try:
            results = await self.search_read('mail.activity.type', [['name', '=', name]], ['id'], limit=1)
            return results[0]['id'] if results else None
        except:
            return None

    async def find_activities_for_mo(self, odoo_mo_id: int, activity_type_id: int) -> List[Dict]:
        domain = [['res_model', '=', 'mrp.production'], ['res_id', '=', odoo_mo_id], ['active', '=', True]]
        if activity_type_id:
            domain.append(['activity_type_id', '=', activity_type_id])
        try:
            return await self.search_read('mail.activity', domain, ['id', 'summary', 'date_deadline', 'activity_type_id'])
        except:
            return []

    async def close_activities(self, activity_ids: List[int]) -> bool:
        if not activity_ids: return True
        try:
            await self.call_kw('mail.activity', 'action_done', args=[activity_ids])
            return True
        except:
             try:
                await self.call_kw('mail.activity', 'write', args=[activity_ids, {'active': False}])
                return True
             except Exception as e:
                raise e

    # --- Streaming ---

    async def get_attachment_stream_context(self, attachment_id: int, extra_headers: Optional[Dict[str, str]] = None):
        """
        Return a context manager for streaming using specific Stream Semaphore and Timeout.
        Usage:
            async with client.get_attachment_stream_context(aid, extra_headers) as resp:
                ...
        """
        async with STREAM_SEMAPHORE:
             # Ensure auth on stream_client
             has_stream_sid = False
             for c in self.stream_client.cookies.jar:
                 if c.name == "session_id":
                     has_stream_sid = True
                     break

             if not has_stream_sid:
                 try:
                     # Authenticate with RPC client first to get ID
                     sid = await self._jsonrpc_authenticate()
                     self.stream_client.cookies.set("session_id", sid)
                     self.rpc_client.cookies.set("session_id", sid)
                 except Exception as e:
                     logger.error(f"Stream Auth Failed: {e}")
                     raise
            
             url = f"{self.url}/web/content/{attachment_id}"
             return self.stream_client.stream("GET", url, headers=extra_headers)
