import asyncio
import sys
from app.services.odoo_client import OdooClient
from app.core.config import settings

async def check():
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        print("Checking hr.employee fields...")
        fields = await client.call_kw('hr.employee', 'fields_get', kwargs={'attributes': ['string', 'type']})
        
        # Filter fields that might be CPF
        print("\n=== hr.employee fields ===")
        for k, v in sorted(fields.items()):
            if any(x in k.lower() for x in ['cpf', 'ident', 'cnpj', 'doc', 'vat', 'ssn']):
                print(f"FIELD: {k} | NAME: {v['string']} | TYPE: {v['type']}")
            
        # Also check res.users fields
        print("\n=== res.users fields ===")
        user_fields = await client.call_kw('res.users', 'fields_get', kwargs={'attributes': ['string', 'type']})
        for k, v in sorted(user_fields.items()):
            if any(x in k.lower() for x in ['cpf', 'ident', 'cnpj', 'doc', 'vat', 'login']):
                print(f"FIELD: {k} | NAME: {v['string']} | TYPE: {v['type']}")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(check())
