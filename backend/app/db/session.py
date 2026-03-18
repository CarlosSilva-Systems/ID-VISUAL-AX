from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
poolclass = NullPool if "sqlite" in settings.DATABASE_URL else None

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    connect_args=connect_args,
    poolclass=poolclass
)

import asyncio
import logging

logger = logging.getLogger(__name__)

async def init_db():
    try:
        logger.info("Initializing database (sync fallback)...")
        from sqlalchemy import create_engine
        # Convert aiosqlite URL to standard sqlite
        sync_url = settings.DATABASE_URL.replace("+aiosqlite", "")
        sync_engine = create_engine(sync_url)
        
        # Run create_all synchronously
        SQLModel.metadata.create_all(sync_engine)
        logger.info("Tables created/verified successfully via sync engine.")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise e

async_session_factory = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_session() -> AsyncSession:
    async with async_session_factory() as session:
        yield session
