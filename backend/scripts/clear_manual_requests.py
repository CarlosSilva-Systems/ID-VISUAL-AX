"""
Script para limpar pedidos manuais de produção (source='manual').
Útil para testes e desenvolvimento.
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import engine
from app.models.id_request import IDRequest, IDRequestTask


async def clear_manual_requests():
    """Remove todos os IDRequests com source='manual' e suas tasks associadas."""
    
    async with AsyncSession(engine) as session:
        # 1. Buscar todos os pedidos manuais
        stmt = select(IDRequest).where(IDRequest.source == "manual")
        result = await session.exec(stmt)
        manual_requests = result.all()
        
        if not manual_requests:
            print("✅ Nenhum pedido manual encontrado.")
            return
        
        print(f"🔍 Encontrados {len(manual_requests)} pedidos manuais:")
        for req in manual_requests:
            print(f"   - {req.id} (status: {req.status})")
        
        # 2. Deletar tasks associadas
        deleted_tasks = 0
        for req in manual_requests:
            task_stmt = select(IDRequestTask).where(IDRequestTask.request_id == req.id)
            task_result = await session.exec(task_stmt)
            tasks = task_result.all()
            
            for task in tasks:
                await session.delete(task)
                deleted_tasks += 1
        
        print(f"🗑️  Deletando {deleted_tasks} tasks...")
        await session.commit()
        
        # 3. Deletar os pedidos
        for req in manual_requests:
            await session.delete(req)
        
        await session.commit()
        
        print(f"✅ {len(manual_requests)} pedidos manuais e {deleted_tasks} tasks deletados com sucesso!")


if __name__ == "__main__":
    print("🧹 Limpando pedidos manuais de produção...\n")
    asyncio.run(clear_manual_requests())
    print("\n✨ Concluído!")
