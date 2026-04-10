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
    # Usa IF NOT EXISTS para ser idempotente — a tabela pode já existir
    # se foi criada pelo init_db do SQLModel antes desta migração ser aplicada.
    op.execute("""
        CREATE TABLE IF NOT EXISTS andon_settings (
            id INTEGER DEFAULT 1 NOT NULL,
            working_day_start VARCHAR DEFAULT '08:00' NOT NULL,
            working_day_end VARCHAR DEFAULT '17:00' NOT NULL,
            working_days VARCHAR DEFAULT '["monday","tuesday","wednesday","thursday","friday"]' NOT NULL,
            PRIMARY KEY (id)
        )
    """)


def downgrade() -> None:
    op.drop_table('andon_settings')
