"""add task remarks

Revision ID: 0005_task_remarks
Revises: 0004_template_version_tracking
Create Date: 2026-05-28
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_task_remarks"
down_revision = "0004_template_version_tracking"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return inspector.has_table(table_name)


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name)) if _has_table(inspector, table_name) else False


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "task_remarks"):
        op.create_table(
            "task_remarks",
            sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
            sa.Column("process_instance_id", sa.String(length=255), nullable=False),
            sa.Column("task_definition_key", sa.String(length=255), nullable=False),
            sa.Column("task_id", sa.String(length=255), nullable=False),
            sa.Column("task_name", sa.String(length=255), nullable=True),
            sa.Column("remark", sa.Text(), nullable=False),
            sa.Column("author_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    if not _has_column(inspector, "task_remarks", "process_instance_id"):
        op.create_index("ix_task_remarks_process_instance_id", "task_remarks", ["process_instance_id"])
    if not _has_column(inspector, "task_remarks", "task_definition_key"):
        op.create_index("ix_task_remarks_task_definition_key", "task_remarks", ["task_definition_key"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "task_remarks"):
        op.drop_index("ix_task_remarks_task_definition_key", table_name="task_remarks")
        op.drop_index("ix_task_remarks_process_instance_id", table_name="task_remarks")
        op.drop_table("task_remarks")