import asyncio
import sys
from datetime import datetime
from uuid import uuid4
from sqlmodel import select, Session
from app.db.session import engine
from app.models.batch import Batch
from app.models.manufacturing import ManufacturingOrder
from app.models.id_request import IDRequest, IDRequestTask, TaskStatus, IDRequestStatus
from app.schemas.matrix_view import TaskStatusEnum, MatrixColumn

# Mock Constants
FIXED_COLUMNS = [
    MatrixColumn(task_code="DOCS_Epson", label="Documentos Epson", order=10),
    MatrixColumn(task_code="WAGO_210_804", label="Componente 210-804", order=20),
]

async def reproduce_error():
    print("--- Reproduction Script ---")
    
    # Mock Data matching Odoo response
    import random
    new_id = random.randint(100000, 999999)
    mo_data = {
        'id': new_id, 
        'name': f'MO/{new_id}',
        'x_studio_nome_da_obra': 'Obra Teste',
        'product_qty': 10.0,
        'date_start': '2023-10-27 10:00:00', # String format from Odoo
        'state': 'confirmed'
    }

    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlalchemy.orm import sessionmaker

    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        try:
            print("1. Creating Batch...")
            new_batch = Batch(name=f"Lote Test {uuid4()}")
            session.add(new_batch)
            await session.commit()
            await session.refresh(new_batch)
            print(f"   Batch created: {new_batch.id}")

            print("2. Processing MO...")
            # Check/Create MO
            raw_date = mo_data['date_start']
            try:
                date_start = datetime.strptime(raw_date, '%Y-%m-%d %H:%M:%S')
            except:
                date_start = datetime.now()
                
            # Simulate logic in endpoint
            local_mo = ManufacturingOrder(
                odoo_id=mo_data['id'],
                name=mo_data['name'],
                x_studio_nome_da_obra=mo_data.get('x_studio_nome_da_obra'),
                product_qty=mo_data['product_qty'],
                date_start=date_start, # Passing string to datetime field?
                state=mo_data['state']
            )
            session.add(local_mo)
            await session.commit()
            await session.refresh(local_mo)
            print(f"   MO created: {local_mo.id}")

            print("3. Creating IDRequest...")
            new_req = IDRequest(
                mo_id=local_mo.id,
                batch_id=new_batch.id,
                status="nova" # Passing string to Enum field
            )
            session.add(new_req)
            await session.commit()
            await session.refresh(new_req)
            print(f"   Request created: {new_req.id}")

            print("4. Creating Tasks...")
            for col_def in FIXED_COLUMNS:
                task = IDRequestTask(
                    request_id=new_req.id,
                    task_code=col_def.task_code,
                    status=TaskStatusEnum.nao_iniciado.value # Using .value like in fix
                )
                session.add(task)
            
            await session.commit()
            print("   Tasks created.")
            print("SUCCESS! No error reproduced.")

        except Exception as e:
            with open("reproduction_output.txt", "w") as f:
                f.write(f"ERROR CAUGHT: {type(e).__name__}: {e}\n")
                import traceback
                traceback.print_exc(file=f)
            print("Error written to reproduction_output.txt")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(reproduce_error())
