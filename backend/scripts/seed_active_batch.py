import asyncio
import sys
import os
import uuid
import random
from datetime import datetime, timedelta

# Add backend directory to sys.path to allow imports from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import SQLModel, create_engine, select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.batch import Batch, BatchStatus, BatchItem
from app.models.id_request import IDRequest, IDRequestStatus, IDRequestTask, TaskStatus, PackageType
from app.models.manufacturing import ManufacturingOrder

# Fixed UUID for demo
BATCH_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")

FIXED_TASKS = [
    "DOCS_Epson", "WAGO_210_804", "WAGO_210_805", "ELESYS_EFZ", 
    "WAGO_2009_110", "WAGO_210_855", "QA_FINAL"
]

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

async def seed_data():
    print("Creating Async Engine...")
    # Force IPv4 to avoid Windows/Asyncpg localhost issues
    db_url = settings.DATABASE_URL.replace("localhost", "127.0.0.1")
    engine = create_async_engine(db_url, echo=True, future=True)
    
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        print("Checking for existing batch...")
        batch = await session.get(Batch, BATCH_ID)
        
        if batch:
            print("Batch already exists. Skipping seed.")
            return

        print("Creating Data...")
        
        # 1. Create Batch
        batch = Batch(
            id=BATCH_ID,
            name="Lote Exemplo #1",
            status=BatchStatus.ACTIVE
        )
        session.add(batch)
        
        # 2. Create Dummy MOs & Requests
        for i in range(1, 6):
            mo_id = uuid.uuid4()
            mo = ManufacturingOrder(
                id=mo_id,
                odoo_id=1000 + i,
                name=f"MO-2024-{1000+i}",
                x_studio_nome_da_obra=f"Obra Residencial {i}",
                product_qty=random.randint(50, 500),
                date_start=datetime.utcnow() + timedelta(days=i),
                state="confirmed"
            )
            session.add(mo)
            
            # Create Request
            req_id = uuid.uuid4()
            req = IDRequest(
                id=req_id,
                mo_id=mo_id,
                package_code=random.choice(list(PackageType)),
                status=IDRequestStatus.EM_LOTE,
                priority="normal"
            )
            session.add(req)
            
            # Link to Batch
            item = BatchItem(
                batch_id=BATCH_ID,
                request_id=req_id,
                order_in_batch=i
            )
            session.add(item)
            
            # Create Tasks
            for task_code in FIXED_TASKS:
                # Randomize status
                r = random.random()
                status = TaskStatus.NAO_INICIADO
                if r > 0.7: status = TaskStatus.IMPRESSO # Green
                elif r > 0.4: status = TaskStatus.NAO_INICIADO # Gray
                elif r > 0.2: status = TaskStatus.NAO_APLICAVEL # N/A (if not Docs/QA)
                
                # Docs special logic
                if task_code == "DOCS_Epson":
                    status = TaskStatus.NAO_INICIADO if r < 0.5 else TaskStatus.IMPRIMINDO
                
                # QA Final usually last
                if task_code == "QA_FINAL":
                    status = TaskStatus.NAO_INICIADO
                
                task = IDRequestTask(
                    request_id=req_id,
                    task_code=task_code,
                    status=status
                )
                session.add(task)
        
        await session.commit()
        print("Seed successfully completed!")

if __name__ == "__main__":
    asyncio.run(seed_data())
