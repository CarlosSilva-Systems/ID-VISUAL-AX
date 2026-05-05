"""fix_add_roles_to_userrole_enum

Revision ID: 49c3c5e95b24
Revises: 72d5445021fc
Create Date: 2026-05-05 09:09:21.535140

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '49c3c5e95b24'
down_revision: Union[str, None] = '72d5445021fc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres ENUM add value cannot run inside a transaction in some cases
    # but here we try op.execute with individual statements
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'TI'")
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'PRODUCAO'")
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'ENGENHARIA'")
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'GERENCIA'")


def downgrade() -> None:
    # Postgres doesn't support removing values from an enum easily
    pass
