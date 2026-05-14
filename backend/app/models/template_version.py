from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.user_types import TemplateVersionStatus


class TemplateVersion(Base):
    __tablename__ = "template_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    template_id: Mapped[str] = mapped_column(String(36), ForeignKey("templates.id", ondelete="CASCADE"), index=True, nullable=False)
    deployment_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    process_definition_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    xml_template: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    flowable_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[TemplateVersionStatus] = mapped_column(
        Enum(TemplateVersionStatus, name="template_version_status"),
        nullable=False,
        default=TemplateVersionStatus.DRAFT,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    template = relationship("Template", back_populates="versions", foreign_keys=[template_id])
