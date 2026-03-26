from typing import List, Optional, Union, Any
import os
from pydantic import AnyHttpUrl, PostgresDsn, field_validator, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Odoo Backend"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = "CHANGE_THIS_TO_A_SECURE_SECRET_KEY"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days
    ALGORITHM: str = "HS256"
    ODOO_WEBHOOK_SECRET: str = "SET_THIS_IN_ENV_FOR_SECURITY"
    
    # Fernet Implementation (32 url-safe base64-encoded bytes)
    # Generate one e.g. with: cryptography.fernet.Fernet.generate_key().decode()
    ENCRYPTION_KEY: str = "gX2scx5P9p8w-d5c2J5q3k5P9p8w-d5c2J5q3k5P9p8="

    # Integration
    OPENROUTER_API_KEY: str = "your_key_here"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = []

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "odoo_backend"
    POSTGRES_PORT: int = Field(default=5432, validation_alias="POSTGRES_PORT")
    DATABASE_URL: Optional[str] = None

    @field_validator("DATABASE_URL", mode="before")
    def assemble_db_connection(cls, v: Optional[str], info) -> str:
        if isinstance(v, str):
            return v
        return PostgresDsn.build(
            scheme="postgresql+asyncpg",
            username=info.data.get("POSTGRES_USER"),
            password=info.data.get("POSTGRES_PASSWORD"),
            host=info.data.get("POSTGRES_SERVER"),
            port=info.data.get("POSTGRES_PORT"),
            path=info.data.get("POSTGRES_DB") or "",
        ).unicode_string()

    # Celery & Redis
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # Odoo Connection
    ODOO_URL: str = "https://teste-dres.odoo.com"
    ODOO_DB: str = "teste-dres"
    ODOO_LOGIN: str = ""
    ODOO_PASSWORD: str = ""
    ODOO_API_KEY: str = ""
    ODOO_AUTH_TYPE: str = "jsonrpc_password"
    
    @field_validator("ODOO_URL", "ODOO_DB", "ODOO_LOGIN", "ODOO_PASSWORD", "ODOO_API_KEY", mode="before")
    def strip_string(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v
    
    # Odoo Activity Configuration
    ODOO_ID_VISUAL_ACTIVITY_TYPE_ID: Optional[int] = None
    ODOO_ACTIVITY_USER_ID: int = 2

    # --- Andon Configuration ---
    # ID do grupo res.groups no Odoo que define administradores do ID Visual
    ID_VISUAL_ADMIN_GROUP_ID: Optional[int] = None
    # Estados de mrp.workorder considerados "ativos" para exibição no Andon
    ANDON_WO_STATES: List[str] = ["progress", "ready"]
    # ID do tipo de picking interno (stock.picking.type) para requisições de material
    ANDON_INTERNAL_PICKING_TYPE_ID: Optional[int] = None
    # ID do canal mail.channel no Discuss para notificações de parada crítica
    ANDON_CHANNEL_ID: Optional[int] = None
    # ID do usuário/responsável de engenharia que recebe mail.activity de parada
    ANDON_ENGINEERING_USER_ID: Optional[int] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True, 
        extra="ignore"
    )

settings = Settings()

# --- Startup Security Validation ---
_INSECURE_DEFAULTS = {
    "SECRET_KEY": "CHANGE_THIS_TO_A_SECURE_SECRET_KEY",
    "ENCRYPTION_KEY": "gX2scx5P9p8w-d5c2J5q3k5P9p8w-d5c2J5q3k5P9p8=",
    "ODOO_WEBHOOK_SECRET": "SET_THIS_IN_ENV_FOR_SECURITY",
    "OPENROUTER_API_KEY": "your_key_here",
}

for _key, _default in _INSECURE_DEFAULTS.items():
    if getattr(settings, _key) == _default:
        import warnings
        warnings.warn(
            f"⚠️  SECURITY: '{_key}' is using the insecure default value. "
            f"Set it in .env before deploying to production.",
            stacklevel=2,
        )
