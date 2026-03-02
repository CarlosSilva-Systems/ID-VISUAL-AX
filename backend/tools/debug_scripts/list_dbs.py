import xmlrpc.client

def list_dbs():
    url = "https://id-projeto.odoo.com"
    print(f"Listing DBs for: {url}")
    try:
        common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
        dbs = common.list()
        print(f"Available DBs: {dbs}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_dbs()
