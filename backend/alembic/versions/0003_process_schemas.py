"""add process schemas

Revision ID: 0003_process_schemas
Revises: 0002_auth_business_updates
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_process_schemas"
down_revision = "0002_auth_business_updates"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return inspector.has_table(table_name)


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name)) if _has_table(inspector, table_name) else False


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "process_schemas"):
        op.create_table(
            "process_schemas",
            sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.String(length=1024), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    if not _has_table(inspector, "process_schema_roles"):
        op.create_table(
            "process_schema_roles",
            sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
            sa.Column("schema_id", sa.String(length=36), nullable=False),
            sa.Column("role_name", sa.String(length=255), nullable=False),
            sa.Column("display_name", sa.String(length=255), nullable=False),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.ForeignKeyConstraint(["schema_id"], ["process_schemas.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_process_schema_roles_schema_id", "process_schema_roles", ["schema_id"])

    if not _has_table(inspector, "process_schema_variables"):
        op.create_table(
            "process_schema_variables",
            sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
            sa.Column("schema_id", sa.String(length=36), nullable=False),
            sa.Column("role_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("label", sa.String(length=255), nullable=False),
            sa.Column("type", sa.String(length=50), nullable=False),
            sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("readable_by_roles", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.ForeignKeyConstraint(["schema_id"], ["process_schemas.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["role_id"], ["process_schema_roles.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_process_schema_variables_schema_id", "process_schema_variables", ["schema_id"])
        op.create_index("ix_process_schema_variables_role_id", "process_schema_variables", ["role_id"])

    if not _has_column(inspector, "templates", "schema_id"):
        op.add_column("templates", sa.Column("schema_id", sa.String(length=36), nullable=True))
        op.create_foreign_key(
            "fk_templates_schema_id_process_schemas",
            "templates",
            "process_schemas",
            ["schema_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_column(inspector, "templates", "schema_id"):
        op.drop_constraint("fk_templates_schema_id_process_schemas", "templates", type_="foreignkey")
        op.drop_column("templates", "schema_id")

    if _has_table(inspector, "process_schema_variables"):
        op.drop_index("ix_process_schema_variables_role_id", table_name="process_schema_variables")
        op.drop_index("ix_process_schema_variables_schema_id", table_name="process_schema_variables")
        op.drop_table("process_schema_variables")

    if _has_table(inspector, "process_schema_roles"):
        op.drop_index("ix_process_schema_roles_schema_id", table_name="process_schema_roles")
        op.drop_table("process_schema_roles")

    if _has_table(inspector, "process_schemas"):
        op.drop_table("process_schemas")
