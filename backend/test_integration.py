import requests
import json
import random

# Valid MO ID from Odoo
MO_ID = 1243

payload = {
    "mo_ids": [MO_ID]
}

try:
    print(f"Sending POST to http://localhost:8000/api/v1/batches/ with payload: {payload}")
    response = requests.post("http://localhost:8000/api/v1/batches/", json=payload)
    
    with open("integration_output.txt", "w") as f:
        f.write(f"Status Code: {response.status_code}\n")
        f.write(f"Response Headers: {response.headers}\n")
        try:
            f.write(f"Response JSON: {response.json()}\n")
        except:
            f.write(f"Response Text: {response.text}\n")
    print("Output written to integration_output.txt")

except Exception as e:
    print(f"Request Failed: {e}")
