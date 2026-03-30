"""
Utilitários para integração com Odoo.

Este módulo contém funções auxiliares para gerenciamento de banco de dados Odoo,
validação de nomes e normalização de dados.
"""

import re
import logging
from typing import Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

logger = logging.getLogger(__name__)


async def get_active_odoo_db(session: AsyncSession) -> str:
    """
    Retorna o banco de dados Odoo ativo com fallback chain robusto.
    
    Ordem de prioridade:
    1. system_setting.active_odoo_db (configuração dinâmica)
    2. "id-visual-3" (padrão hardcoded para desenvolvimento)
    3. settings.ODOO_DB (fallback de emergência do .env)
    
    Args:
        session: AsyncSession do SQLModel para consulta ao banco de dados
        
    Returns:
        str: Nome do banco de dados Odoo ativo
        
    Examples:
        >>> async with get_session() as session:
        ...     db_name = await get_active_odoo_db(session)
        ...     print(db_name)  # "id-visual-3" ou valor configurado
    """
    from app.models.system_setting import SystemSetting
    from app.core.config import settings
    
    try:
        # Tentativa 1: Buscar configuração dinâmica no banco
        stmt = select(SystemSetting).where(SystemSetting.key == "active_odoo_db")
        result = await session.execute(stmt)
        setting = result.scalars().first()
        
        if setting and setting.value:
            db_name = setting.value.strip()
            if db_name:
                logger.info(f"✓ Active Odoo DB from system_setting: {db_name}")
                return db_name
        
        # Fallback 1: Padrão hardcoded para desenvolvimento
        logger.warning("⚠️ No active_odoo_db in system_setting, using default: id-visual-3")
        return "id-visual-3"
        
    except Exception as e:
        # Fallback 2: Usar configuração do .env em caso de erro de banco
        logger.error(
            f"🚨 Failed to get active_odoo_db from database: {e}. "
            f"Falling back to settings.ODOO_DB: {settings.ODOO_DB}"
        )
        return settings.ODOO_DB


def validate_database_name(name: str) -> bool:
    """
    Valida se um nome de banco de dados Odoo é válido.
    
    Regras de validação:
    - Não pode ser vazio ou conter apenas espaços
    - Deve conter apenas caracteres alfanuméricos, hífens (-) e underscores (_)
    - Tamanho mínimo: 1 caractere (após trim)
    - Tamanho máximo: 63 caracteres (limite PostgreSQL)
    
    Args:
        name: Nome do banco de dados a ser validado
        
    Returns:
        bool: True se válido, False caso contrário
        
    Examples:
        >>> validate_database_name("id-visual-3")
        True
        >>> validate_database_name("teste_dres")
        True
        >>> validate_database_name("banco com espaços")
        False
        >>> validate_database_name("")
        False
        >>> validate_database_name("   ")
        False
    """
    if not name or not name.strip():
        return False
    
    trimmed = name.strip()
    
    # Verifica tamanho (PostgreSQL limit)
    if len(trimmed) > 63:
        return False
    
    # Regex: apenas alfanuméricos, hífen e underscore
    pattern = r'^[a-zA-Z0-9_-]+$'
    return bool(re.match(pattern, trimmed))


def normalize_database_name(name: str) -> str:
    """
    Normaliza um nome de banco de dados removendo espaços em branco.
    
    Args:
        name: Nome do banco de dados a ser normalizado
        
    Returns:
        str: Nome normalizado (trimmed)
        
    Examples:
        >>> normalize_database_name("  id-visual-3  ")
        'id-visual-3'
        >>> normalize_database_name("teste-dres")
        'teste-dres'
    """
    return name.strip()


def classify_database(db_name: str) -> str:
    """
    Classifica um banco de dados como 'production' ou 'test'.
    
    Regra de classificação:
    - "axengenharia1" → production
    - Qualquer outro nome → test
    
    Args:
        db_name: Nome do banco de dados
        
    Returns:
        str: "production" ou "test"
        
    Examples:
        >>> classify_database("axengenharia1")
        'production'
        >>> classify_database("id-visual-3")
        'test'
        >>> classify_database("teste-dres")
        'test'
    """
    return "production" if db_name == "axengenharia1" else "test"


def is_selectable(db_type: str) -> bool:
    """
    Determina se um banco de dados pode ser selecionado pelo usuário.
    
    Regra de proteção:
    - production → False (protegido contra seleção acidental)
    - test → True (pode ser selecionado livremente)
    
    Args:
        db_type: Tipo do banco ("production" ou "test")
        
    Returns:
        bool: True se selecionável, False caso contrário
        
    Examples:
        >>> is_selectable("production")
        False
        >>> is_selectable("test")
        True
    """
    return db_type == "test"
