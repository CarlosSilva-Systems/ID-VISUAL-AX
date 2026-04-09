"""feat: adiciona campos de justificativa em andon_call

Revision ID: a1b2c3d4e5f6
Revises: f45dafaf98ee
Create Date: 2026-04-09 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'b9a922a58e25'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Campos de parada
    op.add_column('andon_call', sa.Column('downtime_minutes', sa.Integer(), nullable=True))
    
    # Campo de controle de justificativa (não nullable, default False para registros existentes)
    op.add_column('andon_call', sa.Column(
        'requires_justification', sa.Boolean(), nullable=False, server_default='false'
    ))
    
    # Campos de justificativa (todos nullable)
    op.add_column('andon_call', sa.Column('justified_at', sa.DateTime(), nullable=True))
    op.add_column('andon_call', sa.Column('justified_by', sa.String(), nullable=True))
    op.add_column('andon_call', sa.Column('root_cause_category', sa.String(), nullable=True))
    op.add_column('andon_call', sa.Column('root_cause_detail', sa.Text(), nullable=True))
    op.add_column('andon_call', sa.Column('action_taken', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('andon_call', 'action_taken')
    op.drop_column('andon_call', 'root_cause_detail')
    op.drop_column('andon_call', 'root_cause_category')
    op.drop_column('andon_call', 'justified_by')
    op.drop_column('andon_call', 'justified_at')
    op.drop_column('andon_call', 'requires_justification')
    op.drop_column('andon_call', 'downtime_minutes')
