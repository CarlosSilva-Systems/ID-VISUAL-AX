import asyncio
import sys
import os

# Add parent dir to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.odoo_client import OdooClient
from app.core.config import settings

async def check_repr():
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    try:
        res = await client.search_read("res.users", [["id", "=", 49]], fields=["login", "name"])
        if res:
            print(f"Login (repr): {repr(res[0]['login'])}")
            print(f"Name (repr): {repr(res[0]['name'])}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(check_repr())
