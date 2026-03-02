import asyncio
import sys
import os

# Add parent dir to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.odoo_client import OdooClient
from app.core.config import settings

async def debug_user_search():
    target_login = "davi.teles@axautomacao.com.br"
    print(f"=== Debugging User Search for: {target_login} ===")
    
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        # 1. Direct search by login
        print(f"\n1. Searching res.users with login='{target_login}'...")
        res = await client.search_read("res.users", [["login", "=", target_login]], fields=["id", "login", "name"])
        print(f"Result: {res}")
        
        # 2. Case-insensitive search
        print(f"\n2. Searching res.users with login ilike '{target_login}'...")
        res_ilike = await client.search_read("res.users", [["login", "ilike", target_login]], fields=["id", "login", "name"])
        print(f"Result (ilike): {res_ilike}")
        
        # 3. List some users to see their login format
        print("\n3. Listing first 5 users to check format...")
        all_users = await client.search_read("res.users", [], fields=["login", "name"], limit=5)
        for u in all_users:
            print(f" - {u['login']} ({u['name']})")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(debug_user_search())
