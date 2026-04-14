"""fix: adiciona campo motivo em fabricacao_block

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-14

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('fabricacao_block', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'motivo',
                sa.String(),
                nullable=True,
                server_default='AGUARDANDO_ID_VISUAL',
            )
        )
        batch_op.create_index('ix_fabricacao_block_motivo', ['motivo'])


def downgrade() -> None:
    with op.batch_alter_table('fabricacao_block', schema=None) as batch_op:
        batch_op.drop_index('ix_fabricacao_block_motivo')
        batch_op.drop_column('motivo')
