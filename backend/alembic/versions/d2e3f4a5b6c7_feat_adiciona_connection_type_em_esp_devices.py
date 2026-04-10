"""feat: adiciona campo connection_type em esp_devices

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-04-10 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='esp_devices' AND column_name='connection_type'"
    ))
    if not result.fetchone():
        conn.execute(sa.text("ALTER TABLE esp_devices ADD COLUMN connection_type VARCHAR"))


def downgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='esp_devices' AND column_name='connection_type'"
    ))
    if result.fetchone():
        conn.execute(sa.text("ALTER TABLE esp_devices DROP COLUMN connection_type"))
