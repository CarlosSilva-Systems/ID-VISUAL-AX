import asyncio
import sys
import os
import logging

# Ensure stdout is unbuffered
sys.stdout.reconfigure(line_buffering=True)
logging.basicConfig(level=logging.INFO)

sys.path.append(os.path.join(os.getcwd(), 'backend'))
from app.services.odoo_client import OdooClient
from app.core.config import settings

async def test_search():
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    login_to_test = "davi.teles@axautomacao.com.br"
    print(f"Testing get_user_info for: {login_to_test}")
    try:
        res = await client.get_user_info(login_to_test)
        print(f"Result Odoo: {res}")
        
        # Test employee fallback
        print("Testing Employee fallback:")
        employees = await client.search_read(
            "hr.employee",
            [["name", "=ilike", login_to_test], ["active", "=", True]],
            fields=["id", "name"],
            limit=1
        )
        print(f"Result Employee: {employees}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_search())
