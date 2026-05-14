"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-10
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    template_status = sa.Enum("DRAFT", "DEPLOYED", "ARCHIVED", name="template_status")
    template_version_status = sa.Enum("DRAFT", "DEPLOYED", "ARCHIVED", name="template_version_status")
    template_status.create(op.get_bind(), checkfirst=True)
    template_version_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "templates",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("process_definition_key", sa.String(length=255), nullable=False),
        sa.Column("status", template_status, nullable=False),
        sa.Column("current_version_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("process_definition_key"),
    )

    op.create_table(
        "template_versions",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("template_id", sa.String(length=36), nullable=False),
        sa.Column("deployment_id", sa.String(length=255), nullable=True),
        sa.Column("process_definition_id", sa.String(length=255), nullable=True),
        sa.Column("xml_template", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("flowable_version", sa.Integer(), nullable=True),
        sa.Column("status", template_version_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["templates.id"], ondelete="CASCADE"),
    )

    op.create_index("ix_templates_name", "templates", ["name"])
    op.create_index("ix_templates_process_definition_key", "templates", ["process_definition_key"])
    op.create_index("ix_template_versions_template_id", "template_versions", ["template_id"])
    op.create_index("ix_template_versions_deployment_id", "template_versions", ["deployment_id"])
    op.create_index("ix_template_versions_process_definition_id", "template_versions", ["process_definition_id"])


def downgrade() -> None:
    op.drop_index("ix_template_versions_process_definition_id", table_name="template_versions")
    op.drop_index("ix_template_versions_deployment_id", table_name="template_versions")
    op.drop_index("ix_template_versions_template_id", table_name="template_versions")
    op.drop_index("ix_templates_process_definition_key", table_name="templates")
    op.drop_index("ix_templates_name", table_name="templates")
    op.drop_table("template_versions")
    op.drop_table("templates")

    sa.Enum(name="template_version_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="template_status").drop(op.get_bind(), checkfirst=True)
