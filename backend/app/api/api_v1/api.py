from fastapi import APIRouter
from app.api.api_v1.endpoints import (
    health, batches, odoo, production, id_requests, documents, auth, andon, sync, webhook, settings as system_settings,
    mpr_analytics
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(sync.router, prefix="/sync", tags=["sync"])
api_router.include_router(batches.router, prefix="/batches", tags=["batches"])
api_router.include_router(odoo.router, prefix="/odoo", tags=["odoo"])
api_router.include_router(documents.router, prefix="/odoo", tags=["odoo_docs"])
api_router.include_router(production.router, prefix="/production", tags=["production"])
api_router.include_router(id_requests.router, prefix="/id-requests", tags=["id-requests"])
api_router.include_router(andon.router, prefix="/andon", tags=["andon"])
api_router.include_router(system_settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(webhook.router, prefix="/webhook", tags=["webhook"])
api_router.include_router(mpr_analytics.router, prefix="/mpr/analytics", tags=["mpr_analytics"])
