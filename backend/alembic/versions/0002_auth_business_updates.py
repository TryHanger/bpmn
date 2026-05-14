"""add auth and business columns

Revision ID: 0002_auth_business_updates
Revises: 0001_initial
Create Date: 2026-05-13
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_auth_business_updates"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return inspector.has_table(table_name)


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name)) if _has_table(inspector, table_name) else False


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "users"):
        op.create_table(
            "users",
            sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("hashed_password", sa.String(length=255), nullable=False),
            sa.Column("role", sa.String(length=50), nullable=False, server_default=sa.text("'employee'")),
            sa.Column("employee_id", sa.String(length=36), nullable=True),
            sa.Column("company_id", sa.String(length=36), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("email"),
        )
        op.create_index("ix_users_email", "users", ["email"])

    if not _has_table(inspector, "refresh_tokens"):
        op.create_table(
            "refresh_tokens",
            sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("token_hash"),
        )
        op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
        op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])

    if not _has_column(inspector, "companies", "admin_user_id"):
        op.add_column("companies", sa.Column("admin_user_id", sa.String(length=36), nullable=True))

    if not _has_column(inspector, "roles", "flowable_group"):
        op.add_column(
            "roles",
            sa.Column("flowable_group", sa.String(length=255), nullable=False, server_default=sa.text("''")),
        )

    if not _has_column(inspector, "process_instances", "name"):
        op.add_column("process_instances", sa.Column("name", sa.String(length=255), nullable=True))

    if not _has_column(inspector, "process_instances", "company_id"):
        op.add_column("process_instances", sa.Column("company_id", sa.String(length=36), nullable=True))
        op.create_foreign_key(
            "fk_process_instances_company_id_companies",
            "process_instances",
            "companies",
            ["company_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        op.create_index("ix_process_instances_company_id", "process_instances", ["company_id"])

    if not _has_column(inspector, "process_instances", "xml_template"):
        op.add_column("process_instances", sa.Column("xml_template", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_index("ix_process_instances_company_id", table_name="process_instances")
    op.drop_constraint("fk_process_instances_company_id_companies", "process_instances", type_="foreignkey")
    op.drop_column("process_instances", "xml_template")
    op.drop_column("process_instances", "company_id")
    op.drop_column("process_instances", "name")
    op.drop_column("roles", "flowable_group")
    op.drop_column("companies", "admin_user_id")

    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
