from typing import Optional
from pydantic import BaseModel, HttpUrl, Field

class UserOdooConfig(BaseModel):
    is_odoo_test_mode: bool
    odoo_test_url: Optional[str] = None
    department: Optional[str] = None

class UserOdooConfigUpdate(BaseModel):
    is_odoo_test_mode: Optional[bool] = None
    odoo_test_url: Optional[HttpUrl] = Field(None, description="URL válida para o ambiente de teste do Odoo")
