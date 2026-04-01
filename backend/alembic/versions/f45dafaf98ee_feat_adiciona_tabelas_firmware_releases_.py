"""feat: adiciona tabelas firmware_releases e ota_update_logs

Revision ID: f45dafaf98ee
Revises: 9d897bb0f491
Create Date: 2026-04-01 17:18:15.570645

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'f45dafaf98ee'
down_revision: Union[str, None] = '9d897bb0f491'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Criar tabela firmware_releases
    op.create_table(
        'firmware_releases',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('version', sa.String(length=50), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('github_release_id', sa.Integer(), nullable=True),
        sa.Column('download_url', sa.String(), nullable=True),
        sa.Column('local_path', sa.String(), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False),
        sa.Column('uploaded_by', sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('version'),
        sa.CheckConstraint('file_size > 0', name='firmware_releases_file_size_check')
    )
    op.create_index('idx_firmware_releases_version', 'firmware_releases', ['version'])
    op.create_index('idx_firmware_releases_uploaded_at', 'firmware_releases', ['uploaded_at'], postgresql_ops={'uploaded_at': 'DESC'})
    
    # Criar tabela ota_update_logs
    op.create_table(
        'ota_update_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('device_id', sa.UUID(), nullable=False),
        sa.Column('firmware_release_id', sa.UUID(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('progress_percent', sa.Integer(), nullable=False),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('previous_version', sa.String(length=50), nullable=True),
        sa.Column('target_version', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['device_id'], ['esp_devices.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['firmware_release_id'], ['firmware_releases.id'], ondelete='CASCADE'),
        sa.CheckConstraint('progress_percent >= 0 AND progress_percent <= 100', name='ota_update_logs_progress_check')
    )
    op.create_index('idx_ota_logs_device_started', 'ota_update_logs', ['device_id', 'started_at'], postgresql_ops={'started_at': 'DESC'})
    op.create_index('idx_ota_logs_firmware_release', 'ota_update_logs', ['firmware_release_id'])
    op.create_index('idx_ota_logs_status', 'ota_update_logs', ['status'])


def downgrade() -> None:
    op.drop_index('idx_ota_logs_status', table_name='ota_update_logs')
    op.drop_index('idx_ota_logs_firmware_release', table_name='ota_update_logs')
    op.drop_index('idx_ota_logs_device_started', table_name='ota_update_logs')
    op.drop_table('ota_update_logs')
    
    op.drop_index('idx_firmware_releases_uploaded_at', table_name='firmware_releases')
    op.drop_index('idx_firmware_releases_version', table_name='firmware_releases')
    op.drop_table('firmware_releases')
