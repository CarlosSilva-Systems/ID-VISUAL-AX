"""refactor: remove tabelas órfãs andon_event e andon_material_request

Revision ID: i1j2k3l4m5n6
Revises: h1i2j3k4l5m6
Create Date: 2026-04-29 14:00:00.000000

Remove tabelas que nunca foram instanciadas em nenhum endpoint:
- andon_event: histórico de acionamentos (nunca usado, histórico vai para Odoo chatter)
- andon_material_request: requisições de material (nunca usado)

Parte da refatoração de arquitetura para eliminar duplicação de dados.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'i1j2k3l4m5n6'
down_revision: Union[str, None] = 'h1i2j3k4l5m6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop andon_event (órfã — nunca instanciada)
    op.drop_table('andon_event')
    
    # Drop andon_material_request (órfã — nunca instanciada)
    op.drop_table('andon_material_request')


def downgrade() -> None:
    # Recriar andon_material_request
    op.create_table(
        'andon_material_request',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workcenter_odoo_id', sa.Integer(), nullable=False),
        sa.Column('workorder_odoo_id', sa.Integer(), nullable=True),
        sa.Column('production_odoo_id', sa.Integer(), nullable=True),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('fulfilled_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Recriar andon_event
    op.create_table(
        'andon_event',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workcenter_odoo_id', sa.Integer(), nullable=False),
        sa.Column('workcenter_name', sa.String(), nullable=False),
        sa.Column('workorder_odoo_id', sa.Integer(), nullable=True),
        sa.Column('production_odoo_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('reason', sa.String(), nullable=True),
        sa.Column('triggered_by', sa.String(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('odoo_picking_id', sa.Integer(), nullable=True),
        sa.Column('odoo_activity_id', sa.Integer(), nullable=True),
        sa.Column('material_request_id', sa.Integer(), nullable=True),
        sa.Column('pause_ok', sa.Boolean(), nullable=True),
        sa.Column('pause_method', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['material_request_id'], ['andon_material_request.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_andon_event_workcenter_odoo_id', 'andon_event', ['workcenter_odoo_id'])
