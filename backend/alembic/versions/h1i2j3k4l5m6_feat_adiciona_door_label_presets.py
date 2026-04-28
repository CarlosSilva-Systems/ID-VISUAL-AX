"""feat: adiciona tabelas door_label_preset e door_label_preset_favorite

Revision ID: h1i2j3k4l5m6
Revises: g1h2i3j4k5l6
Create Date: 2026-04-28 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'h1i2j3k4l5m6'
down_revision: Union[str, None] = 'g1h2i3j4k5l6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Criar tabela door_label_preset
    op.create_table(
        'door_label_preset',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('equipment_name', sa.String(length=100), nullable=False),
        sa.Column('columns', sa.JSON(), nullable=False),
        sa.Column('rows', sa.Integer(), nullable=False),
        sa.Column('is_system', sa.Boolean(), nullable=False),
        sa.Column('is_shared', sa.Boolean(), nullable=False),
        sa.Column('created_by', sa.String(length=100), nullable=True),
        sa.Column('usage_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_door_label_preset_name', 'door_label_preset', ['name'])
    op.create_index('ix_door_label_preset_is_system', 'door_label_preset', ['is_system'])
    op.create_index('ix_door_label_preset_is_shared', 'door_label_preset', ['is_shared'])
    op.create_index('ix_door_label_preset_created_by', 'door_label_preset', ['created_by'])

    # Criar tabela door_label_preset_favorite
    op.create_table(
        'door_label_preset_favorite',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('preset_id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['preset_id'], ['door_label_preset.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_door_label_preset_favorite_preset_id', 'door_label_preset_favorite', ['preset_id'])
    op.create_index('ix_door_label_preset_favorite_username', 'door_label_preset_favorite', ['username'])

    # Inserir presets do sistema
    op.execute("""
        INSERT INTO door_label_preset (name, category, equipment_name, columns, rows, is_system, is_shared, usage_count, created_at, updated_at)
        VALUES
        ('Comando Energizado', 'sinaleira', 'COMANDO ENERGIZADO', '[]', 1, true, true, 0, NOW(), NOW()),
        ('Liga Bomba de Incêndio', 'sinaleira', 'LIGA BOMBA DE INCÊNDIO', '[]', 1, true, true, 0, NOW(), NOW()),
        ('Bomba de Incêndio Ligada', 'sinaleira', 'BOMBA DE INCÊNDIO LIGADA', '[]', 1, true, true, 0, NOW(), NOW()),
        ('Botoeira 3 Posições', 'botoeira-3pos', '', '["MAN", "O", "AUT"]', 1, true, true, 0, NOW(), NOW()),
        ('Botoeira 2 Posições', 'botoeira-2pos', '', '["MAN", "AUT"]', 1, true, true, 0, NOW(), NOW())
    """)


def downgrade() -> None:
    op.drop_index('ix_door_label_preset_favorite_username', table_name='door_label_preset_favorite')
    op.drop_index('ix_door_label_preset_favorite_preset_id', table_name='door_label_preset_favorite')
    op.drop_table('door_label_preset_favorite')
    
    op.drop_index('ix_door_label_preset_created_by', table_name='door_label_preset')
    op.drop_index('ix_door_label_preset_is_shared', table_name='door_label_preset')
    op.drop_index('ix_door_label_preset_is_system', table_name='door_label_preset')
    op.drop_index('ix_door_label_preset_name', table_name='door_label_preset')
    op.drop_table('door_label_preset')
