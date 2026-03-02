import asyncio
import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'backend'))
from app.services.odoo_client import OdooClient
from app.core.config import settings

async def test_domains():
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    login = "davi.teles@axautomacao.com.br"
    
    tests = [
        ["login", "=", login],
        ["login", "ilike", login],
        ["login", "=ilike", login],
        ["email", "=", login],
        ["email", "ilike", login]
    ]
    
    for t in tests:
        try:
            res = await client.search_read("res.users", [t], fields=["id", "login"])
            print(f"Domain {t} -> {len(res)} results")
        except Exception as e:
            print(f"Domain {t} -> ERROR: {e}")
            
    await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_domains())
