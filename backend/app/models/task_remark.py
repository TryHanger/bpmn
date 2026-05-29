from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class TaskRemark(Base):
    __tablename__ = "task_remarks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    process_instance_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    task_definition_key: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    task_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    task_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    remark: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    author = relationship("User", lazy="joined")