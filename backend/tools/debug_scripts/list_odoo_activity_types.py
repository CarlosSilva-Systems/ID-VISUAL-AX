import asyncio
from app.services.odoo_client import OdooClient
from app.core.config import settings

async def list_types():
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    print(f"Connecting to {settings.ODOO_URL}...")
    
    try:
        types = await client.search_read(
            'mail.activity.type', 
            domain=[], 
            fields=['id', 'name', 'summary'],
            order='id ASC'
        )
        
        with open("odoo_activity_types.txt", "w", encoding="utf-8") as f:
            f.write(f"Found {len(types)} Activity Types:\n")
            f.write("-" * 60 + "\n")
            f.write(f"{'ID':<10} | {'Name':<30} | {'Default Summary'}\n")
            f.write("-" * 60 + "\n")
            
            for t in types:
                f.write(f"{t['id']:<10} | {t['name']:<30} | {t.get('summary') or ''}\n")
                
            f.write("-" * 60 + "\n")
            print("Output written to odoo_activity_types.txt")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(list_types())
