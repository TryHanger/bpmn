from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.user_types import ProcessInstanceStatus


class ProcessInstance(Base):
    __tablename__ = "process_instances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="RESTRICT"), index=True, nullable=False)
    flowable_process_instance_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    template_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("templates.id", ondelete="SET NULL"), index=True, nullable=True)
    process_definition_key: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    process_definition_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    business_key: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    xml_template: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[ProcessInstanceStatus] = mapped_column(
        Enum(ProcessInstanceStatus, name="process_instance_status"),
        nullable=False,
        default=ProcessInstanceStatus.STARTED,
    )
    initiator_user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    template = relationship("Template")
