import asyncio
import logging
from sqlmodel import select
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

import sys
import os

# Adiciona o diretório raiz ao path para importar a app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.user import User, UserRole
from app.core.security import get_password_hash

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def seed_tiax():
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async with AsyncSession(engine) as session:
        # Verifica se o usuário já existe
        stmt = select(User).where(User.username == "tiax2026")
        result = await session.execute(stmt)
        user = result.scalars().first()
        
        if not user:
            from sqlalchemy import text
            logger.info(f"Criando usuário mestre de TI: tiax2026 com role: {'ti'}")
            
            # Usando SQL puro para evitar que o SQLAlchemy converta 'ti' para 'TI' (nome do enum)
            query = text("""
                INSERT INTO "user" (id, username, full_name, role, hashed_password, is_local, is_active, is_odoo_test_mode, created_at, updated_at)
                VALUES (:id, :username, :full_name, :role, :hashed_password, :is_local, :is_active, :is_odoo_test_mode, :now, :now)
            """)
            
            import uuid
            from datetime import datetime
            now = datetime.utcnow()
            
            await session.execute(query, {
                "id": uuid.uuid4(),
                "username": "tiax2026",
                "full_name": "TI Administrador AX",
                "role": "TI",
                "hashed_password": get_password_hash("*depti_AX*"),
                "is_local": True,
                "is_active": True,
                "is_odoo_test_mode": False,
                "now": now
            })
            await session.commit()
            logger.info("Usuário tiax2026 criado com sucesso via SQL puro.")
        else:
            logger.info("Usuário tiax2026 já existe no sistema.")

if __name__ == "__main__":
    asyncio.run(seed_tiax())
