import asyncio
import sys
from app.services.odoo_client import OdooClient
from app.core.config import settings

async def list_fields():
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        print("Fetching all hr.employee fields...")
        fields = await client.call_kw('hr.employee', 'fields_get', kwargs={'attributes': ['string', 'type', 'help']})
        
        with open('hr_employee_fields.txt', 'w', encoding='utf-8') as f:
            for k in sorted(fields.keys()):
                info = fields[k]
                f.write(f"FIELD: {k}\n")
                f.write(f"LABEL: {info.get('string')}\n")
                f.write(f"TYPE: {info.get('type')}\n")
                f.write(f"HELP: {info.get('help', '')}\n")
                f.write("-" * 20 + "\n")
        
        print("Fields saved to hr_employee_fields.txt")
        
        # Test 11-digit search again but properly
        print("Searching for 11-digit numbers in common fields...")
        # Since 'vat' failed, let's just stick to identification_id and any other promising ones
        promising = [k for k, v in fields.items() if any(x in v['string'].upper() for x in ['CPF', 'ID', 'IDENT', 'DOC'])]
        print(f"Promising fields: {promising}")
        
        records = await client.search_read('hr.employee', [['active', '=', True]], fields=['name'] + promising, limit=100)
        for r in records:
            for p in promising:
                val = str(r.get(p) or "")
                digits = "".join(filter(str.isdigit, val))
                if len(digits) == 11:
                    print(f"FOUND 11-DIGIT IN {p} for {r['name']}: {val}")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(list_fields())
