
import urllib.request
import json

try:
    with urllib.request.urlopen('http://localhost:8000/api/v1/andon/tv-data') as response:
        data = json.loads(response.read().decode())
        wc27 = [w for w in data['workcenters'] if w['id'] == 27]
        print(json.dumps(wc27, indent=2))
except Exception as e:
    print(f"Error: {e}")
