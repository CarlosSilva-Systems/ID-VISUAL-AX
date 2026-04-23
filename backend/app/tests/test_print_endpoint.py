"""
Testes para o endpoint POST /api/v1/id-visual/print/labels.

Usa mocks para:
    - ZebraPrinter.print_zpl  → evita conexão TCP real
    - AsyncSession             → banco em memória via override de dependência
    - SystemSetting            → controla presença/ausência do zebra_printer_ip
"""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock

from httpx import AsyncClient, ASGITransport
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.main import app
from app.api import deps
from app.models.id_request import IDRequest
from app.models.manufacturing import ManufacturingOrder
from app.models.system_setting import SystemSetting
from app.models.audit import HistoryLog


# ---------------------------------------------------------------------------
# Engine SQLite em memória para testes
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def _create_tables():
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module", autouse=True)
def event_loop_policy():
    """Garante que o loop de eventos é configurado corretamente no módulo."""
    import asyncio
    asyncio.get_event_loop_policy()


@pytest_asyncio.fixture(scope="function")
async def db_session():
    """Cria tabelas e retorna uma sessão limpa por teste."""
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def seeded_session(db_session: AsyncSession):
    """
    Popula o banco com:
        - 1 ManufacturingOrder
        - 1 IDRequest vinculada
        - SystemSetting com zebra_printer_ip configurado
    """
    mo = ManufacturingOrder(
        odoo_id=9999,
        name="WH/MO/09999",
        x_studio_nome_da_obra="Obra Teste",
        product_name="QDC-TEST",
        ax_code="AX0009999",
        product_qty=1.0,
        state="confirmed",
    )
    db_session.add(mo)
    await db_session.commit()
    await db_session.refresh(mo)

    id_req = IDRequest(mo_id=mo.id, status="nova")
    db_session.add(id_req)
    await db_session.commit()
    await db_session.refresh(id_req)

    setting = SystemSetting(
        key="zebra_printer_ip",
        value="192.168.1.100",
        description="IP da impressora Zebra",
    )
    db_session.add(setting)
    await db_session.commit()

    return {"mo": mo, "id_req": id_req, "session": db_session}


@pytest_asyncio.fixture(scope="function")
async def seeded_session_no_printer(db_session: AsyncSession):
    """Banco populado SEM zebra_printer_ip configurado."""
    mo = ManufacturingOrder(
        odoo_id=8888,
        name="WH/MO/08888",
        x_studio_nome_da_obra="Obra Sem Impressora",
        product_name="QDC-NO-PRINTER",
        ax_code="AX0008888",
        product_qty=1.0,
        state="confirmed",
    )
    db_session.add(mo)
    await db_session.commit()
    await db_session.refresh(mo)

    id_req = IDRequest(mo_id=mo.id, status="nova")
    db_session.add(id_req)
    await db_session.commit()
    await db_session.refresh(id_req)

    return {"mo": mo, "id_req": id_req, "session": db_session}


def _make_client(session: AsyncSession) -> AsyncClient:
    """Cria AsyncClient com override da sessão de banco."""
    async def _override_session():
        yield session

    app.dependency_overrides[deps.get_session] = _override_session
    # Usuário anônimo (sem auth) — endpoint aceita current_user=None
    app.dependency_overrides[deps.get_current_user] = lambda: None

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# ---------------------------------------------------------------------------
# Testes
# ---------------------------------------------------------------------------

