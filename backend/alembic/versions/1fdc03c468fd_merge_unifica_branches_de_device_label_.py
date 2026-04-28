"""merge: unifica branches de device_label e door_presets

Revision ID: 1fdc03c468fd
Revises: 6845f97487d8, h1i2j3k4l5m6
Create Date: 2026-04-28 10:06:16.161122

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '1fdc03c468fd'
down_revision: Union[str, None] = ('6845f97487d8', 'h1i2j3k4l5m6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
