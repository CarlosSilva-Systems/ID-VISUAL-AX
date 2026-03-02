import asyncio
import sys
from app.services.odoo_client import OdooClient
from app.core.config import settings

async def main():
    print("--- Verifying Odoo Connection ---")
    try:
        client = OdooClient(
           url=settings.ODOO_URL,
           db=settings.ODOO_DB,
           auth_type="jsonrpc_password",
           login=settings.ODOO_LOGIN,
           secret=settings.ODOO_PASSWORD
        )
        print("Authenticating...")
        # search_read triggers auth implicitly or we can check version/uid
        # Let's search for MOs
        print("Searching for MOs (state in ['draft', 'confirmed', 'progress'])...")
        mos = await client.search_read(
            'mrp.production',
            domain=[['state', 'in', ['draft', 'confirmed', 'progress']]],
            fields=['id', 'name', 'state'],
            limit=5
        )
        await client.close()
        
        if mos:
            print(f"SUCCESS. Found {len(mos)} MOs.")
            for mo in mos:
                print(f"MO FULL DATA: {mo}")
                # Check type of x_studio_nome_da_obra
                val = mo.get('x_studio_nome_da_obra')
                print(f"x_studio_nome_da_obra type: {type(val)} value: {val}")
            print(f"VALID_ID_FOR_TEST={mos[0]['id']}")
        else:
            print("SUCCESS connection, but NO MOs found.")
            
    except Exception as e:
        print(f"FAIL: Odoo Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
