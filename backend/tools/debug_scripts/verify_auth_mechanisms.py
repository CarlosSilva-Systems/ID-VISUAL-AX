import asyncio
import sys
import os

# Add parent dir to sys.path to allow absolute imports
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.odoo_client import OdooClient
from app.core.config import settings

async def verify_auth_mechanisms():
    print("=== Authentication Mechanism Verification ===")
    
    # 1. Test Odoo Session Capture
    print("\n1. Testing Odoo Session Capture...")
    client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc",
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    try:
        session_id = await client._jsonrpc_authenticate()
        print(f"SUCCESS: Captured session_id: {session_id[:8]}...")
        # Verify it's in cookies
        cookie_session = client.session.cookies.get("session_id")
        print(f"Cookie session_id present: {bool(cookie_session)}")
    except Exception as e:
        print(f"FAILED: Odoo Session Auth: {e}")
    finally:
        await client.close()

    # 2. Test Employee Logic (using service account)
    print("\n2. Testing Employee Fallback Logic (Service Account)...")
    service_client = OdooClient(
        url=settings.ODOO_URL,
        db=settings.ODOO_DB,
        auth_type="jsonrpc_password",
        login=settings.ODOO_LOGIN,
        secret=settings.ODOO_PASSWORD
    )
    try:
        # Search for an employee to use as a test case
        # We'll use a known name if possible, or just pick one
        employees = await service_client.search_read(
            "hr.employee", 
            domain=[["active", "=", True]], 
            fields=["name", "mobile_phone", "user_id"], 
            limit=5
        )
        
        if not employees:
            print("SKIPPED: No employees found to test fallback.")
        else:
            print(f"Found {len(employees)} employees. Testing first one without user_id if possible...")
            target = next((e for e in employees if not e.get('user_id')), employees[0])
            
            print(f"Target: {target['name']} | UserID: {target.get('user_id')} | Phone: {target.get('mobile_phone')}")
            
            # Simulate logic from auth.py
            import re
            def normalize_phone(p):
                return re.sub(r'\D', '', str(p or ""))
            
            stored_phone = normalize_phone(target.get('mobile_phone'))
            print(f"Normalized stored phone: {stored_phone}")
            
            if target.get("user_id"):
                print("Bypass Check: Employee has user_id. Fallback should be BLOCKED.")
            else:
                print("Bypass Check: Employee has NO user_id. Fallback should be ALLOWED.")
                if stored_phone:
                    print(f"Password Check: Phone '{target.get('mobile_phone')}' matches normalized digits.")
                else:
                    print("Password Check: Employee has no phone. Login will fail by design.")

    except Exception as e:
        print(f"FAILED: Employee Logic Check: {e}")
    finally:
        await service_client.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(verify_auth_mechanisms())
