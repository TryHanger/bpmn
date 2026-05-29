from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TaskRemarkCreate(BaseModel):
    task_definition_key: str
    task_name: str | None = None
    remark: str
    variables: list[dict[str, object]] = Field(default_factory=list)


class TaskRemarkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    task_definition_key: str
    task_name: str | None = None
    remark: str
    author_id: UUID
    author_name: str | None = None
    created_at: datetime