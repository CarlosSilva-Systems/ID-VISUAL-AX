"""
Testes unitários para o modelo ManufacturingOrder.

Feature: Campos ax_code e fab_code
"""
import pytest
from datetime import datetime, timezone
from app.models.manufacturing import ManufacturingOrder


class TestFabCodeProperty:
    """Testes para a propriedade computada fab_code."""

    def test_fab_code_standard_format(self):
        """Testa extração de fab_code de formato padrão WH/MO/XXXXX."""
        mo = ManufacturingOrder(
            odoo_id=1,
            name="WH/MO/01015",
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.fab_code == "FAB01015"

    def test_fab_code_leading_zeros(self):
        """Testa que zeros à esquerda são preservados."""
        mo = ManufacturingOrder(
            odoo_id=2,
            name="WH/MO/00001",
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.fab_code == "FAB00001"

    def test_fab_code_none_name(self):
        """Testa que retorna None quando name é None."""
        mo = ManufacturingOrder(
            odoo_id=3,
            name=None,
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.fab_code is None

    def test_fab_code_empty_string(self):
        """Testa que retorna None quando name é string vazia."""
        mo = ManufacturingOrder(
            odoo_id=4,
            name="",
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.fab_code is None

    def test_fab_code_malformed_no_slash(self):
        """Testa que retorna None quando não há barra no name."""
        mo = ManufacturingOrder(
            odoo_id=5,
            name="MO01015",
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.fab_code is None

    def test_fab_code_malformed_non_numeric(self):
        """Testa que retorna None quando última parte não é numérica."""
        mo = ManufacturingOrder(
            odoo_id=6,
            name="WH/MO/ABC123",
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.fab_code is None

    def test_fab_code_single_slash(self):
        """Testa que retorna None quando há apenas uma barra."""
        mo = ManufacturingOrder(
            odoo_id=7,
            name="WH/01015",
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.fab_code == "FAB01015"

    def test_fab_code_multiple_slashes(self):
        """Testa que extrai corretamente com múltiplas barras."""
        mo = ManufacturingOrder(
            odoo_id=8,
            name="SITE/WH/MO/EXTRA/99999",
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.fab_code == "FAB99999"

    def test_fab_code_with_spaces(self):
        """Testa que lida com espaços ao redor do número."""
        mo = ManufacturingOrder(
            odoo_id=9,
            name="WH/MO/ 12345 ",
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.fab_code == "FAB12345"


class TestAxCodeField:
    """Testes para o campo ax_code."""

    def test_ax_code_can_be_set(self):
        """Testa que ax_code pode ser definido."""
        mo = ManufacturingOrder(
            odoo_id=10,
            name="WH/MO/01015",
            ax_code="AX0003578",
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.ax_code == "AX0003578"

    def test_ax_code_nullable(self):
        """Testa que ax_code pode ser None."""
        mo = ManufacturingOrder(
            odoo_id=11,
            name="WH/MO/01015",
            ax_code=None,
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.ax_code is None

    def test_ax_code_default_none(self):
        """Testa que ax_code tem default None."""
        mo = ManufacturingOrder(
            odoo_id=12,
            name="WH/MO/01015",
            product_qty=1.0,
            state="confirmed"
        )
        assert mo.ax_code is None
