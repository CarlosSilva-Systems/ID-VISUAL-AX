import requests
import json

BASE_URL = "http://localhost:8000/api/v1"
BATCH_ID = "0721148b-0085-4c5f-bd9f-b990a942ae9c" # From valid_batch.txt

def test_update():
    # 1. Fetch Matrix to get a valid request_id and task_code
    print("1. Fetching Matrix...")
    try:
        res = requests.get(f"{BASE_URL}/batches/{BATCH_ID}/matrix")
        if res.status_code != 200:
            print(f"FAILED to get matrix: {res.status_code} {res.text}")
            return
        
        data = res.json()
        rows = data.get('rows', [])
        if not rows:
            print("No rows in batch.")
            return
            
        # Pick first row and a task
        row = rows[0]
        req_id = row['request_id']
        # Try to update WAGO_210_804 to 'montado'
        task_code = "WAGO_210_804" 
        
        print(f"2. Updating Task {task_code} for Req {req_id} to 'montado'...")
        
        payload = {
            "request_id": req_id,
            "task_code": task_code,
            "new_status": "montado",
            "version": 1 # Assuming version 1
        }
        
        res_patch = requests.patch(f"{BASE_URL}/batches/{BATCH_ID}/tasks", json=payload)
        
        print(f"   Status: {res_patch.status_code}")
        print(f"   Response: {res_patch.text}")
        
    except Exception as e:
        print(f"EXCEPTION: {e}")

if __name__ == "__main__":
    test_update()
