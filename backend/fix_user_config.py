import asyncio
from sqlmodel import select
from app.db.session import async_session_factory
from app.models.user import User

async def fix_user_config():
    async with async_session_factory() as session:
        # Busca usuários
        stmt = select(User)
        result = await session.execute(stmt)
        users = result.scalars().all()
        
        target_url = "https://projeto-orcamentador2.odoo.com/odoo"
        
        for u in users:
            print(f"Atualizando usuário: {u.username}")
            u.is_odoo_test_mode = True
            u.odoo_test_url = target_url
            session.add(u)
        
        await session.commit()
        print(f"Configuração aplicada com sucesso para {len(users)} usuários.")

if __name__ == "__main__":
    asyncio.run(fix_user_config())
