import requests
import sys

BASE_URL = "http://localhost:8000/api/v1"

def reproduce():
    print("1. Using VALID BATCH ID...")
    
    batch_id = "0721148b-0085-4c5f-bd9f-b990a942ae9c"
    print(f"   Batch ID: {batch_id}")
    
    print("3. Fetching Matrix...")
    try:
        res = requests.get(f"{BASE_URL}/batches/{batch_id}/matrix")
        if res.status_code != 200:
            print(f"Failed to get Matrix: {res.text}")
            return
            
        matrix = res.json()
        rows = matrix['rows']
        if not rows:
            print("No rows in matrix!")
            return
            
        req_id = rows[0]['request_id']
        task_code = "DOCS_Epson"
        print(f"   Row Request ID: {req_id}")
        
        print(f"4. Updating Task {task_code}...")
        payload = {
            "request_id": req_id,
            "task_code": task_code,
            "new_status": "montado",
            "version": 1
        }
        
        url = f"{BASE_URL}/batches/{batch_id}/tasks"
        print(f"   PATCHing {url} with {payload}")
        res = requests.patch(url, json=payload)
        
        print(f"   Status: {res.status_code}")
        print(f"   Response: {res.text}")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Exception: {e}")

if __name__ == "__main__":
    reproduce()
