import requests

try:
    # The user's URL: http://localhost:8000/api/v1/batches/66e011aa-7649-4628-9f5f-9ef6e254c099/matrix
    # Note: The ID might have changed if they created a new batch, but let's try the one in the log first.
    # actually, let's list batches first to get a valid ID if this one fails with 404.
    
    url = "http://localhost:8000/api/v1/batches/66e011aa-7649-4628-9f5f-9ef6e254c099/matrix"
    print(f"Requesting {url}...")
    res = requests.get(url)
    print(f"Status: {res.status_code}")
    print(f"Response: {res.text}")
    
except Exception as e:
    print(f"Error: {e}")
