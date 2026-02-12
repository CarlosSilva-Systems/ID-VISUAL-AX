from fastapi import APIRouter
from app.api.api_v1.endpoints import health, batches, odoo, production, id_requests

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(batches.router, prefix="/batches", tags=["batches"])
api_router.include_router(odoo.router, prefix="/odoo", tags=["odoo"])
api_router.include_router(production.router, prefix="/production", tags=["production"])
api_router.include_router(id_requests.router, prefix="/id-requests", tags=["id-requests"])

