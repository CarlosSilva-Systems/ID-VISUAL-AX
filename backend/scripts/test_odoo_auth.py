import xmlrpc.client
import sys
import os

# Configuration from arguments or hardcoded for test
url = "https://teste-dres.odoo.com" 
db = "teste-dres" # Guessing based on subdomain
username = "davi.teles@axautomacao.com.br"
password = "*depti_AX*"

print(f"Testing Connection to: {url}")
print(f"Database Guess: {db}")
print(f"User: {username}")

try:
    common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
    print("Checking Odoo Version...")
    version = common.version()
    print(f"Odoo Version: {version}")
    
    print("Authenticating...")
    uid = common.authenticate(db, username, password, {})
    
    if uid:
        print(f"AUTHENTICATION SUCCESS! UID: {uid}")
        print(f"CORRECT DB NAME IS: {db}")
    else:
        print("Authentication Failed (UID is false). Possible wrong DB name or credentials.")
        
        # Try different DB names if guesses fail
        possible_dbs = ["odoo", "teste-dres-main", "teste", "dres"]
        for try_db in possible_dbs:
            print(f"Trying DB: {try_db}...")
            uid = common.authenticate(try_db, username, password, {})
            if uid:
                print(f"SUCCESS with DB: {try_db} (UID: {uid})")
                break
            
except Exception as e:
    print(f"Connection Error: {e}")
