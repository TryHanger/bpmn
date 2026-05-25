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
    activityName: str | None = None
    activityType: str
    status: Literal["pending", "active", "completed", "rejected", "skipped", "interrupted"]
    assignee: str | None = None
    startTime: datetime | None = None
    endTime: datetime | None = None
    durationInMillis: int | None = None
    calledProcessInstanceId: str | None = None


class ProcessVariable(BaseModel):
    name: str
    type: str
    value: object


class ChildInstance(BaseModel):
    activityId: str
    processInstanceId: str
    status: Literal["running", "completed", "terminated"]
    processDefinitionName: str | None = None
    startTime: datetime | None = None
    endTime: datetime | None = None


class ProcessStateResponse(BaseModel):
    process_instance_id: str
    status: Literal["running", "completed", "terminated"]
    activities: list[ActivityStatus]
    variables: list[ProcessVariable] = Field(default_factory=list)
    child_instances: list[ChildInstance] = Field(default_factory=list)


class TaskContextResponse(BaseModel):
    task: TaskRead
    schema: ProcessSchemaRead | None = None
    variables: dict[str, object | None] = Field(default_factory=dict)
