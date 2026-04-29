import sys
import os
import uuid
import app

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pathlib import Path

from app.core.config import settings
from app.api.api_v1.api import api_router

from contextlib import asynccontextmanager
import asyncio
import time
import logging

# Configurar logging para capturar logs de todos os módulos
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s:     %(name)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up...")
    
    # Validação de segurança: variáveis de ambiente críticas
    required_vars = [
        "ODOO_URL",
        "ODOO_SERVICE_LOGIN",
        "ODOO_SERVICE_PASSWORD"
    ]
    
    missing = [var for var in required_vars if not getattr(settings, var, None)]
    
    if missing:
        error_msg = f"Missing required environment variables: {', '.join(missing)}"
        logger.error(error_msg)
        raise RuntimeError(error_msg)
    
    logger.info("✓ Environment validation passed")
    
    # Import all models so SQLModel metadata knows about them
    import app.models  # noqa: F401
    from app.db.session import init_db
    await init_db()
    logger.info("Database tables created/verified.")

    # Iniciar serviço MQTT
    from app.services.mqtt_service import start_mqtt_service
    start_mqtt_service()
    logger.info("✓ MQTT service started")

    # Iniciar monitor de devices offline
    from app.services.device_monitor_service import start_device_monitor
    start_device_monitor()
    logger.info("✓ Device monitor started")
    
    # Iniciar monitor de timeout OTA
    async def ota_timeout_monitor():
        """Background task que verifica dispositivos OTA travados a cada 60s."""
        from app.db.session import async_session_factory
        from app.services.ota_service import OTAService
        while True:
            try:
                await asyncio.sleep(60)
                async with async_session_factory() as session:
                    ota_service = OTAService(session)
                    timed_out = await ota_service.mark_timed_out_devices(timeout_minutes=10)
                    if timed_out > 0:
                        logger.warning(f"OTA timeout monitor: {timed_out} dispositivo(s) marcado(s) como timeout")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"OTA timeout monitor: erro — {e}")
    
    ota_timeout_task = asyncio.create_task(ota_timeout_monitor())
    logger.info("✓ OTA timeout monitor started")
    
    # Event Loop Watchdog
    async def loop_watchdog():
        logger.info("Watchdog started")
        while True:
            t0 = time.time()
            try:
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                break
            t1 = time.time()
            drift = (t1 - t0) - 1.0
            if drift > 0.5:
                # Use print for immediate stdout visibility
                print(f"CRITICAL: Event Loop Blocked for {drift:.2f}s! (Total Sleep: {t1-t0:.2f}s)")
                
    watchdog_task = asyncio.create_task(loop_watchdog())
    yield
    # Shutdown
    logger.info("Shutting down...")
    from app.services.mqtt_service import stop_mqtt_service
    stop_mqtt_service()
    from app.services.device_monitor_service import stop_device_monitor
    stop_device_monitor()
    ota_timeout_task.cancel()
    try:
        await ota_timeout_task
    except asyncio.CancelledError:
        pass
    watchdog_task.cancel()
    try:
        await watchdog_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# --- Rate Limiting ---
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.middleware("http")
async def db_session_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        logger.exception(f"Unhandled error [{request_id}]")
        return JSONResponse(
            status_code=500,
            content={"detail": "Erro interno do servidor", "request_id": request_id}
        )

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins() + ["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

# --- Static Files for OTA Firmware ---
# Configurar hospedagem estática de arquivos .bin para OTA
ota_storage_path = Path(settings.OTA_STORAGE_PATH)
ota_storage_path.mkdir(parents=True, exist_ok=True)

app.mount(
    "/static/ota",
    StaticFiles(directory=str(ota_storage_path)),
    name="ota_firmware"
)
logger.info(f"✓ OTA static files mounted at /static/ota/ -> {ota_storage_path}")

# Middleware para logging de downloads de firmware
@app.middleware("http")
async def log_firmware_downloads(request: Request, call_next):
    if request.url.path.startswith("/static/ota/"):
        client_ip = request.client.host if request.client else "unknown"
        filename = request.url.path.split("/")[-1]
        logger.info(f"OTA: Firmware download request - {filename} from {client_ip}")
    
    response = await call_next(request)
    return response

@app.get("/")
async def root():
    return {"message": "Hello World"}
