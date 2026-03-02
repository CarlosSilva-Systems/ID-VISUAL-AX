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
        
        fields = await client.get_model_fields('mrp.workorder')
        with open('mrp_workorder_fields.txt', 'w', encoding='utf-8') as f:
            for k in sorted(fields.keys()):
                f.write(f"{k}\n")
        
        print("Fields written to mrp_workorder_fields.txt")
        await client.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
