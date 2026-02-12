import httpx
import asyncio
import os

# Manual config to avoid env loading issues
url = "https://teste-dres.odoo.com"
db = "teste-dres"
username = "davi.teles@axautomacao.com.br"
password = "*depti_AX*"

async def test_jsonrpc():
    print(f"Testing JSON-RPC to: {url}")
    print(f"DB: {db}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Authenticate
        endpoint = f"{url}/web/session/authenticate"
        payload = {
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "db": db,
                "login": username,
                "password": password
            },
            "id": 1
        }
        
        print(f"Sending Auth Request...")
        try:
            response = await client.post(endpoint, json=payload)
            print(f"Status: {response.status_code}")
            
            data = response.json()
            if "error" in data:
                print(f"ERROR: {data['error']}")
                return
            
            result = data.get("result", {})
            uid = result.get("uid")
            print(f"Auth Success! UID: {uid}")
            
            # Check Cookies
            session_id = client.cookies.get("session_id")
            print(f"Session ID Cookie: {session_id}")
            
            if not session_id and not uid:
                print("FAILED: No UID and No Session ID returned.")
            else:
                print("VERIFIED: JSON-RPC Auth works and returns session/user info.")
                
        except Exception as e:
            print(f"Exception: {e}")

if __name__ == "__main__":
    asyncio.run(test_jsonrpc())
