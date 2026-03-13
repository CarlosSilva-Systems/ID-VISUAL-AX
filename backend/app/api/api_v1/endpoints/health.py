from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

@router.get("/health")
async def health_check():
    return {
        "status": "ok", 
        "backend": "running", 
        "odoo": "skipped",
        "odoo_db": settings.ODOO_DB
    }
