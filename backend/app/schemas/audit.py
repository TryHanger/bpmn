from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.task_remark import TaskRemarkRead


class AuditTaskRead(BaseModel):
    activityId: str
    name: str | None = None
    assignee: str | None = None
    startTime: datetime | None = None
    endTime: datetime | None = None
    durationInMillis: int | None = None
    status: Literal["active", "completed"]
    remarks: list[TaskRemarkRead] = Field(default_factory=list)


class AuditResponse(BaseModel):
    bpmnXml: str
    activeActivityIds: list[str] = Field(default_factory=list)
    completedActivityIds: list[str] = Field(default_factory=list)
    tasks: list[AuditTaskRead] = Field(default_factory=list)
    activityCounts: dict[str, int] = Field(default_factory=dict)