import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import async_session_factory
from app.models.id_request import IDRequest, IDRequestStatus
from app.models.manufacturing import ManufacturingOrder
from app.models.andon import AndonCall
from app.models.user import User

async def seed_data():
    print("🚀 Iniciando semeadura de dados para BI...")
    
    async with async_session_factory() as session:
        # 1. Criar Obras/OFs de exemplo se não existirem
        existing_mos = await session.exec(select(ManufacturingOrder))
        if not existing_mos.first():
            obras = ["Edifício Horizon", "Residencial Park", "Torre Infinito", "Shopping Central"]
            mos = []
            for i in range(10):
                mo = ManufacturingOrder(
                    odoo_id=1000 + i,
                    name=f"OF-{2024000 + i}",
                    x_studio_nome_da_obra=random.choice(obras),
                    product_qty=random.randint(1, 5),
                    state="progress",
                    date_start=datetime.now(timezone.utc) - timedelta(days=random.randint(1, 15))
                )
                session.add(mo)
                mos.append(mo)
            await session.commit()
            print(f"✅ {len(mos)} ordens de fabricação criadas.")
        else:
            mos = (await session.exec(select(ManufacturingOrder))).all()

        # 2. Criar Chamados Andon (Histórico de Paradas)
        categories = ["Material", "Engenharia", "Qualidade", "Manutenção"]
        reasons = {
            "Material": ["Falta de componente 210-804", "Etiquetas acabaram", "Erros de separação"],
            "Engenharia": ["Diagrama divergente", "Layout não cabe no painel", "Dúvida técnica"],
            "Qualidade": ["Conexão frouxa", "Etiquetas desalinhadas", "Componente danificado"],
            "Manutenção": ["Impressora travada", "Rede instável", "Ferramenta quebrada"]
        }
        workcenters = [
            (1, "Posto de Corte"), (2, "Posto de Montagem A"), 
            (3, "Posto de Montagem B"), (4, "Posto de Teste QA")
        ]
        
        andon_calls = []
        for _ in range(30):
            cat = random.choice(categories)
            wc_id, wc_name = random.choice(workcenters)
            created_at = datetime.now(timezone.utc) - timedelta(days=random.randint(0, 14), hours=random.randint(0, 23))
            
            call = AndonCall(
                color="RED" if cat in ["Engenharia", "Manutenção"] else "YELLOW",
                category=cat,
                reason=random.choice(reasons[cat]),
                workcenter_id=wc_id,
                workcenter_name=wc_name,
                mo_id=random.choice(mos).odoo_id if mos else None,
                status="RESOLVED" if random.random() > 0.2 else "OPEN",
                created_at=created_at,
                updated_at=created_at + timedelta(minutes=random.randint(10, 300)),
                triggered_by="operador.teste",
                is_stop=random.random() > 0.4
            )
            session.add(call)
            andon_calls.append(call)
        
        # 3. Criar Solicitações de ID Visual (Funnel de Produção com Auditoria)
        id_requests = []
        statuses = [IDRequestStatus.NOVA, IDRequestStatus.EM_PROGRESSO, IDRequestStatus.CONCLUIDA, IDRequestStatus.ENTREGUE]
        
        for i in range(50):
            mo = random.choice(mos)
            status = random.choice(statuses)
            
            # Timestamps retroativos
            solicitado = datetime.now(timezone.utc) - timedelta(days=random.randint(0, 10), hours=random.randint(0, 23))
            iniciado = solicitado + timedelta(hours=random.randint(1, 4))
            concluido = iniciado + timedelta(hours=random.randint(2, 24))
            
            req = IDRequest(
                mo_id=mo.id,
                package_code=random.choice(["comando", "distribuicao", "personalizado"]),
                status=status,
                priority=random.choice(["normal", "urgente"]),
                source="auto" if random.random() > 0.3 else "manual",
                requester_name="Sistema" if random.random() > 0.3 else "Carlos Silva",
                created_at=solicitado,
                solicitado_em=solicitado,
                iniciado_em=iniciado if status != IDRequestStatus.NOVA else None,
                concluido_em=concluido if status in [IDRequestStatus.CONCLUIDA, IDRequestStatus.ENTREGUE] else None,
                finished_at=concluido if status in [IDRequestStatus.CONCLUIDA, IDRequestStatus.ENTREGUE] else None
            )
            session.add(req)
            id_requests.append(req)

        # 4. Criar Blocos de Fabricação (Métricas de Parada)
        from app.models.analytics import FabricacaoBlock, RevisaoIDVisual
        blocks = []
        num_blocks = min(len(mos), 10)
        if num_blocks > 0:
            for mo in random.sample(mos, num_blocks):
                bloqueada_em = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 10))
                block = FabricacaoBlock(
                    mo_id=mo.id,
                    of_bloqueada_em=bloqueada_em,
                    of_desbloqueada_em=bloqueada_em + timedelta(hours=random.randint(1, 8)),
                    tempo_parado_minutos=random.randint(60, 480)
                )
                session.add(block)
                blocks.append(block)

        # 5. Criar Revisões (Métricas de Qualidade)
        from app.models.analytics import MotivoRevisao
        num_revs = min(len(id_requests), 15)
        if num_revs > 0:
            for req in random.sample(id_requests, num_revs):
                revisao = RevisaoIDVisual(
                    id_visual_id=req.id,
                    motivo=random.choice(list(MotivoRevisao)),
                    revisao_solicitada_em=datetime.now(timezone.utc) - timedelta(days=random.randint(1, 5))
                )
                session.add(revisao)

        # 6. Criar Status Atual dos Workcenters (AndonStatus)
        from app.models.andon import AndonStatus
        for wc_id, wc_name in workcenters:
            status = AndonStatus(
                workcenter_odoo_id=wc_id,
                workcenter_name=wc_name,
                status=random.choice(["verde", "amarelo", "vermelho", "cinza"]),
                updated_at=datetime.now(timezone.utc),
                updated_by="sistema.bi"
            )
            # Upsert manual para o seed (baseado no unique workcenter_odoo_id)
            existing_st = await session.exec(select(AndonStatus).where(AndonStatus.workcenter_odoo_id == wc_id))
            if not existing_st.first():
                session.add(status)

        await session.commit()
        print(f"✅ {len(andon_calls)} chamados Andon criados.")
        print(f"✅ {len(id_requests)} solicitações de ID Visual (com auditoria) criadas.")
        print(f"✅ {len(blocks)} blocos de fabricação criados.")
        print(f"✅ {len(workcenters)} status de workcenter inicializados.")
        print("🌟 Semeadura concluída com sucesso! Dashboard deve brilhar agora.")

if __name__ == "__main__":
    asyncio.run(seed_data())
