from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ProcessSchema(Base):
    __tablename__ = "process_schemas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    roles = relationship(
        "ProcessSchemaRole",
        back_populates="schema",
        order_by="ProcessSchemaRole.order_index",
        cascade="all, delete-orphan",
    )
    templates = relationship("Template", back_populates="schema")


class ProcessSchemaRole(Base):
    __tablename__ = "process_schema_roles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    schema_id: Mapped[str] = mapped_column(String(36), ForeignKey("process_schemas.id", ondelete="CASCADE"), nullable=False, index=True)
    role_name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    schema = relationship("ProcessSchema", back_populates="roles")
    variables = relationship(
        "ProcessSchemaVariable",
        back_populates="role",
        order_by="ProcessSchemaVariable.order_index",
        cascade="all, delete-orphan",
    )


class ProcessSchemaVariable(Base):
    __tablename__ = "process_schema_variables"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    schema_id: Mapped[str] = mapped_column(String(36), ForeignKey("process_schemas.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id: Mapped[str] = mapped_column(String(36), ForeignKey("process_schema_roles.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    readable_by_roles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    role = relationship("ProcessSchemaRole", back_populates="variables")