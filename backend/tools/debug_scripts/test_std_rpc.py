import httpx
import asyncio

async def test_standard_jsonrpc():
    url = "https://axengenharia1.odoo.com"
    db = "axengenharia1"
    user = "davi.teles@axautomacao.com.br"
    password = "b458e1adcfe3961841676e97cc7dd20d92e411df"
    
    print(f"Testing Standard JSON-RPC to: {url}")
    
    async with httpx.AsyncClient() as client:
        # First, we need the UID from XML-RPC or a similar call
        # For simplicity in this test, let's assume UID=49 (which we found earlier)
        uid = 49
        
        endpoint = f"{url}/jsonrpc"
        payload = {
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "service": "object",
                "method": "execute_kw",
                "args": [db, uid, password, "res.users", "search_read", [[["id", "=", uid]]], {"fields": ["name"]}]
            },
            "id": 1
        }
        
        try:
            response = await client.post(endpoint, json=payload)
            print(f"Status: {response.status_code}")
            data = response.json()
            if "error" in data:
                print(f"ERROR: {data['error']}")
            else:
                print(f"SUCCESS: {data['result']}")
        except Exception as e:
            print(f"Exception: {e}")

if __name__ == "__main__":
    asyncio.run(test_standard_jsonrpc())
