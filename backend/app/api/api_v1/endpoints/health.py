import xmlrpc.client
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

@router.get("/health")
def health_check():
    odoo_status = "disconnected"
    odoo_version = None
    
    try:
        common = xmlrpc.client.ServerProxy(f'{settings.ODOO_URL}/xmlrpc/2/common')
        uid = common.authenticate(settings.ODOO_DB, settings.ODOO_LOGIN, settings.ODOO_PASSWORD, {})
        if uid:
            odoo_status = "connected"
            # Optional: get version
            # odoo_version = common.version()
    except Exception as e:
        odoo_status = f"error: {str(e)}"

    
    from app.api.api_v1.endpoints import batches
    batch_file = getattr(batches, '__file__', 'unknown')
    
    return {
        "status": "ok", 
        "backend": "running", 
        "odoo": odoo_status,
        "odoo_db": settings.ODOO_DB,
        "debug_batch_file": str(batch_file)
    }
