"""
Serviço de bloqueio de Ordens de Fabricação.

Registra e libera bloqueios de OFs no banco local, populando sempre
odoo_mo_id para desacoplar da FK local (manufacturing_order.id).
"""
from datetime import datetime, timezone
import uuid
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Optional
from app.models.analytics import FabricacaoBlock, MotivoParada
from app.models.manufacturing import ManufacturingOrder


class FactoryBlockService:
    @staticmethod
    async def bloquear_of(
        session: AsyncSession,
        mo_id: uuid.UUID | str,
        id_visual_id: Optional[uuid.UUID | str] = None,
        motivo: str = MotivoParada.AGUARDANDO_ID_VISUAL.value,
    ) -> FabricacaoBlock:
        """
        Registra o bloqueio de uma Ordem de Fabricação.

        Popula odoo_mo_id automaticamente via lookup na manufacturing_order local,
        garantindo rastreabilidade direta ao Odoo mesmo após futura remoção da FK local.

        Se já houver um bloqueio aberto para a mesma MO, retorna o existente (idempotente).
        """
        if isinstance(mo_id, str):
            mo_id = uuid.UUID(mo_id)
        if isinstance(id_visual_id, str):
            id_visual_id = uuid.UUID(id_visual_id)

        # Checa se já existe bloqueio aberto — idempotência
        stmt = select(FabricacaoBlock).where(
            FabricacaoBlock.mo_id == mo_id,
            FabricacaoBlock.of_desbloqueada_em.is_(None)
        )
        result = await session.execute(stmt)
        existing = result.scalars().first()
        if existing:
            return existing

        # Resolve odoo_mo_id via lookup local (evita passar como parâmetro em todos os callers)
        odoo_mo_id: Optional[int] = None
        mo_stmt = select(ManufacturingOrder).where(ManufacturingOrder.id == mo_id)
        mo_result = await session.execute(mo_stmt)
        local_mo = mo_result.scalars().first()
        if local_mo:
            odoo_mo_id = local_mo.odoo_id

        new_block = FabricacaoBlock(
            mo_id=mo_id,
            odoo_mo_id=odoo_mo_id,
            id_visual_id=id_visual_id,
            motivo=motivo,
            of_bloqueada_em=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        session.add(new_block)
        await session.commit()
        await session.refresh(new_block)
        return new_block

    @staticmethod
    async def desbloquear_of(session: AsyncSession, mo_id: uuid.UUID | str) -> Optional[FabricacaoBlock]:
        """
        Registra o desbloqueio da OF e calcula o tempo_parado_minutos.
        Retorna None se não houver bloqueio aberto (idempotente).
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

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        active_block.of_desbloqueada_em = now
        delta = now - active_block.of_bloqueada_em
        active_block.tempo_parado_minutos = round(delta.total_seconds() / 60.0, 2)

        session.add(active_block)
        await session.commit()
        await session.refresh(active_block)
        return active_block
