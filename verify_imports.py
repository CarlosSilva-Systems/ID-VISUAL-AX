
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

print("Verifying imports...")
try:
    from app.api.api_v1.endpoints import id_requests
    print("Success: id_requests imported")
except Exception as e:
    print(f"Error importing id_requests: {e}")

try:
    from app.api.api_v1.endpoints import production
    print("Success: production imported")
except Exception as e:
    print(f"Error importing production: {e}")
    
try:
    from app.api.api_v1.endpoints import odoo
    print("Success: odoo imported")
except Exception as e:
    print(f"Error importing odoo: {e}")

try:
    from app.models.id_request import IDRequest
    print("Success: IDRequest model imported")
except Exception as e:
    print(f"Error importing IDRequest: {e}")
    
print("Verification done.")
