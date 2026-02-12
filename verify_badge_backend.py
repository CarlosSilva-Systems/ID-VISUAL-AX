
import asyncio
import sys
import os
from sqlalchemy import text

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.db.session import engine
from sqlalchemy.orm import sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from app.models.id_request import IDRequest, IDRequestStatus
from app.models.manufacturing import ManufacturingOrder

from sqlmodel import select, func, col

from app.core.config import settings
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

async def verify_backend_logic():
    print(f"DEBUG: DATABASE_URL={settings.DATABASE_URL}")
    
    # Create independent engine for verification to avoid shared state issues
    connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
    poolclass = NullPool if "sqlite" in settings.DATABASE_URL else None
    
    verify_engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        future=True,
        connect_args=connect_args,
        poolclass=poolclass
    )
    
    async_session = sessionmaker(
        verify_engine, class_=AsyncSession, expire_on_commit=False
    )
    try:
        async with async_session() as session:
            print("--- Starting Badge Logic Verification ---")
            
            # 1. Check Initial Count
            stmt = (
                select(func.count(IDRequest.id))
                .where(
                    IDRequest.source == "manual",
                    IDRequest.transferred_to_queue == False,
                    col(IDRequest.status).in_(['nova', 'triagem', 'em_lote', 'em_progresso'])
                )
            )
            result = await session.exec(stmt)
            initial_count = result.first() or 0
            print(f"Initial Count: {initial_count}")
            
            # 2. Find MO
            mo_result = await session.exec(select(ManufacturingOrder).limit(1))
            mo = mo_result.first()
            
            if not mo:
                print("No MO found. Creating dummy MO...")
                mo = ManufacturingOrder(name="TEST-MO-BADGE", product_qty=1) # Minimal fields
                session.add(mo)
                await session.commit()
                await session.refresh(mo)
            
            mo_id = mo.id

            # 3. Create Manual Request
            print(f"Creating Manual Request linked to MO {mo.name}...")
            new_req = IDRequest(
                mo_id=mo_id,
                source="manual",
                status=IDRequestStatus.NOVA,
                transferred_to_queue=False,
                requester_name="Tester",
                notes="Test Badge"
            )
            session.add(new_req)
            await session.commit()
            await session.refresh(new_req)
            
            # 4. Check Count Increment
            result = await session.exec(stmt)
            new_count = result.first() or 0
            print(f"New Count: {new_count}")
            
            if new_count == initial_count + 1:
                print("SUCCESS: Count incremented.")
            else:
                print(f"FAILURE: Count mismatch. Expected {initial_count + 1}, got {new_count}")

            # 5. Transfer Request
            print("Simulating Transfer...")
            new_req.transferred_to_queue = True
            session.add(new_req)
            await session.commit()
            
            # 6. Check Count Decrement
            result = await session.exec(stmt)
            final_count = result.first() or 0
            print(f"Final Count: {final_count}")
            
            if final_count == initial_count:
                print("SUCCESS: Count decremented.")
            else:
                 print(f"FAILURE: Count mismatch. Expected {initial_count}, got {final_count}")

            # Cleanup (Optional, but good for idempotency)
            print("Cleaning up...")
            await session.delete(new_req)
            # If we created dummy MO, maybe keep it or delete? Let's keep MO to be safe.
            await session.commit()
            print("Done.")
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await verify_engine.dispose()

if __name__ == "__main__":
    asyncio.run(verify_backend_logic())
