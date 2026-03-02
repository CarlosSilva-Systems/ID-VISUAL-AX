import requests

# Test GET /finished
r = requests.get('http://localhost:8000/api/v1/batches/finished')
print(f'GET /finished: {r.status_code}')
if r.status_code == 200:
    data = r.json()
    print(f'  Count: {len(data)}')
    for item in data:
        print(f"  - {item.get('batch_name')} | Status: {item.get('batch_status')} | Items: {item.get('items_count')}")
        bid = item.get('batch_id')
    
    if data:
        # Test idempotency: finalize already-concluded batch
        bid = data[0]['batch_id']
        r2 = requests.patch(f'http://localhost:8000/api/v1/batches/{bid}/finalize')
        print(f'\nPATCH /finalize: {r2.status_code}')
        print(f'  Body: {r2.text[:500]}')
else:
    print(f'  Error: {r.text[:500]}')
