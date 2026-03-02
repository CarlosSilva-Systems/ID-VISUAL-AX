import requests
try:
    res = requests.get("http://localhost:8000/api/v1/health")
    print(f"Health: {res.status_code} {res.text}")
except Exception as e:
    print(f"Health check failed: {e}")
