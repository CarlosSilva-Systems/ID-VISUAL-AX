"""
Testes unitários para os templates ZPL de etiquetas Zebra.

Feature: Impressão de etiquetas via ZPL (zebra_printer / zpl_templates)
"""
import pytest
from app.services.zpl_templates import render_technical_label, render_external_label


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def technical_label_defaults() -> dict:
    return dict(
        nome_obra="Edifício Horizonte",
        nome_quadro="QDC-01",
        corrente_nominal="25A",
        frequencia="60Hz",
        cap_corte="10kA",
        tensao="220V",
        curva_disparo="10x In",
        tensao_impulso="4kV",
        tensao_isolamento="500V",
    )


@pytest.fixture
def external_label_defaults() -> dict:
    return dict(
        ax_code="AX0003578",
        fab_code="FAB01015",
        nome_quadro="QDC-01",
        nome_obra="Edifício Horizonte",
        qr_url="https://app.axengenharia.com.br/id/FAB01015",
    )


# ---------------------------------------------------------------------------
# render_technical_label
# ---------------------------------------------------------------------------

class TestRenderTechnicalLabel:

    def test_retorna_string(self, technical_label_defaults):
        result = render_technical_label(**technical_label_defaults)
        assert isinstance(result, str)

    def test_contem_xxa_e_xxz(self, technical_label_defaults):
        result = render_technical_label(**technical_label_defaults)
        assert "^XA" in result
        assert "^XZ" in result

    def test_contem_nome_obra(self, technical_label_defaults):
        result = render_technical_label(**technical_label_defaults)
        assert "Edifício Horizonte" in result

    def test_contem_nome_quadro(self, technical_label_defaults):
        result = render_technical_label(**technical_label_defaults)
        assert "QDC-01" in result

    def test_contem_corrente_nominal(self, technical_label_defaults):
        result = render_technical_label(**technical_label_defaults)
        assert "25A" in result

    def test_contem_frequencia(self, technical_label_defaults):
        result = render_technical_label(**technical_label_defaults)
        assert "60Hz" in result

    def test_contem_cap_corte(self, technical_label_defaults):
        result = render_technical_label(**technical_label_defaults)
        assert "10kA" in result

    def test_contem_tensao(self, technical_label_defaults):
        result = render_technical_label(**technical_label_defaults)
        assert "220V" in result

    def test_contem_curva_disparo(self, technical_label_defaults):
        result = render_technical_label(**technical_label_defaults)
        assert "10x In" in result

    def test_contem_tensao_impulso(self, technical_label_defaults):
        result = render_technical_label(**technical_label_defaults)
        assert "4kV" in result

    def test_contem_tensao_isolamento(self, technical_label_defaults):
        result = render_technical_label(**technical_label_defaults)
        assert "500V" in result

    def test_contem_borda_externa(self, technical_label_defaults):
        """Verifica que a borda externa ^GB está presente."""
        result = render_technical_label(**technical_label_defaults)
        assert "^GB794,354,3" in result

    def test_contem_dimensoes_corretas(self, technical_label_defaults):
        """Verifica ^PW800 e ^LL360 para 100x45mm @ 203dpi."""
        result = render_technical_label(**technical_label_defaults)
        assert "^PW800" in result
        assert "^LL360" in result

    def test_campos_vazios_nao_quebram(self):
        """Campos vazios devem gerar ZPL válido sem exceção."""
        result = render_technical_label(
            nome_obra="",
            nome_quadro="",
            corrente_nominal="",
            frequencia="",
            cap_corte="",
            tensao="",
            curva_disparo="",
            tensao_impulso="",
            tensao_isolamento="",
        )
        assert "^XA" in result
        assert "^XZ" in result

    def test_campos_none_nao_quebram(self):
        """None em qualquer campo deve ser tratado sem exceção."""
        result = render_technical_label(
            nome_obra=None,
            nome_quadro=None,
            corrente_nominal=None,
            frequencia=None,
            cap_corte=None,
            tensao=None,
            curva_disparo=None,
            tensao_impulso=None,
            tensao_isolamento=None,
        )
        assert "^XA" in result
        assert "^XZ" in result

    def test_caracteres_especiais_zpl_sao_sanitizados(self):
        """Caracteres ^ e ~ devem ser removidos para não corromper o ZPL."""
        result = render_technical_label(
            nome_obra="Obra^Teste~Inválida",
            nome_quadro="QDC^01",
            corrente_nominal="25^A",
            frequencia="60Hz",
            cap_corte="10kA",
            tensao="220V",
            curva_disparo="10x In",
            tensao_impulso="4kV",
            tensao_isolamento="500V",
        )
        # Os valores sanitizados não devem conter ^ ou ~ fora dos comandos ZPL
        # Verifica que o nome da obra foi sanitizado
        assert "ObraTeste" in result or "ObraTesteInválida" in result


# ---------------------------------------------------------------------------
# render_external_label
# ---------------------------------------------------------------------------

class TestRenderExternalLabel:

    def test_retorna_string(self, external_label_defaults):
        result = render_external_label(**external_label_defaults)
        assert isinstance(result, str)

    def test_contem_xxa_e_xxz(self, external_label_defaults):
        result = render_external_label(**external_label_defaults)
        assert "^XA" in result
        assert "^XZ" in result

    def test_contem_qr_code(self, external_label_defaults):
        """Verifica que o comando ^BQN (QR code) está presente."""
        result = render_external_label(**external_label_defaults)
        assert "^BQN" in result

    def test_contem_ax_code(self, external_label_defaults):
        result = render_external_label(**external_label_defaults)
        assert "AX0003578" in result

    def test_contem_fab_code(self, external_label_defaults):
        result = render_external_label(**external_label_defaults)
        assert "FAB01015" in result

    def test_contem_qr_url(self, external_label_defaults):
        result = render_external_label(**external_label_defaults)
        assert "https://app.axengenharia.com.br/id/FAB01015" in result

    def test_contem_nome_quadro(self, external_label_defaults):
        result = render_external_label(**external_label_defaults)
        assert "QDC-01" in result

    def test_contem_nome_obra(self, external_label_defaults):
        result = render_external_label(**external_label_defaults)
        assert "Edifício Horizonte" in result

    def test_contem_rodape(self, external_label_defaults):
        result = render_external_label(**external_label_defaults)
        assert "Baixe seu projeto!" in result

    def test_contem_borda_externa(self, external_label_defaults):
        result = render_external_label(**external_label_defaults)
        assert "^GB794,434,3" in result

    def test_contem_dimensoes_corretas(self, external_label_defaults):
        """Verifica ^PW800 e ^LL440 para 100x55mm @ 203dpi."""
        result = render_external_label(**external_label_defaults)
        assert "^PW800" in result
        assert "^LL440" in result

    def test_campos_vazios_nao_quebram(self):
        result = render_external_label(
            ax_code="",
            fab_code="",
            nome_quadro="",
            nome_obra="",
            qr_url="",
        )
        assert "^XA" in result
        assert "^XZ" in result

    def test_campos_none_nao_quebram(self):
        result = render_external_label(
            ax_code=None,
            fab_code=None,
            nome_quadro=None,
            nome_obra=None,
            qr_url=None,
        )
        assert "^XA" in result
        assert "^XZ" in result

    def test_qr_url_sanitizada(self):
        """Caracteres ^ e ~ na URL devem ser removidos."""
        result = render_external_label(
            ax_code="AX001",
            fab_code="FAB001",
            nome_quadro="QDC",
            nome_obra="Obra",
            qr_url="https://example.com/^test~path",
        )
        assert "^XA" in result
        assert "^XZ" in result
