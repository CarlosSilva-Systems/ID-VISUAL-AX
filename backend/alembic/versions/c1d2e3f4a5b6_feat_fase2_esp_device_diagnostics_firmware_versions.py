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
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Novos campos de diagnóstico em esp_devices ──────────────────────────
    # Usar IF NOT EXISTS via try/except para idempotência (tabela pode já ter colunas via init_db)
    conn = op.get_bind()

    def add_col_if_missing(table: str, col_name: str, col_def: str) -> None:
        result = conn.execute(sa.text(
            f"SELECT column_name FROM information_schema.columns "
            f"WHERE table_name='{table}' AND column_name='{col_name}'"
        ))
        if not result.fetchone():
            conn.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))

    add_col_if_missing('esp_devices', 'firmware_version', 'VARCHAR')
    add_col_if_missing('esp_devices', 'rssi', 'INTEGER')
    add_col_if_missing('esp_devices', 'is_root', 'BOOLEAN NOT NULL DEFAULT FALSE')
    add_col_if_missing('esp_devices', 'mesh_node_count', 'INTEGER')
    add_col_if_missing('esp_devices', 'ip_address', 'VARCHAR')
    add_col_if_missing('esp_devices', 'uptime_seconds', 'INTEGER')
    add_col_if_missing('esp_devices', 'notes', 'VARCHAR')

    # ── 2. Campo level em esp_device_logs ─────────────────────────────────────
    add_col_if_missing('esp_device_logs', 'level', "VARCHAR(10) NOT NULL DEFAULT 'INFO'")

    # ── 3. Tabela firmware_versions — criada pelo init_db, garantir índices ───
    # A tabela pode já existir via SQLModel.metadata.create_all no startup
    result = conn.execute(sa.text(
        "SELECT to_regclass('public.firmware_versions')"
    ))
    table_exists = result.scalar() is not None

    if not table_exists:
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

    # Garantir índices (idempotente)
    for idx_name, idx_cols in [
        ('idx_firmware_versions_version', 'version'),
        ('idx_firmware_versions_is_stable', 'is_stable'),
        ('idx_firmware_versions_created_at', 'created_at'),
    ]:
        result = conn.execute(sa.text(
            f"SELECT to_regclass('public.{idx_name}')"
        ))
        if result.scalar() is None:
            conn.execute(sa.text(
                f"CREATE INDEX {idx_name} ON firmware_versions ({idx_cols})"
            ))


def downgrade() -> None:
    conn = op.get_bind()

    def drop_col_if_exists(table: str, col_name: str) -> None:
        result = conn.execute(sa.text(
            f"SELECT column_name FROM information_schema.columns "
            f"WHERE table_name='{table}' AND column_name='{col_name}'"
        ))
        if result.fetchone():
            conn.execute(sa.text(f"ALTER TABLE {table} DROP COLUMN {col_name}"))

    for idx in ['idx_firmware_versions_created_at', 'idx_firmware_versions_is_stable', 'idx_firmware_versions_version']:
        conn.execute(sa.text(f"DROP INDEX IF EXISTS {idx}"))

    drop_col_if_exists('esp_device_logs', 'level')
    drop_col_if_exists('esp_devices', 'notes')
    drop_col_if_exists('esp_devices', 'uptime_seconds')
    drop_col_if_exists('esp_devices', 'ip_address')
    drop_col_if_exists('esp_devices', 'mesh_node_count')
    drop_col_if_exists('esp_devices', 'is_root')
    drop_col_if_exists('esp_devices', 'rssi')
    drop_col_if_exists('esp_devices', 'firmware_version')
