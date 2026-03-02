import httpx
import sys
import time

print("Waiting for server reload...")
time.sleep(3) 

try:
    print("Fetching /odoo/mos to check for manual request...")
    r = httpx.get('http://localhost:8000/api/v1/odoo/mos', timeout=30)
    print(f"Status: {r.status_code}")
    
    if r.status_code != 200:
        print(f"Failed: {r.text}")
        sys.exit(1)

    data = r.json()
    print(f"Found {len(data)} items.")
    
    # Check for our manual request (1214)
    found = False
    for item in data:
        # print(f"Item: {item.get('id')} - {item.get('name')} - {item.get('origin')}")
        if str(item.get('id')) == '1214': 
             print("SUCCESS: Found Manual Request 1214 in the list!")
             # print(item)
             found = True
             break
    
    if not found:
        print("WARNING: Manual request 1214 NOT found in list. (Maybe Odoo ID mismatch or not open?)")
        # Ensure we have a manual request created
        # We created it in previous step.
        print("Detailed list:")
        for item in data:
            print(f" - {item.get('id')} {item.get('name')} {item.get('origin')}")
            
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
