"""feat: adiciona tabela andon_settings

Revision ID: e1f2a3b4c5d6
Revises: d2e3f4a5b6c7
Create Date: 2026-04-10 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'e1f2a3b4c5d6'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'andon_settings',
        sa.Column('id', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('working_day_start', sa.String(), nullable=False, server_default='08:00'),
        sa.Column('working_day_end', sa.String(), nullable=False, server_default='17:00'),
        sa.Column('working_days', sa.String(), nullable=False,
                  server_default='["monday","tuesday","wednesday","thursday","friday"]'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('andon_settings')
