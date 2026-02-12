import asyncio
import logging

from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
# Import all models to ensure they are registered with SQLModel.metadata
from app.models import * 

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def init_db() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    logger.info("Database initialized")

if __name__ == "__main__":
    asyncio.run(init_db())
