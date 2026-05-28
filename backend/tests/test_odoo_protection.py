"""
Testes unitários para o sistema de proteção de banco de dados de produção.

Este módulo testa as funções críticas de segurança que impedem modificações
acidentais no banco de produção quando o sistema está operando em modo de teste.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from sqlmodel.ext.asyncio.session import AsyncSession

from app.services.odoo_utils import (
    PRODUCTION_DB_NAME,
    is_production_environment,
    is_production_write_blocked,
    classify_database,
    is_selectable,
    get_active_odoo_db
)


class TestProductionProtection:
    """Testes para funções de proteção de produção."""
    
    def test_production_db_name_constant(self):
        """Verifica que a constante PRODUCTION_DB_NAME está definida corretamente."""
        assert PRODUCTION_DB_NAME == "axengenharia1"
        assert isinstance(PRODUCTION_DB_NAME, str)
        assert len(PRODUCTION_DB_NAME) > 0
    
    def test_is_production_environment_with_production_db(self):
        """Deve retornar True quando o banco é de produção."""
        assert is_production_environment("axengenharia1") is True
    
    def test_is_production_environment_with_test_db(self):
        """Deve retornar False quando o banco é de teste."""
        assert is_production_environment("teste-22-03") is False
        assert is_production_environment("id-visual-3") is False
        assert is_production_environment("teste-dres") is False
    
    def test_is_production_environment_case_sensitive(self):
        """Deve ser case-sensitive para evitar bypass acidental."""
        assert is_production_environment("AXENGENHARIA1") is False
        assert is_production_environment("AxEngenharia1") is False
        assert is_production_environment("axengenharia1 ") is False  # com espaço
    
    def test_classify_database_production(self):
        """Deve classificar corretamente o banco de produção."""
        assert classify_database("axengenharia1") == "production"
    
    def test_classify_database_test(self):
        """Deve classificar corretamente bancos de teste."""
        assert classify_database("teste-22-03") == "test"
        assert classify_database("id-visual-3") == "test"
        assert classify_database("staging") == "test"
        assert classify_database("dev") == "test"
    
    def test_is_selectable_production(self):
        """Banco de produção NÃO deve ser selecionável."""
        assert is_selectable("production") is False
    
    def test_is_selectable_test(self):
        """Bancos de teste DEVEM ser selecionáveis."""
        assert is_selectable("test") is True
    
    @pytest.mark.asyncio
    async def test_is_production_write_blocked_when_in_test(self, mocker):
        """
        Deve bloquear escritas em produção quando banco ativo é de teste.
        
        CENÁRIO: Sistema operando em "teste-22-03"
        ESPERADO: Escritas em produção devem ser bloqueadas (retorna True)
        """
        # Mock da sessão
        mock_session = AsyncMock(spec=AsyncSession)
        
        # Mock do get_active_odoo_db para retornar banco de teste
        mocker.patch(
            'app.services.odoo_utils.get_active_odoo_db',
            return_value="teste-22-03"
        )
        
        result = await is_production_write_blocked(mock_session)
        
        assert result is True, "Escritas em produção devem ser bloqueadas quando em teste"
    
    @pytest.mark.asyncio
    async def test_is_production_write_blocked_when_in_production(self, mocker):
        """
        Deve permitir escritas em produção quando banco ativo é de produção.
        
        CENÁRIO: Sistema operando em "axengenharia1" (produção)
        ESPERADO: Escritas em produção devem ser permitidas (retorna False)
        """
        # Mock da sessão
        mock_session = AsyncMock(spec=AsyncSession)
        
        # Mock do get_active_odoo_db para retornar banco de produção
        mocker.patch(
            'app.services.odoo_utils.get_active_odoo_db',
            return_value="axengenharia1"
        )
        
        result = await is_production_write_blocked(mock_session)
        
        assert result is False, "Escritas em produção devem ser permitidas quando em produção"
    
    @pytest.mark.asyncio
    async def test_is_production_write_blocked_multiple_test_dbs(self, mocker):
        """
        Deve bloquear escritas em produção para qualquer banco de teste.
        """
        mock_session = AsyncMock(spec=AsyncSession)
        
        test_databases = [
            "teste-22-03",
            "teste-27-02",
            "teste-28-04",
            "id-visual-5",
            "staging",
            "dev",
            "qa"
        ]
        
        for test_db in test_databases:
            mocker.patch(
                'app.services.odoo_utils.get_active_odoo_db',
                return_value=test_db
            )
            
            result = await is_production_write_blocked(mock_session)
            
            assert result is True, f"Escritas devem ser bloqueadas para banco de teste '{test_db}'"


class TestDatabaseClassification:
    """Testes para classificação de bancos de dados."""
    
    def test_classify_edge_cases(self):
        """Testa casos extremos de classificação."""
        # Strings vazias e None não devem causar exceção
        assert classify_database("") == "test"
        
        # Nomes similares mas não exatos
        assert classify_database("axengenharia") == "test"
        assert classify_database("axengenharia11") == "test"
        assert classify_database("axengenharia1-backup") == "test"
    
    def test_is_selectable_edge_cases(self):
        """Testa casos extremos de selecionabilidade."""
        # Apenas "production" deve ser não-selecionável
        assert is_selectable("production") is False
        assert is_selectable("test") is True
        assert is_selectable("staging") is True  # staging é classificado como test
        assert is_selectable("dev") is True


class TestGetActiveOdooDb:
    """Testes para função get_active_odoo_db com fallback chain."""
    
    @pytest.mark.asyncio
    async def test_get_active_odoo_db_from_system_setting(self, mocker):
        """
        Deve retornar o banco configurado em system_setting quando disponível.
        """
        # Mock da sessão e resultado da query
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_setting = MagicMock()
        mock_setting.value = "teste-22-03"
        mock_result.scalars.return_value.first.return_value = mock_setting
        mock_session.execute.return_value = mock_result
        
        result = await get_active_odoo_db(mock_session)
        
        assert result == "teste-22-03"
    
    @pytest.mark.asyncio
    async def test_get_active_odoo_db_fallback_to_settings(self, mocker):
        """
        Deve usar settings.ODOO_DB quando system_setting não está disponível.
        """
        # Mock da sessão retornando None (sem configuração)
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = None
        mock_session.execute.return_value = mock_result
        
        # Mock das settings
        mocker.patch('app.services.odoo_utils.settings.ODOO_DB', "id-visual-3")
        
        result = await get_active_odoo_db(mock_session)
        
        assert result == "id-visual-3"
    
    @pytest.mark.asyncio
    async def test_get_active_odoo_db_handles_database_error(self, mocker):
        """
        Deve usar fallback quando há erro ao consultar o banco.
        """
        # Mock da sessão que lança exceção
        mock_session = AsyncMock(spec=AsyncSession)
        mock_session.execute.side_effect = Exception("Database connection error")
        
        # Mock das settings
        mocker.patch('app.services.odoo_utils.settings.ODOO_DB', "id-visual-3")
        
        result = await get_active_odoo_db(mock_session)
        
        assert result == "id-visual-3"


class TestSecurityInvariants:
    """Testes para garantir invariantes de segurança críticos."""
    
    def test_production_db_never_selectable(self):
        """
        INVARIANTE CRÍTICO: O banco de produção NUNCA deve ser selecionável.
        """
        prod_type = classify_database(PRODUCTION_DB_NAME)
        assert prod_type == "production"
        assert is_selectable(prod_type) is False
    
    def test_production_detection_is_consistent(self):
        """
        INVARIANTE: is_production_environment e classify_database devem ser consistentes.
        """
        test_cases = [
            ("axengenharia1", True, "production"),
            ("teste-22-03", False, "test"),
            ("id-visual-3", False, "test"),
        ]
        
        for db_name, expected_is_prod, expected_type in test_cases:
            assert is_production_environment(db_name) == expected_is_prod
            assert classify_database(db_name) == expected_type
            
            # Consistência: se é produção, tipo deve ser "production"
            if expected_is_prod:
                assert expected_type == "production"
            else:
                assert expected_type == "test"
    
    @pytest.mark.asyncio
    async def test_write_protection_logic_is_inverse_of_production_check(self, mocker):
        """
        INVARIANTE: is_production_write_blocked deve ser o inverso de is_production_environment.
        
        - Se banco ativo É produção → escritas NÃO bloqueadas (False)
        - Se banco ativo NÃO é produção → escritas bloqueadas (True)
        """
        mock_session = AsyncMock(spec=AsyncSession)
        
        # Teste 1: Banco ativo é produção
        mocker.patch('app.services.odoo_utils.get_active_odoo_db', return_value="axengenharia1")
        blocked = await is_production_write_blocked(mock_session)
        assert blocked is False, "Escritas não devem ser bloqueadas quando em produção"
        
        # Teste 2: Banco ativo é teste
        mocker.patch('app.services.odoo_utils.get_active_odoo_db', return_value="teste-22-03")
        blocked = await is_production_write_blocked(mock_session)
        assert blocked is True, "Escritas devem ser bloqueadas quando em teste"
