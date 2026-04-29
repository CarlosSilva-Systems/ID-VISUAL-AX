"""feat: adiciona odoo_mo_id em id_request e fabricacao_block para desacoplamento gradual

Revision ID: j1k2l3m4n5o6
Revises: i1j2k3l4m5n6
Create Date: 2026-04-29 15:00:00.000000

Adiciona referência direta ao Odoo (int) nas tabelas que dependem de FK local
para manufacturing_order. Isso permite futura remoção da tabela manufacturing_order
sem quebrar queries de analytics ou histórico.

Campos adicionados:
  - id_request.odoo_mo_id: INTEGER (nullable, indexed) — mrp.production.id no Odoo
  - fabricacao_block.odoo_mo_id: INTEGER (nullable, indexed) — mrp.production.id no Odoo

Backfill: popula odoo_mo_id via JOIN com manufacturing_order para registros existentes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'j1k2l3m4n5o6'
down_revision: Union[str, None] = 'i1j2k3l4m5n6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Adicionar odoo_mo_id em id_request
    op.add_column('id_request', sa.Column('odoo_mo_id', sa.Integer(), nullable=True))
    op.create_index('ix_id_request_odoo_mo_id', 'id_request', ['odoo_mo_id'], unique=False)

    # 2. Adicionar odoo_mo_id em fabricacao_block
    op.add_column('fabricacao_block', sa.Column('odoo_mo_id', sa.Integer(), nullable=True))
    op.create_index('ix_fabricacao_block_odoo_mo_id', 'fabricacao_block', ['odoo_mo_id'], unique=False)

    # 3. Backfill id_request.odoo_mo_id via JOIN com manufacturing_order
    op.execute("""
        UPDATE id_request
        SET odoo_mo_id = manufacturing_order.odoo_id
        FROM manufacturing_order
        WHERE id_request.mo_id = manufacturing_order.id
          AND id_request.odoo_mo_id IS NULL
    """)

    # 4. Backfill fabricacao_block.odoo_mo_id via JOIN com manufacturing_order
    op.execute("""
        UPDATE fabricacao_block
        SET odoo_mo_id = manufacturing_order.odoo_id
        FROM manufacturing_order
        WHERE fabricacao_block.mo_id = manufacturing_order.id
          AND fabricacao_block.odoo_mo_id IS NULL
    """)


def downgrade() -> None:
    op.drop_index('ix_fabricacao_block_odoo_mo_id', table_name='fabricacao_block')
    op.drop_column('fabricacao_block', 'odoo_mo_id')

    op.drop_index('ix_id_request_odoo_mo_id', table_name='id_request')
    op.drop_column('id_request', 'odoo_mo_id')
