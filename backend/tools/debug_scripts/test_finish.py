import requests

BASE_URL = "http://localhost:8000/api/v1"
BATCH_ID = "0721148b-0085-4c5f-bd9f-b990a942ae9c" # From previous valid batch

def test_finish():
    print(f"Testing Finish Batch {BATCH_ID}...")
    try:
        url = f"{BASE_URL}/batches/{BATCH_ID}/finish"
        res = requests.post(url)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
    except Exception as e:
        print(f"EXCEPTION: {e}")

if __name__ == "__main__":
    test_finish()
