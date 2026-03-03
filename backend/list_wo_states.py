
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
        print("--- Fetching all mrp.workorder states ---")
        # Search for all WOs and get unique states
        wos = await client.search_read(
            'mrp.workorder',
            domain=[],
            fields=['state'],
            limit=500
        )
        states = set(wo.get('state') for wo in wos if wo.get('state'))
        print(f"Observed States in Odoo: {list(states)}")
        
        # Also check model field selection if possible
        fields = await client.get_model_fields('mrp.workorder')
        if 'state' in fields:
            # Note: Odoo XML-RPC often doesn't return selection values via simple fields fetch 
            # but we can try to find them in the observed data.
            pass

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(diagnostic())
