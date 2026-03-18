import sys
import os
import uuid
import app

from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
    allow_origins=[str(origin).rstrip('/') for origin in settings.BACKEND_CORS_ORIGINS] + ["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
async def root():
    return {"message": "Hello World"}
