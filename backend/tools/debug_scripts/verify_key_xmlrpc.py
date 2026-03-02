import xmlrpc.client
from app.core.config import settings

def verify_xmlrpc():
    url = "https://id-projeto.odoo.com"
    db = "id-projeto"
    # Testing with David's email JUST to verify the key validity
    username = "davi.teles@axautomacao.com.br"
    password = "*depti_AX*"
    
    print(f"Testing XML-RPC to: {url}")
    print(f"DB: {db}")
    print(f"User: {username}")
    
    try:
        common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
        print("Authenticating...")
        uid = common.authenticate(db, username, password, {})
        
        if uid:
            print(f"AUTHENTICATION SUCCESS! UID: {uid}")
            return True
        else:
            print("Authentication Failed.")
            return False
    except Exception as e:
        print(f"Connection Error: {e}")
        return False

if __name__ == "__main__":
    verify_xmlrpc()
