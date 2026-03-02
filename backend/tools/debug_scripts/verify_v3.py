import asyncio
import sys
import os

# Add parent dir to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.odoo_client import OdooClient
from app.core.config import settings

async def test_v3():
    print("=== Odoo Stateless Verification (API Key) ===")
    print(f"URL: {settings.ODOO_URL}")
    print(f"DB: {settings.ODOO_DB}")
    print(f"Login: {settings.ODOO_LOGIN}")
    
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password", # Our refactored RPC mode
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        print("\n1. Testing Authentication (UID Fetch)...")
        uid = await client._jsonrpc_authenticate()
        print(f"SUCCESS: UID={uid}")
        
        print("\n2. Testing search_read (Execute KW)...")
        res = await client.search_read("res.users", [["id", "=", uid]], fields=["name", "company_id"])
        if res:
            print(f"SUCCESS: Logged in as '{res[0]['name']}' at company {res[0].get('company_id')}")
        else:
            print("FAILED: User not found in search_read")
            
        print("\n3. Testing Generic call_kw (search_count)...")
        count = await client.call_kw("res.users", "search_count", args=[[("id", "=", uid)]])
        print(f"SUCCESS: Count={count}")
        
        print("\nVERIFICATION COMPLETE: Stateless OdooClient is working perfectly.")
        
    except Exception as e:
        print(f"\nVERIFICATION FAILED: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_v3())
