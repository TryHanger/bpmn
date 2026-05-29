"""add terminated status for process instances

Revision ID: 0006_process_instance_terminated_status
Revises: 0005_task_remarks
Create Date: 2026-05-29
"""

from alembic import op


revision = "0006_process_instance_terminated_status"
down_revision = "0005_task_remarks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE process_instance_status ADD VALUE IF NOT EXISTS 'TERMINATED'")


def downgrade() -> None:
    pass