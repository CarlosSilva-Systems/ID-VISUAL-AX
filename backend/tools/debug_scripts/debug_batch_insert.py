import asyncio
import sys
from datetime import datetime
from uuid import uuid4
from sqlmodel import SQLModel, Session, select
from app.models.batch import Batch
from app.db.session import engine, init_db

# Mock UUID handling if needed
# import sqlite3
# sqlite3.register_adapter(uuid.UUID, lambda u: u.bytes)

async def main():
    print("--- Debug Batch Insert ---")
    try:
        async with engine.begin() as conn:
            # Create tables if not exist (quick check)
            # await conn.run_sync(SQLModel.metadata.create_all)
            pass

        from sqlmodel.ext.asyncio.session import AsyncSession
        from sqlalchemy.orm import sessionmaker

        async_session = sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )

        async with async_session() as session:
            print("Creating Batch...")
            new_batch = Batch(name=f"Debug Batch {datetime.now()}")
            print(f"Batch UUID: {new_batch.id} (type: {type(new_batch.id)})")
            
            session.add(new_batch)
            try:
                await session.commit()
                print("Commit Success!")
                await session.refresh(new_batch)
                print(f"Batch ID after refresh: {new_batch.id}")
            except Exception as e:
                print(f"COMMIT FAILED: {e}")
                import traceback
                traceback.print_exc()

    except Exception as e:
        print(f"Global Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # if sys.platform == 'win32':
    #     asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
