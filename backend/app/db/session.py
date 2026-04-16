from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool, AsyncAdaptedQueuePool

from app.core.config import settings

connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}

# Para SQLite: NullPool (sem pool, sem estado compartilhado)
# Para PostgreSQL: pool com pre_ping para detectar conexões mortas antes de usar,
# pool_recycle para descartar conexões antigas e evitar "connection closed" silencioso.
if "sqlite" in settings.DATABASE_URL:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        future=True,
        connect_args=connect_args,
        poolclass=NullPool,
    )
else:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        future=True,
        # pre_ping=True: executa "SELECT 1" antes de cada checkout do pool.
        # Detecta conexões mortas (timeout, restart do Postgres) e as descarta,
        # evitando o erro "connection is closed" / "invalid transaction".
        pool_pre_ping=True,
        # pool_recycle: descarta conexões com mais de 30 minutos para evitar
        # que o Postgres feche a conexão por inatividade antes do SQLAlchemy.
        pool_recycle=1800,
        # pool_size + max_overflow: limites razoáveis para uma API FastAPI async.
        pool_size=10,
        max_overflow=20,
    )

import asyncio
import logging

logger = logging.getLogger(__name__)

async def init_db():
    try:
        logger.info("Initializing database via async engine...")
        async with engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
        logger.info("Tables created/verified successfully.")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise e

async_session_factory = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_session() -> AsyncSession:
    """
    Dependency que fornece uma AsyncSession por requisição.

    Garante rollback em caso de exceção para não deixar a conexão
    em estado de transação inválida no pool.
    """
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            # Rollback explícito garante que a conexão volta ao pool limpa,
            # evitando o erro "Can't reconnect until invalid transaction is rolled back".
            await session.rollback()
            raise
