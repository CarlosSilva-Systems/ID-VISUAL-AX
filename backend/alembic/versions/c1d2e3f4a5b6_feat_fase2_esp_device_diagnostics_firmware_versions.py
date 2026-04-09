"""feat: fase2 - campos diagnóstico em esp_devices, level em esp_device_logs e tabela firmware_versions

Revision ID: c1d2e3f4a5b6
Revises: b9a922a58e25
Create Date: 2026-04-09 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b9a922a58e25'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Novos campos de diagnóstico em esp_devices ──────────────────────────
    with op.batch_alter_table('esp_devices', schema=None) as batch_op:
        batch_op.add_column(sa.Column('firmware_version', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('rssi', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('is_root', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('mesh_node_count', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('ip_address', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('uptime_seconds', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('notes', sa.String(), nullable=True))

    # ── 2. Campo level em esp_device_logs ─────────────────────────────────────
    with op.batch_alter_table('esp_device_logs', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('level', sa.String(length=10), nullable=False, server_default='INFO')
        )

    # ── 3. Tabela firmware_versions ───────────────────────────────────────────
    op.create_table(
        'firmware_versions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('version', sa.String(length=50), nullable=False),
        sa.Column('release_notes', sa.String(), nullable=True),
        sa.Column('file_path', sa.String(), nullable=False),
        sa.Column('file_size_bytes', sa.Integer(), nullable=False),
        sa.Column('is_stable', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('version'),
        sa.CheckConstraint('file_size_bytes > 0', name='firmware_versions_file_size_check'),
    )
    op.create_index('idx_firmware_versions_version', 'firmware_versions', ['version'])
    op.create_index('idx_firmware_versions_is_stable', 'firmware_versions', ['is_stable'])
    op.create_index('idx_firmware_versions_created_at', 'firmware_versions', ['created_at'])


def downgrade() -> None:
    op.drop_index('idx_firmware_versions_created_at', table_name='firmware_versions')
    op.drop_index('idx_firmware_versions_is_stable', table_name='firmware_versions')
    op.drop_index('idx_firmware_versions_version', table_name='firmware_versions')
    op.drop_table('firmware_versions')

    with op.batch_alter_table('esp_device_logs', schema=None) as batch_op:
        batch_op.drop_column('level')

    with op.batch_alter_table('esp_devices', schema=None) as batch_op:
        batch_op.drop_column('notes')
        batch_op.drop_column('uptime_seconds')
        batch_op.drop_column('ip_address')
        batch_op.drop_column('mesh_node_count')
        batch_op.drop_column('is_root')
        batch_op.drop_column('rssi')
        batch_op.drop_column('firmware_version')
