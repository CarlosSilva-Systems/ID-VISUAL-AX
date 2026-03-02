import asyncio
import sys
import os

# Add parent dir to sys.path to allow absolute imports
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.odoo_client import OdooClient
from app.core.config import settings

async def verify_api_key():
    print("=== Odoo API Key Verification ===")
    print(f"URL: {settings.ODOO_URL}")
    print(f"DB: {settings.ODOO_DB}")
    print(f"Auth Type: {settings.ODOO_AUTH_TYPE}")
    print(f"Login: '{settings.ODOO_LOGIN}'")
    print(f"Key Prefix: {settings.ODOO_PASSWORD[:4]}...")

    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        # Test search_read (which uses _json2_call for JSON2_APIKEY)
        print("\nTesting search_read (JSON-2 / Bearer)...")
        res = await client.search_read("res.users", [["id", "=", 1]], fields=["name"], limit=1)
        print(f"Search Success: Found user '{res[0]['name'] if res else 'None'}'")
        
        # Test call_kw (which now also supports JSON2_APIKEY)
        print("\nTesting call_kw (JSON-2 / Bearer)...")
        # Just a simple count call
        count = await client.call_kw("res.users", "search_count", args=[[("id", "=", 1)]])
        print(f"Call_kw Success: Count result '{count}'")

        print("\nVERIFICATION SUCCESSFUL")

    except Exception as e:
        print(f"\nVERIFICATION FAILED: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(verify_api_key())
