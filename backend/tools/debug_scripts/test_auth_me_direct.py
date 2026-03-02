import asyncio
import sys
import os
import logging

sys.stdout.reconfigure(line_buffering=True)
logging.basicConfig(level=logging.DEBUG)

sys.path.append(os.path.join(os.getcwd(), 'backend'))
from app.services.odoo_client import OdooClient
from app.core.config import settings
from app.api.api_v1.endpoints.auth import read_users_me
from app.core.security import create_access_token

async def test_auth_me():
    token = create_access_token(subject="davi.teles@axautomacao.com.br")
    print(f"Token created for davi: {token}")
    
    odoo_client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type=settings.ODOO_AUTH_TYPE,
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        res = await read_users_me(user_token=token, odoo=odoo_client)
        print(f"Result: {res}")
    except Exception as e:
        print(f"Exception: {repr(e)}")
    finally:
        await odoo_client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_auth_me())
