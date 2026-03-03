
import urllib.request
import json
import os

url = "http://localhost:8000/api/v1/andon/tv-data"
try:
    with urllib.request.urlopen(url) as response:
        content = response.read().decode('utf-8')
        data = json.loads(content)
        
        # Check WC 27
        wc27 = next((w for w in data['workcenters'] if w['id'] == 27), None)
        print(f"WC 27: {json.dumps(wc27, indent=2)}")
        
        # Check active counts
        active = [w for w in data['workcenters'] if w['has_active_production']]
        print(f"Active WCs count: {len(active)}")
        if active:
            print(f"Sample Active: {active[0]['name']} - {active[0]['fabrication_code']}")
            
except Exception as e:
    print(f"Error fetching from {url}: {e}")
