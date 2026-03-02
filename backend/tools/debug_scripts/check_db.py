from app.db.session import engine
from sqlalchemy.orm import sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import text
import asyncio

async def fix_batch():
    from app.core.config import settings
    print(f"DEBUG: DATABASE_URL: {settings.DATABASE_URL}")
    
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        try:
            # Check current
            res = await session.execute(text("SELECT status FROM batch WHERE id = '0721148b-0085-4c5f-bd9f-b990a942ae9c'"))
            row = res.first()
            print(f"VERIFY RAW STATUS: {row}")
            
        except Exception as e:
            print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(fix_batch())
