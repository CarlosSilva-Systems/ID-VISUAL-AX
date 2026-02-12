import requests
import sys

url = "http://localhost:8000/api/v1/health"
origin = "http://localhost:5173"

print(f"Testing CORS for: {url}")
print(f"Origin: {origin}")

try:
    response = requests.get(url, headers={"Origin": origin})
    print(f"Status Code: {response.status_code}")
    print("Headers:")
    for k, v in response.headers.items():
        print(f"  {k}: {v}")
        
    if response.status_code == 200:
        print("\nBody:")
        print(response.json())
        
        aca_origin = response.headers.get("access-control-allow-origin")
        if aca_origin == origin or aca_origin == "*":
             print("\nCORS RESULT: PASS (Access-Control-Allow-Origin present)")
        else:
             print(f"\nCORS RESULT: FAIL (Expected {origin}, got {aca_origin})")
    else:
        print(f"\nRequest Failed with status {response.status_code}")

except Exception as e:
    print(f"Exception: {e}")
