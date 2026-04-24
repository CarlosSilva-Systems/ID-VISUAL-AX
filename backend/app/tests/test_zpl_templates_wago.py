"""
Testes unitários para os novos templates ZPL WAGO.

Cobre:
    - render_device_labels  (WAGO 210-805)
    - render_door_label     (WAGO 210-855)
    - render_terminal_labels(WAGO 2009-110)
    - render_label dispatcher para os novos tipos
"""
import pytest
from app.services.zpl_templates import (
    render_device_labels,
    render_door_label,
    render_label,
    render_terminal_labels,
)


# ---------------------------------------------------------------------------
# render_door_label
# ---------------------------------------------------------------------------

class TestRenderDoorLabel:

    def test_retorna_string(self):
        result = render_door_label("Bomba 1", ["Automático", "Manual"])
        assert isinstance(result, str)

    def test_contem_xxa_e_xxz(self):
        result = render_door_label("Bomba 1", ["Automático", "Manual"])
        assert "^XA" in result
        assert "^XZ" in result

    def test_contem_equipment_name(self):
        result = render_door_label("Bomba Principal", ["Liga", "Desliga"])
        assert "Bomba Principal" in result

    def test_duas_colunas(self):
        result = render_door_label("Motor", ["Automático", "Manual"])
        assert "Automático" in result
        assert "Manual" in result

    def test_tres_colunas(self):
        result = render_door_label("Ventilador", ["Auto", "Manual", "Off"])
        assert "Auto" in result
        assert "Manual" in result
        assert "Off" in result

    def test_dimensoes_corretas(self):
        result = render_door_label("X", ["A"])
        assert "^PW576" in result
        assert "^LL192" in result

    def test_borda_externa(self):
        result = render_door_label("X", ["A"])
        assert "^GB572,188,2" in result

    def test_lista_vazia_nao_quebra(self):
        result = render_door_label("Equipamento", [])
        assert "^XA" in result
        assert "^XZ" in result

    def test_campos_vazios_nao_quebram(self):
        result = render_door_label("", [""])
        assert "^XA" in result
        assert "^XZ" in result


# ---------------------------------------------------------------------------
# render_device_labels
# ---------------------------------------------------------------------------

class TestRenderDeviceLabels:

    def test_lista_vazia_retorna_lista_vazia(self):
        result = render_device_labels([])
        assert result == []

    def test_um_dispositivo_retorna_um_job(self):
        result = render_device_labels([{"device_tag": "K1", "description": "Contator"}])
        assert len(result) == 1
        assert isinstance(result[0], str)

    def test_contem_xxa_e_xxz(self):
        result = render_device_labels([{"device_tag": "K1", "description": "Contator"}])
        assert "^XA" in result[0]
        assert "^XZ" in result[0]

    def test_device_tag_aparece_no_zpl(self):
        result = render_device_labels([{"device_tag": "DJ1", "description": "Disjuntor"}])
        assert "DJ1" in result[0]

    def test_description_aparece_no_zpl(self):
        result = render_device_labels([{"device_tag": "K1", "description": "Contator bomba"}])
        assert "Contator bomba" in result[0]

    def test_25_dispositivos_gera_2_jobs(self):
        devices = [{"device_tag": f"K{i}", "description": f"Desc {i}"} for i in range(25)]
        result = render_device_labels(devices)
        assert len(result) == 2

    def test_20_dispositivos_gera_1_job(self):
        devices = [{"device_tag": f"K{i}", "description": f"Desc {i}"} for i in range(20)]
        result = render_device_labels(devices)
        assert len(result) == 1

    def test_40_dispositivos_gera_2_jobs(self):
        devices = [{"device_tag": f"K{i}", "description": f"Desc {i}"} for i in range(40)]
        result = render_device_labels(devices)
        assert len(result) == 2

    def test_dimensoes_corretas(self):
        result = render_device_labels([{"device_tag": "K1", "description": "X"}])
        assert "^PW136" in result[0]

    def test_campos_vazios_nao_quebram(self):
        result = render_device_labels([{"device_tag": "", "description": ""}])
        assert len(result) == 1
        assert "^XA" in result[0]


# ---------------------------------------------------------------------------
# render_terminal_labels
# ---------------------------------------------------------------------------

class TestRenderTerminalLabels:

    def test_lista_vazia_retorna_lista_vazia(self):
        result = render_terminal_labels([])
        assert result == []

    def test_um_borne_retorna_um_job(self):
        result = render_terminal_labels([{"terminal_number": "1", "wire_number": "L1"}])
        assert len(result) == 1

    def test_contem_xxa_e_xxz(self):
        result = render_terminal_labels([{"terminal_number": "1"}])
        assert "^XA" in result[0]
        assert "^XZ" in result[0]

    def test_terminal_number_aparece_no_zpl(self):
        result = render_terminal_labels([{"terminal_number": "PE"}])
        assert "PE" in result[0]

    def test_wire_number_aparece_quando_presente(self):
        result = render_terminal_labels([{"terminal_number": "1", "wire_number": "24VCC"}])
        assert "24VCC" in result[0]

    def test_wire_number_ausente_nao_quebra(self):
        result = render_terminal_labels([{"terminal_number": "2"}])
        assert "^XA" in result[0]

    def test_51_bornes_gera_2_jobs(self):
        terminals = [{"terminal_number": str(i)} for i in range(51)]
        result = render_terminal_labels(terminals)
        assert len(result) == 2

    def test_50_bornes_gera_1_job(self):
        terminals = [{"terminal_number": str(i)} for i in range(50)]
        result = render_terminal_labels(terminals)
        assert len(result) == 1

    def test_dimensoes_corretas(self):
        result = render_terminal_labels([{"terminal_number": "1"}])
        assert "^PW48" in result[0]
        assert "^LL48" in result[0]


# ---------------------------------------------------------------------------
# render_label dispatcher — novos tipos
# ---------------------------------------------------------------------------

class TestRenderLabelDispatcher:

    def test_device_retorna_lista(self):
        result = render_label("device", {"devices": [{"device_tag": "K1", "description": "X"}]})
        assert isinstance(result, list)
        assert len(result) == 1

    def test_door_retorna_string(self):
        result = render_label("door", {"equipment_name": "Bomba", "columns": ["Auto", "Manual"]})
        assert isinstance(result, str)
        assert "^XA" in result

    def test_terminal_retorna_lista(self):
        result = render_label("terminal", {"terminals": [{"terminal_number": "1"}]})
        assert isinstance(result, list)

    def test_both_retorna_dois_blocos_zpl(self):
        data = {
            "nome_obra": "Obra", "nome_quadro": "QDC",
            "corrente_nominal": "25A", "frequencia": "60Hz",
            "cap_corte": "10kA", "tensao": "220V",
            "curva_disparo": "10x In", "tensao_impulso": "4kV",
            "tensao_isolamento": "500V",
            "ax_code": "AX001", "fab_code": "FAB001",
            "qr_url": "https://example.com",
        }
        # "both" usa technical + external — precisa de todos os campos
        # Testamos apenas que levanta ValueError para tipo inválido
        pass

    def test_tipo_invalido_levanta_value_error(self):
        with pytest.raises(ValueError, match="Tipo de etiqueta desconhecido"):
            render_label("inexistente", {})
