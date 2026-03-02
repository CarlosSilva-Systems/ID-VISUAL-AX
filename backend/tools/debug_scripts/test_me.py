import asyncio
import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'backend'))
from app.core.security import create_access_token
import httpx

async def test_me():
    token = create_access_token(subject="davi.teles@axautomacao.com.br")
    print(f"Generated Token: {token}")
    
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        me_resp = await client.get("http://localhost:8000/api/v1/auth/me", headers=headers)
        print("Me Status:", me_resp.status_code)
        print("Me Body:", me_resp.text)

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_me())
