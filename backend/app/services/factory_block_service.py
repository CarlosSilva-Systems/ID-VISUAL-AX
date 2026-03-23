from datetime import datetime, timezone
import uuid
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Optional
from app.models.analytics import FabricacaoBlock

class FactoryBlockService:
    @staticmethod
    async def bloquear_of(session: AsyncSession, mo_id: uuid.UUID | str, id_visual_id: Optional[uuid.UUID | str] = None) -> FabricacaoBlock:
        """
        Registra o bloqueio de uma Ordem de Fabricação por falta ou aguardo de ID Visual.
        Se já houver um bloqueio aberto, retorna ele em vez de duplicar.
        """
        if isinstance(mo_id, str):
            mo_id = uuid.UUID(mo_id)
        if isinstance(id_visual_id, str):
            id_visual_id = uuid.UUID(id_visual_id)

        # Checa se já existe bloqueio aberto
        stmt = select(FabricacaoBlock).where(
            FabricacaoBlock.mo_id == mo_id,
            FabricacaoBlock.of_desbloqueada_em.is_(None)
        )
        result = await session.execute(stmt)
        existing = result.scalars().first()
        if existing:
            return existing

        new_block = FabricacaoBlock(
            mo_id=mo_id,
            id_visual_id=id_visual_id,
            of_bloqueada_em=datetime.utcnow()
        )
        session.add(new_block)
        await session.commit()
        await session.refresh(new_block)
        return new_block

    @staticmethod
    async def desbloquear_of(session: AsyncSession, mo_id: uuid.UUID | str) -> Optional[FabricacaoBlock]:
        """
        Registra o desbloqueio da OF e calcula o tempo_parado_minutos.
        """
        if isinstance(mo_id, str):
            mo_id = uuid.UUID(mo_id)

        stmt = select(FabricacaoBlock).where(
            FabricacaoBlock.mo_id == mo_id,
            FabricacaoBlock.of_desbloqueada_em.is_(None)
        )
        result = await session.execute(stmt)
        active_block = result.scalars().first()

        if not active_block:
            return None

        active_block.of_desbloqueada_em = datetime.utcnow()
        delta = active_block.of_desbloqueada_em - active_block.of_bloqueada_em
        active_block.tempo_parado_minutos = round(delta.total_seconds() / 60.0, 2)
        
        session.add(active_block)
        await session.commit()
        await session.refresh(active_block)
        return active_block
