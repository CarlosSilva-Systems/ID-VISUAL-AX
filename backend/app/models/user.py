from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel
from enum import Enum

_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class UserRole(str, Enum):
    OPERATOR = "operator"
    RESPONSIBLE = "responsible"
    ADMIN = "admin"


class UserBase(SQLModel):
    username: str = Field(index=True, unique=True)
    full_name: Optional[str] = None
    department: Optional[str] = Field(default=None, index=True)
    role: UserRole = Field(default=UserRole.OPERATOR)
    is_active: bool = Field(default=True)

    is_odoo_test_mode: bool = Field(default=False)
    odoo_test_url: Optional[str] = Field(default=None)


class User(UserBase, table=True):
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now, sa_column_kwargs={"onupdate": _now})
