import xmlrpc.client

def check_version():
    url = "https://id-projeto.odoo.com"
    print(f"Checking version for: {url}")
    try:
        common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
        version = common.version()
        print(f"Odoo Version: {version}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_version()
