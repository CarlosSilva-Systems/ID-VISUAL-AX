
import requests
import json

try:
    r = requests.get('http://localhost:8000/api/v1/andon/tv-data', timeout=20)
    data = r.json()
    wc27 = [w for w in data['workcenters'] if w['id'] == 27]
    print(json.dumps(wc27, indent=2))
except Exception as e:
    print(f"Error: {e}")
