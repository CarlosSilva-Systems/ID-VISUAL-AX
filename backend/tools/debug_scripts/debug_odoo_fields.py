import asyncio
import os
import sys

# Adiciona o diretório atual ao path para importar 'app'
sys.path.append(os.getcwd())

from app.services.odoo_client import OdooClient
from app.core.config import settings

async def main():
    try:
        client = OdooClient(
            url=settings.ODOO_URL,
            db=settings.ODOO_DB,
            auth_type=settings.ODOO_AUTH_TYPE,
            login=settings.ODOO_LOGIN,
            secret=settings.ODOO_PASSWORD
        )
        print(f"Connecting to {settings.ODOO_URL}...")
        
        # Test 1: mrp.workorder fields
        fields = await client.get_model_fields('mrp.workorder')
        qty_fields = [k for k in fields.keys() if 'qty' in k.lower()]
        print(f"mrp.workorder qty fields: {qty_fields}")
        
        # Test 2: Try to fetch a WO for the specific workcenter 17
        res = await client.search_read(
            'mrp.workorder',
            domain=[['workcenter_id', '=', 17]],
            fields=['id', 'name', 'state', 'production_id'],
            limit=5
        )
        print(f"Found {len(res)} workorders for WC 17:")
        for r in res:
            print(f"  ID: {r.get('id')} Name: {r.get('name')} State: {r.get('state')}")
            
        await client.close()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
