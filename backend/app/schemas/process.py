from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.user_types import ProcessInstanceStatus
from app.schemas.process_schema import ProcessSchemaRead


class ProcessVariableInput(BaseModel):
    name: str
    value: int | str | bool
    type: Literal["string", "integer", "boolean"]


class ProcessStartRequest(BaseModel):
    process_definition_key: str
    name: str
    company_id: UUID
    variables: list[ProcessVariableInput] = Field(default_factory=list)


class ProcessInstanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    company_id: UUID
    flowable_process_instance_id: str
    process_definition_key: str
    process_definition_id: str
    business_key: str
    status: str
    started_by: UUID
    xml_template: str | None
    start_time: datetime
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    current_activities: list[str] = Field(default_factory=list)


class ProcessListResponse(BaseModel):
    items: list[ProcessInstanceResponse]
    total: int


class TaskRead(BaseModel):
    id: str
    assignee: str | None = None
    name: str | None = None
    createTime: str | None = None
    taskDefinitionKey: str | None = None
    processInstanceId: str | None = None
    processDefinitionId: str | None = None
    processName: str | None = None
    claimed: bool | None = None


class TaskBoardResponse(BaseModel):
    available: list[TaskRead]
    claimed: list[TaskRead]


class TaskCompleteRequest(BaseModel):
    outcome: Literal["approved", "rejected"]
    variables: list[ProcessVariableInput] = Field(default_factory=list)


class ActivityStatus(BaseModel):
    activityId: str
    name: str | None = None
    status: Literal["pending", "active", "completed", "rejected", "skipped", "interrupted"]
    assignee: str | None = None
    bpmn_assignee: str | None = None
    startTime: datetime | None = None
    endTime: datetime | None = None
    deleteReason: str | None = None


class ProcessStateResponse(BaseModel):
    process_instance_id: str
    flowable_instance_id: str
    activities: list[ActivityStatus]


class TaskContextResponse(BaseModel):
    task: TaskRead
    schema: ProcessSchemaRead | None = None
    variables: dict[str, object | None] = Field(default_factory=dict)
