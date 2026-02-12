import asyncio
from sqlmodel import select, func
from app.db.session import engine
from app.models.batch import Batch
from app.models.id_request import IDRequest
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.orm import sessionmaker

async def inspect():
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        statement = select(Batch)
        result = await session.exec(statement)
        batches = result.all()
        
        print(f"Found {len(batches)} batches.")
        for b in batches:
            # Count requests
            stmt_req = select(func.count(IDRequest.id)).where(IDRequest.batch_id == b.id)
            res_req = await session.exec(stmt_req)
            count = res_req.one()
            if count > 0:
                print(f"FOUND VALID BATCH: {b.id}")
                with open("valid_batch.txt", "w") as f:
                    f.write(str(b.id))
                return

if __name__ == "__main__":
    asyncio.run(inspect())
