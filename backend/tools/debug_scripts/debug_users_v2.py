import asyncio
import sys
import os

# Add parent dir to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.odoo_client import OdooClient
from app.core.config import settings

async def debug_user_search_v2():
    print("=== Debugging User Search v2 ===")
    
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        # 1. Search for any user with 'davi'
        print("\n1. Searching for logins containing 'davi'...")
        res = await client.search_read("res.users", [["login", "ilike", "davi"]], fields=["id", "login", "name", "email"])
        for u in res:
            print(f" - ID: {u['id']}, Login: {u['login']}, Name: {u['name']}, Email: {u.get('email')}")
            
        # 2. Test authenticate with BOTH
        logins = ["davi.teles@axautomacao.com.br", "davi-teles@axautomacao.com.br"]
        for l in logins:
            print(f"\n2. Authenticating as '{l}'...")
            try:
                # We can't easily call _jsonrpc_authenticate here because it changes client state, 
                # but we can use xmlrpc for a quick check.
                import xmlrpc.client
                common = xmlrpc.client.ServerProxy(f"{settings.ODOO_URL}/xmlrpc/2/common")
                uid = common.authenticate(settings.ODOO_DB, l, settings.ODOO_PASSWORD, {})
                print(f"Auth Result for {l}: {uid}")
            except Exception as e:
                print(f"Auth Failed for {l}: {e}")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(debug_user_search_v2())
