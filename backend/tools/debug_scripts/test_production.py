import requests

# Test blueprints only (no Odoo call)
r = requests.get('http://localhost:8000/api/v1/production/blueprints', timeout=5)
print(f'GET /blueprints: {r.status_code}')
if r.status_code == 200:
    import json
    data = r.json()
    for pt, tasks in data['panel_types'].items():
        codes = [t['code'] for t in tasks]
        print(f'  {pt}: {codes}')
else:
    print(f'Error: {r.text[:300]}')
