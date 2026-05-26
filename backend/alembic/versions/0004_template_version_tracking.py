"""add template version tracking to process instances

Revision ID: 0004_template_version_tracking
Revises: 0003_process_schemas
Create Date: 2026-05-25
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_template_version_tracking"
down_revision = "0003_process_schemas"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return inspector.has_table(table_name)


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name)) if _has_table(inspector, table_name) else False


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_column(inspector, "process_instances", "template_version_id"):
        op.add_column("process_instances", sa.Column("template_version_id", sa.String(length=36), nullable=True))
        op.create_foreign_key(
            "fk_process_instances_template_version_id_template_versions",
            "process_instances",
            "template_versions",
            ["template_version_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index("ix_process_instances_template_version_id", "process_instances", ["template_version_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_column(inspector, "process_instances", "template_version_id"):
        op.drop_index("ix_process_instances_template_version_id", table_name="process_instances")
        op.drop_constraint("fk_process_instances_template_version_id_template_versions", "process_instances", type_="foreignkey")
        op.drop_column("process_instances", "template_version_id")