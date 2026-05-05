"""merge

Revision ID: a4af45196d82
Revises: 1fdc03c468fd, j1k2l3m4n5o6
Create Date: 2026-05-05 09:04:08.776098

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'a4af45196d82'
down_revision: Union[str, None] = ('1fdc03c468fd', 'j1k2l3m4n5o6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
