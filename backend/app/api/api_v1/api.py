from fastapi import APIRouter
from app.api.api_v1.endpoints import (
    health, batches, odoo, production, id_requests, documents, auth, andon, andon_dashboard, sync, webhook, settings as system_settings,
    mpr_analytics, agent, custom_reports, user_config, devices, ota, id_visual_analytics, diagnostics, print_labels, print_queue, eplan, print_wago, door_presets
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(sync.router, prefix="/sync", tags=["sync"])
api_router.include_router(user_config.router, prefix="/user", tags=["user_config"])
api_router.include_router(batches.router, prefix="/batches", tags=["batches"])
api_router.include_router(odoo.router, prefix="/odoo", tags=["odoo"])
api_router.include_router(documents.router, prefix="/odoo", tags=["odoo_docs"])
api_router.include_router(production.router, prefix="/production", tags=["production"])
api_router.include_router(id_requests.router, prefix="/id-requests", tags=["id-requests"])
api_router.include_router(andon_dashboard.router, prefix="/andon/dashboard", tags=["andon_dashboard"])
api_router.include_router(andon.router, prefix="/andon", tags=["andon"])
api_router.include_router(system_settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(webhook.router, prefix="/webhook", tags=["webhook"])
api_router.include_router(mpr_analytics.router, prefix="/mpr/analytics", tags=["mpr_analytics"])
api_router.include_router(agent.router, prefix="/agent", tags=["agent"])
api_router.include_router(custom_reports.router, prefix="/reports", tags=["custom_reports"])
api_router.include_router(devices.router, prefix="/devices", tags=["iot_devices"])
api_router.include_router(ota.router, tags=["ota"])
api_router.include_router(id_visual_analytics.router, prefix="/id-visual/analytics", tags=["id_visual_analytics"])
api_router.include_router(diagnostics.router, prefix="/diagnostics", tags=["diagnostics"])
api_router.include_router(print_labels.router, prefix="/id-visual", tags=["print_labels"])
api_router.include_router(print_queue.router, prefix="/print", tags=["print_queue"])
api_router.include_router(eplan.router, prefix="/id-visual/eplan", tags=["eplan"])
api_router.include_router(print_wago.router, prefix="/id-visual/print", tags=["print_wago"])
api_router.include_router(door_presets.router, prefix="/id-visual/door-presets", tags=["door_presets"])

