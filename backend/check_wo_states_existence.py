
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
        # Standard Odoo states: waiting, pending, ready, progress, done, cancel
        target_states = ['progress', 'ready', 'waiting', 'pending']
        print(f"--- Searching for active states: {target_states} ---")
        
        for state in target_states:
            wos = await client.search_read(
                'mrp.workorder',
                domain=[['state', '=', state]],
                fields=['id', 'state'],
                limit=1
            )
            if wos:
                print(f"State '{state}' exists and has records.")
            else:
                print(f"State '{state}' has no records in this search.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(diagnostic())
