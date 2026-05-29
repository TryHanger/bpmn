"""add rejected process status

Revision ID: 0007_process_instance_rejected_cancelled_statuses
Revises: 0006_process_instance_terminated_status
Create Date: 2026-05-29
"""

from alembic import op


revision = "0007_process_instance_rejected_cancelled_statuses"
down_revision = "0006_process_instance_terminated_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE process_instance_status ADD VALUE IF NOT EXISTS 'REJECTED'")


def downgrade() -> None:
    pass