
import asyncio
import os
import sys

# Ensure backend folder is in path
sys.path.append(os.getcwd())

from app.services.odoo_client import OdooClient
from app.core.config import settings

async def test_andon_logic():
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        print(f"--- Testing logic from andon.py ---")
        domain = [
            ['date_finished', '=', False],
            ['state', 'in', ['progress', 'ready']]
        ]
        fields = ['workcenter_id', 'user_id', 'production_id', 'name', 'date_start', 'state']
        
        print(f"Querying mrp.workorder with domain: {domain}")
        active_wos = await client.search_read('mrp.workorder', domain=domain, fields=fields)
        print(f"Found {len(active_wos)} active workorders.")
        
        for wo in active_wos:
            wc = wo.get('workcenter_id')
            if wc and wc[0] == 27:
                print(f"MATCH WC 27: {wo}")
            elif wc:
                print(f"WC {wc[0]} ({wc[1]}): WO {wo['name']} State {wo['state']}")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(test_andon_logic())
