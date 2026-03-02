import httpx
import sys
import time

print("Waiting for server reload...")
time.sleep(3) # Give uvicorn a moment to reload with new code

try:
    print("Sending POST /production/request...")
    payload = {
        "odoo_mo_id": 1214,
        "panel_type": "comando",
        "id_types": ["ELESYS_EFZ"], 
        "requester_name": "Automatic Tester",
        "notes": "Verifying 500 fix"
    }
    r = httpx.post('http://localhost:8000/api/v1/production/request', json=payload, timeout=30)
    print(f"Status: {r.status_code}")
    print(f"Body: {r.text[:600]}")
    
    if r.status_code == 200:
        print("SUCCESS: Request created/returned successfully.")
    else:
        print("FAILURE: Request failed.")
        sys.exit(1)
        
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
