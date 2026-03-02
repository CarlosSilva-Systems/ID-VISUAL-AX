import asyncio
import sys
from app.services.odoo_client import OdooClient
from app.core.config import settings

async def diagnose():
    print("--- Odoo Diagnostic Tool ---")
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        with open("debug_output.txt", "w", encoding="utf-8") as f:
            # 1. Check specifics
            f.write("Checking Activity Types...\n")
            types = await client.search_read('mail.activity.type', domain=[], fields=['id', 'name'])
            
            target = "Imprimir ID Visual"
            exact = next((t for t in types if t['name'] == target), None)
            f.write(f"Exact match for '{target}': {exact}\n")
            
            # Check similar names
            similar = [t for t in types if "Visual" in t['name'] or "Imprimir" in t['name']]
            f.write(f"Similar types: {similar}\n")

            # 2. Search Activities on mrp.production
            f.write("\nSearching Activities...\n")
            
            # Simple broad search first
            activities = await client.search_read(
                'mail.activity', 
                domain=[
                    ['res_model', '=', 'mrp.production'],
                     '|',
                     ['summary', 'ilike', 'Imprimir'],
                     ['summary', 'ilike', 'Visual']
                ], 
                fields=['id', 'summary', 'activity_type_id', 'res_id', 'active'],
                limit=50
            )
            
            f.write(f"Found {len(activities)} activities matching 'Imprimir' or 'Visual':\n")
            
            res_ids = [a['res_id'] for a in activities if a.get('res_id')]
            
            # Fetch MOs to check state
            mo_map = {}
            if res_ids:
                mos = await client.search_read(
                    'mrp.production',
                    domain=[['id', 'in', res_ids]],
                    fields=['id', 'name', 'state']
                )
                mo_map = {m['id']: m for m in mos}

            for a in activities:
                f.write(f" - Activity ID: {a['id']}\n")
                f.write(f"   Summary: '{a.get('summary')}'\n")
                f.write(f"   Anatomy: Type={a.get('activity_type_id')} | Active={a.get('active')}\n")
                
                # Check linked MO
                rid = a.get('res_id')
                if rid:
                    mo = mo_map.get(rid)
                    if mo:
                        f.write(f"   -> Linked MO: {mo['id']} ({mo['name']}) | State='{mo['state']}'\n")
                    else:
                        f.write(f"   -> Linked MO: {rid} NOT FOUND (Access/Deleted)\n")
                else:
                    f.write(f"   -> No Linked MO (res_id is empty)\n")

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(diagnose())
