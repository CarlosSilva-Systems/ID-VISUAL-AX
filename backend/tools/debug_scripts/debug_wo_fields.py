import asyncio
import os
import sys
import json

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
        
        # 1. Fetch one workorder to see ALL available fields
        res = await client.search_read(
            'mrp.workorder',
            domain=[['workcenter_id', '=', 17]],
            limit=1
        )
        
        if res:
            print("Found a Workorder. Fields:")
            # Sort fields for easier reading
            for k in sorted(res[0].keys()):
                val = res[0][k]
                # Truncate long values
                if isinstance(val, str) and len(val) > 50:
                    val = val[:50] + "..."
                print(f"  {k}: {val}")
        else:
            print("No workorder found for WC 17. Checking any workorder...")
            res_any = await client.search_read('mrp.workorder', domain=[], limit=1)
            if res_any:
                print("Found a generic Workorder. Fields:")
                for k in sorted(res_any[0].keys()):
                    print(f"  {k}")
            else:
                print("No workorders found at all!")
            
        await client.close()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
