import asyncio
import logging
from sqlmodel import select
from app.db.session import async_session_factory
from app.models.id_request import IDRequest, IDRequestStatus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_backfill():
    """
    Script idempotente de backfill para garantir a integridade dos KPIs.
    Preenche solicitado_em, concluido_em, e entregue_em com base 
    no histórico existente sem inventar dados (iniciado_em ficará nulo e será ignorado no AVG).
    """
    async with async_session_factory() as session:
        stmt = select(IDRequest).where(IDRequest.solicitado_em.is_(None))
        res = await session.execute(stmt)
        requests = res.scalars().all()
        
        atualizados = 0
        
        for req in requests:
            # solicitado_em herda de created_at
            if not req.solicitado_em:
                req.solicitado_em = req.created_at
                
            # concluido_em / entregue_em herdam de updated_at se a ID já estiver resolvida
            if req.status in [IDRequestStatus.CONCLUIDA, IDRequestStatus.ENTREGUE]:
                if not req.concluido_em:
                    req.concluido_em = req.updated_at
                if not req.entregue_em:
                    req.entregue_em = req.updated_at
            
            session.add(req)
            atualizados += 1
            
        if atualizados > 0:
            await session.commit()
            logger.info(f"Backfill concluído. {atualizados} registros de IDRequest atualizados idempotentemente.")
        else:
            logger.info("Nenhum registro de IDRequest precisava de atualização de timestamps.")

if __name__ == "__main__":
    asyncio.run(run_backfill())
