"""feat: adiciona campos nao_consta ao IDRequest para rastreamento de IDs nao entregues

Revision ID: g1h2i3j4k5l6
Revises: a2b3c4d5e6f7
Create Date: 2026-04-16 10:00:00.000000

Adiciona 3 colunas ao id_request:
  - nao_consta_em: TIMESTAMP (nullable, indexed) — quando o operador registrou
  - nao_consta_items: JSON (nullable) — lista de task_codes que nao chegaram
  - nao_consta_registrado_por: VARCHAR (nullable) — nome do operador
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'g1h2i3j4k5l6'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('id_request', sa.Column('nao_consta_em', sa.DateTime(), nullable=True))
    op.add_column('id_request', sa.Column('nao_consta_items', sa.JSON(), nullable=True))
    op.add_column('id_request', sa.Column('nao_consta_registrado_por', sa.String(), nullable=True))

    op.create_index(
        op.f('ix_id_request_nao_consta_em'),
        'id_request',
        ['nao_consta_em'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_id_request_nao_consta_em'), table_name='id_request')
    op.drop_column('id_request', 'nao_consta_registrado_por')
    op.drop_column('id_request', 'nao_consta_items')
    op.drop_column('id_request', 'nao_consta_em')
