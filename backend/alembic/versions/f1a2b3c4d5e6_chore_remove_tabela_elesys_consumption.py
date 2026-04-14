"""chore: remove tabela elesys_consumption sem uso

Revision ID: f1a2b3c4d5e6
Revises: e1f2a3b4c5d6
Create Date: 2026-04-14

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('elesys_consumption')


def downgrade() -> None:
    op.create_table(
        'elesys_consumption',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('code', sa.String(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_elesys_consumption_date', 'elesys_consumption', ['date'])
