import asyncio
import httpx
import sys

async def main():
    login_data = {"username": "davi.teles@axautomacao.com.br", "password": "b458e1adcfe3961841676e97cc7dd20d92e411df"}
    async with httpx.AsyncClient() as client:
        resp = await client.post("http://localhost:8000/api/v1/auth/login", data=login_data)
        print("Login Status:", resp.status_code)
        print("Login Body:", resp.text)
        
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            headers = {"Authorization": f"Bearer {token}"}
            me_resp = await client.get("http://localhost:8000/api/v1/auth/me", headers=headers)
            print("Me Status:", me_resp.status_code)
            print("Me Body:", me_resp.text)

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
