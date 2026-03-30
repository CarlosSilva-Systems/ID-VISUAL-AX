"""
Schemas Pydantic para endpoints de gerenciamento de banco de dados Odoo.
"""

from pydantic import BaseModel, Field
from typing import Literal


class DatabaseInfo(BaseModel):
    """
    Informações sobre um banco de dados Odoo disponível.
    
    Attributes:
        name: Nome do banco de dados (ex: "id-visual-3", "axengenharia1")
        type: Tipo do banco ("production" ou "test")
        selectable: Se o banco pode ser selecionado pelo usuário
        is_active: Se este é o banco atualmente ativo no sistema
    """
    name: str = Field(..., description="Nome do banco de dados Odoo")
    type: Literal["production", "test"] = Field(..., description="Tipo do banco de dados")
    selectable: bool = Field(..., description="Se o banco pode ser selecionado")
    is_active: bool = Field(..., description="Se este é o banco ativo")


class DatabaseSelectRequest(BaseModel):
    """
    Payload para seleção de banco de dados Odoo.
    
    Attributes:
        database: Nome do banco de dados a ser selecionado
    """
    database: str = Field(..., description="Nome do banco de dados a selecionar", min_length=1)


class DatabaseSelectResponse(BaseModel):
    """
    Resposta da seleção de banco de dados Odoo.
    
    Attributes:
        status: Status da operação ("success" ou "error")
        database: Nome do banco de dados selecionado
        connection_ok: Se o teste de conexão foi bem-sucedido
    """
    status: Literal["success", "error"] = Field(..., description="Status da operação")
    database: str = Field(..., description="Nome do banco selecionado")
    connection_ok: bool = Field(..., description="Se a conexão foi testada com sucesso")
