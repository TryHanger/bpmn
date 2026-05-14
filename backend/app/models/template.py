from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.user_types import TemplateStatus


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    process_definition_key: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    status: Mapped[TemplateStatus] = mapped_column(
        Enum(TemplateStatus, name="template_status"),
        nullable=False,
        default=TemplateStatus.DRAFT,
    )
    current_version_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("template_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    versions = relationship(
        "TemplateVersion",
        foreign_keys="TemplateVersion.template_id",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="TemplateVersion.version",
        overlaps="current_version",
    )
    current_version = relationship(
        "TemplateVersion",
        foreign_keys=[current_version_id],
        uselist=False,
        post_update=True,
        overlaps="versions,template",
    )
