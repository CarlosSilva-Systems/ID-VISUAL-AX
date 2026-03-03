
import asyncio
import os
import sys

# Ensure backend folder is in path
sys.path.append(os.getcwd())

from app.services.odoo_client import OdooClient
from app.core.config import settings

async def diagnostic():
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        print(f"--- Diagnostic: Odoo Workcenters Fields ---")
        wc_fields = await client.get_model_fields('mrp.workcenter')
        print(f"Fields containing 'online', 'status', 'state', or 'activity' in mrp.workcenter:")
        for f in wc_fields:
            if any(x in f.lower() for x in ['online', 'status', 'state', 'active']):
                print(f"  - {f}")

        print("\n--- Diagnostic: mrp.workorder Analysis ---")
        # Let's fetch some WOs and see ALL their fields
        wos = await client.search_read(
            'mrp.workorder',
            domain=[['workcenter_id', '=', 27]], # Focusing on Mariany's workcenter
            fields=['name', 'state', 'date_start', 'date_finished', 'production_id', 'user_id'],
            limit=5
        )
        print(f"Mariany Rodriguez (WC 27) WOs:")
        for wo in wos:
            print(f"  WO: {wo.get('name')}")
            print(f"    State: {wo.get('state')} (Type: {type(wo.get('state'))})")
            print(f"    Start: {wo.get('date_start')} (Type: {type(wo.get('date_start'))})")
            print(f"    Finish: {wo.get('date_finished')} (Type: {type(wo.get('date_finished'))})")
            print(f"    Production: {wo.get('production_id')}")

        print("\n--- Diagnostic: Production 365 (WH/FAB/01573) ---")
        p_data = await client.search_read(
            'mrp.production',
            domain=[['id', '=', 365]],
            fields=['name', 'x_studio_nome_da_obra', 'origin', 'state', 'product_id']
        )
        if p_data:
             print(f"  Data: {p_data[0]}")

    except Exception as e:
        print(f"Critical error during diagnostic: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(diagnostic())
