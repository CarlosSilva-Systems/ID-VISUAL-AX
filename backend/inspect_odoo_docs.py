import asyncio
import sys
import os

# Add current directory to path so we can import app
sys.path.append(os.getcwd())

from app.services.odoo_client import OdooClient
from app.core.config import settings

async def inspect():
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    
    try:
        with open("debug_odoo_docs.txt", "w", encoding="utf-8") as f:
            f.write("--- Odoo Document Inspection ---\n")
            
            # 1. Fetch a few MOs
            f.write("Fetching some MOs...\n")
            mos = await client.search_read(
                'mrp.production',
                domain=[['state', 'not in', ['cancel', 'done']]],
                fields=['id', 'name', 'product_id'],
                limit=5
            )
            
            if not mos:
                f.write("No active MOs found to inspect.\n")
                return

            for mo in mos:
                f.write(f"\nInspecting MO: {mo['name']} (ID: {mo['id']})\n")
                product_raw = mo.get('product_id')
                if not product_raw:
                    f.write("No product linked to this MO.\n")
                    continue
                    
                product_id = product_raw[0] if isinstance(product_raw, (list, tuple)) else product_raw
                f.write(f"Product ID: {product_id} ({product_raw})\n")
                
                # 2. Inspect Product Fields
                f.write(f"Reading product.product (ID: {product_id}) schema...\n")
                
                try:
                    fields = await client.call_kw('product.product', 'fields_get', kwargs={'attributes': ['string', 'type', 'relation']})
                    # Filter for doc/attach related
                    doc_related = {k: v for k, v in fields.items() if any(x in k.lower() for x in ['doc', 'attach', 'file'])}
                    f.write(f"Document-related fields found: {list(doc_related.keys())}\n")
                    
                    # Try to read values for these fields
                    p_data = await client.search_read('product.product', domain=[['id', '=', product_id]], fields=list(doc_related.keys()))
                    
                    for fld, info in doc_related.items():
                        val = p_data[0].get(fld)
                        f.write(f" - {fld} ({info['type']} to {info.get('relation')}): {val}\n")
                        
                        if val and info['type'] in ['one2many', 'many2many']:
                            target_model = info.get('relation')
                            ids = val if isinstance(val, list) else [val]
                            ids = [i for i in ids if isinstance(i, int)]
                            if ids:
                                f.write(f"   Inspecting records in '{target_model}' for IDs {ids}...\n")
                                try:
                                    # Get fields for the target model too
                                    target_fields_map = await client.call_kw(target_model, 'fields_get', kwargs={'attributes': ['string', 'type']})
                                    # Just read some common fields
                                    target_fields = ['id', 'name', 'mimetype', 'datas', 'checksum', 'res_model', 'res_id']
                                    # Filter for what actually exists
                                    actual_target_fields = [tf for tf in target_fields if tf in target_fields_map]
                                    
                                    recs = await client.search_read(target_model, domain=[['id', 'in', ids]], fields=actual_target_fields, limit=5)
                                    for r in recs:
                                        # Don't write 'datas' as it's base64 and huge
                                        r_summary = {k: v for k, v in r.items() if k != 'datas'}
                                        f.write(f"    * Record: {r_summary}\n")
                                        if 'datas' in r:
                                            f.write(f"      (datas present, length: {len(r['datas']) if r['datas'] else 0})\n")
                                except Exception as e:
                                    f.write(f"   Error inspecting {target_model}: {e}\n")

                except Exception as e:
                    f.write(f"Error getting fields: {e}\n")

            # 3. Inspect product.document model schema
            f.write("\nInspecting product.document model schema...\n")
            try:
                doc_fields = await client.call_kw('product.document', 'fields_get', kwargs={'attributes': ['string', 'type', 'relation']})
                for k, v in doc_fields.items():
                    f.write(f" - {k}: {v}\n")
            except Exception as e:
                f.write(f"Error getting product.document fields: {e}\n")
                
            # 4. Try to search for ANY product.document to see what they look like
            f.write("\nSearching for ANY product.document...\n")
            try:
                all_docs = await client.search_read('product.document', domain=[], fields=['id', 'name', 'mimetype', 'res_model', 'res_id', 'company_id'], limit=10)
                for d in all_docs:
                    f.write(f" - Document: {d}\n")
            except Exception as e:
                f.write(f"Error searching product.document: {e}\n")

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(inspect())
