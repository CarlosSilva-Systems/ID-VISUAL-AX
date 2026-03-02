import httpx
import asyncio

async def test_api_health():
    urls = [
        "http://localhost:8000/",
        "http://localhost:8000/api/v1/health",
        "http://localhost:8000/api/v1/openapi.json"
    ]
    
    async with httpx.AsyncClient() as client:
        for url in urls:
            try:
                print(f"Testing {url}...")
                response = await client.get(url)
                print(f"Status: {response.status_code}")
                if response.status_code == 200:
                    print(f"Response: {response.json() if 'json' in response.headers.get('content-type', '') else 'Non-JSON'}")
            except Exception as e:
                print(f"Error connecting to {url}: {e}")

if __name__ == "__main__":
    asyncio.run(test_api_health())