class TestPrintLabelsEndpoint:

    @pytest.mark.asyncio
    async def test_technical_label_chama_print_zpl_uma_vez(self, seeded_session):
        """label_type='technical' deve chamar print_zpl exatamente 1 vez."""
        data = seeded_session
        id_req_id = str(data["id_req"].id)

        with patch(
            "app.api.api_v1.endpoints.print_labels.ZebraPrinter.print_zpl",
            new_callable=AsyncMock,
        ) as mock_print:
            async with _make_client(data["session"]) as client:
                response = await client.post(
                    "/api/v1/id-visual/print/labels",
                    json={
                        "id_request_id": id_req_id,
                        "label_type": "technical",
                        "corrente_nominal": "25A",
                        "frequencia": "60Hz",
                        "cap_corte": "10kA",
                        "tensao": "220V",
                        "curva_disparo": "10x In",
                        "tensao_impulso": "4kV",
                        "tensao_isolamento": "500V",
                    },
                )

        assert response.status_code == 200, response.text
        mock_print.assert_awaited_once()

        body = response.json()
        assert body["status"] == "ok"
        assert body["label_type"] == "technical"
        assert body["mo_name"] == "WH/MO/09999"

    @pytest.mark.asyncio
    async def test_external_label_chama_print_zpl_uma_vez(self, seeded_session):
        """label_type='external' deve chamar print_zpl exatamente 1 vez."""
        data = seeded_session
        id_req_id = str(data["id_req"].id)

        with patch(
            "app.api.api_v1.endpoints.print_labels.ZebraPrinter.print_zpl",
            new_callable=AsyncMock,
        ) as mock_print:
            async with _make_client(data["session"]) as client:
                response = await client.post(
                    "/api/v1/id-visual/print/labels",
                    json={
                        "id_request_id": id_req_id,
                        "label_type": "external",
                        "qr_url": "https://app.axengenharia.com.br/id/FAB09999",
                    },
                )

        assert response.status_code == 200, response.text
        mock_print.assert_awaited_once()

        body = response.json()
        assert body["label_type"] == "external"

    @pytest.mark.asyncio
    async def test_both_chama_print_zpl_duas_vezes(self, seeded_session):
        """label_type='both' deve chamar print_zpl exatamente 2 vezes."""
        data = seeded_session
        id_req_id = str(data["id_req"].id)

        with patch(
            "app.api.api_v1.endpoints.print_labels.ZebraPrinter.print_zpl",
            new_callable=AsyncMock,
        ) as mock_print:
            async with _make_client(data["session"]) as client:
                response = await client.post(
                    "/api/v1/id-visual/print/labels",
                    json={
                        "id_request_id": id_req_id,
                        "label_type": "both",
                        "corrente_nominal": "25A",
                        "frequencia": "60Hz",
                        "cap_corte": "10kA",
                        "tensao": "220V",
                        "curva_disparo": "10x In",
                        "tensao_impulso": "4kV",
                        "tensao_isolamento": "500V",
                        "qr_url": "https://app.axengenharia.com.br/id/FAB09999",
                    },
                )

        assert response.status_code == 200, response.text
        assert mock_print.await_count == 2

        body = response.json()
        assert body["label_type"] == "both"

    @pytest.mark.asyncio
    async def test_sem_zebra_printer_ip_retorna_503(self, seeded_session_no_printer):
        """Ausência de zebra_printer_ip em SystemSetting deve retornar 503."""
        data = seeded_session_no_printer
        id_req_id = str(data["id_req"].id)

        with patch(
            "app.api.api_v1.endpoints.print_labels.ZebraPrinter.print_zpl",
            new_callable=AsyncMock,
        ):
            async with _make_client(data["session"]) as client:
                response = await client.post(
                    "/api/v1/id-visual/print/labels",
                    json={
                        "id_request_id": id_req_id,
                        "label_type": "technical",
                    },
                )

        assert response.status_code == 503
        assert "zebra_printer_ip" in response.json()["detail"].lower() or \
               "impressora" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_id_request_inexistente_retorna_404(self, seeded_session):
        """UUID válido mas inexistente deve retornar 404."""
        data = seeded_session
        fake_id = str(uuid.uuid4())

        with patch(
            "app.api.api_v1.endpoints.print_labels.ZebraPrinter.print_zpl",
            new_callable=AsyncMock,
        ):
            async with _make_client(data["session"]) as client:
                response = await client.post(
                    "/api/v1/id-visual/print/labels",
                    json={
                        "id_request_id": fake_id,
                        "label_type": "technical",
                    },
                )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_zebra_printer_error_retorna_503(self, seeded_session):
        """ZebraPrinterError deve ser convertida em HTTPException 503."""
        from app.services.zebra_printer import ZebraPrinterError

        data = seeded_session
        id_req_id = str(data["id_req"].id)

        with patch(
            "app.api.api_v1.endpoints.print_labels.ZebraPrinter.print_zpl",
            new_callable=AsyncMock,
            side_effect=ZebraPrinterError("Connection refused"),
        ):
            async with _make_client(data["session"]) as client:
                response = await client.post(
                    "/api/v1/id-visual/print/labels",
                    json={
                        "id_request_id": id_req_id,
                        "label_type": "technical",
                    },
                )

        assert response.status_code == 503
        assert "Impressora não acessível" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_id_request_id_invalido_retorna_400(self, seeded_session):
        """UUID malformado deve retornar 400."""
        data = seeded_session

        async with _make_client(data["session"]) as client:
            response = await client.post(
                "/api/v1/id-visual/print/labels",
                json={
                    "id_request_id": "nao-e-um-uuid",
                    "label_type": "technical",
                },
            )

        assert response.status_code == 400
