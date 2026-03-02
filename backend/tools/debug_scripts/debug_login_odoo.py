import asyncio
from app.services.odoo_client import OdooClient
from app.core.config import settings
import logging

logging.basicConfig(level=logging.INFO)

async def test_login():
    # Use credentials from .env via settings
    print(f"Testing Odoo Login for: {settings.ODOO_URL}")
    print(f"DB: {settings.ODOO_DB}")
    
    # Try with service account first to see if it's alive
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        uid = await client._jsonrpc_authenticate()
        print(f"Service Account Login Success! UID: {uid}")
    except Exception as e:
        print(f"Service Account Login Failed: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(test_login())
