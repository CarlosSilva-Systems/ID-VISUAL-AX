import asyncio
import sys
from app.services.odoo_client import OdooClient
from app.core.config import settings

async def diagnose():
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        print("=== Odoo Auth Diagnosis ===")
        
        # 1. Search for fields mentioning CPF
        all_fields = await client.call_kw('hr.employee', 'fields_get', kwargs={'attributes': ['string']})
        
        print("\nFields mentioning 'CPF':")
        for k, v in all_fields.items():
            if 'CPF' in v['string'].upper() or 'CPF' in k.upper():
                print(f"- Field: {k} | Label: {v['string']}")
        
        # 2. Look for a sample employee and try to find where CPF is stored
        # ...
        
        # 2. Look for a sample employee and try to find where CPF is stored
        # We will search for fields that have 11 digits
        records = await client.search_read(
            'hr.employee', 
            domain=[['active', '=', True]], 
            fields=['name', 'identification_id', 'vat'], 
            limit=50
        )
        
        print("\nSearching for CPF (11 digits) in employee records...")
        cpf_found = False
        for emp in records:
            name = emp['name']
            ident = str(emp.get('identification_id') or '')
            vat = str(emp.get('vat') or '')
            
            # Clean non-digits
            ident_digits = "".join(filter(str.isdigit, ident))
            vat_digits = "".join(filter(str.isdigit, vat))
            
            if len(ident_digits) == 11:
                print(f"!!! CPF found in identification_id for {name}: {ident}")
                cpf_found = True
            if len(vat_digits) == 11:
                print(f"!!! CPF found in vat for {name}: {vat}")
                cpf_found = True
                
        if not cpf_found:
            print("No 11-digit CPF found in identification_id or vat for the first 50 employees.")
            # Let's check more fields
            sample = records[0]
            print(f"Sample record fields: {sample}")
        
        # 3. Test direct JSON-RPC authentication (what auth.py does)
        print("\nTesting Session Authentication (JSON-RPC)...")
        # We'll try to authenticate with the service account credentials first to see if the method works
        endpoint = f"{settings.ODOO_URL.rstrip('/')}/web/session/authenticate"
        import httpx
        async with httpx.AsyncClient() as session:
            payload = {
                "jsonrpc": "2.0",
                "method": "call",
                "params": {
                    "db": settings.ODOO_DB,
                    "login": settings.ODOO_LOGIN,
                    "password": settings.ODOO_PASSWORD
                },
                "id": 1
            }
            resp = await session.post(endpoint, json=payload)
            print(f"Response Status: {resp.status_code}")
            data = resp.json()
            if "error" in data:
                print(f"Auth Error: {data['error']}")
            else:
                print(f"Auth Success! Result keys: {data.get('result', {}).keys()}")
                session_id = resp.cookies.get("session_id")
                print(f"Session ID in Cookies: {session_id}")
                if not session_id and "session_id" in data.get("result", {}):
                    print(f"Session ID in Result: {data['result']['session_id']}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(diagnose())
