import sys
import os
import asyncio
from sqlalchemy.orm import sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import text

# Force backend to path
sys.path.append(os.getcwd())

async def test_read():
    sys.stdout = open("db_read.log", "w", encoding="utf-8", buffering=1)
    sys.stderr = sys.stdout
    try:
        from app.db.session import engine
        from app.models.batch import Batch, BatchStatus
        
        print(f"BatchStatus members: {[e.value for e in BatchStatus]}")
        
        async_session = sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )
        async with async_session() as session:
            # 1. Raw check
            res = await session.execute(text("SELECT status FROM batch WHERE id = '0721148b-0085-4c5f-bd9f-b990a942ae9c'"))
            row = res.first()
            print(f"RAW DB Value: {row}")
            
            # 2. ORM Get
            print("Attempting session.get(Batch)...")
            batch = await session.get(Batch, '0721148b-0085-4c5f-bd9f-b990a942ae9c')
            print(f"ORM Batch: {batch}")
            if batch:
                print(f"ORM Status: {batch.status}")
                
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_read())
