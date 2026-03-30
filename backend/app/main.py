import sys
import os
import uuid
import app

from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.api.api_v1.api import api_router

from contextlib import asynccontextmanager
import asyncio
import time
import logging

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

@app.get("/")
async def root():
    return {"message": "Hello World"}
