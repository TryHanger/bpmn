from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskInfo(BaseModel):
    id: str
    name: str


class MigrationAnalysisInstanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    flowable_process_instance_id: str
    name: str
    start_time: datetime
    current_activity_ids: list[str] = Field(default_factory=list)
    needs_state_change: bool


class MigrationAnalysisResponse(BaseModel):
    old_bpmn_xml: str
    new_bpmn_xml: str
    added_activity_ids: list[str] = Field(default_factory=list)
    removed_activity_ids: list[str] = Field(default_factory=list)
    old_schema_tasks: list[TaskInfo] = Field(default_factory=list)
    new_schema_tasks: list[TaskInfo] = Field(default_factory=list)
    instances: list[MigrationAnalysisInstanceRead] = Field(default_factory=list)


class MigrationAnalysisRequest(BaseModel):
    target_version_id: str
    instance_ids: list[str] = Field(default_factory=list)


class MigrationItemRequest(BaseModel):
    instance_id: str
    cancel_activity_ids: list[str] = Field(default_factory=list)
    start_activity_ids: list[str] = Field(default_factory=list)


class MigrationExecuteRequest(BaseModel):
    target_version_id: str
    migrations: list[MigrationItemRequest] = Field(default_factory=list)


class MigrationResultItem(BaseModel):
    instance_id: str
    status: str
    error: str | None = None


class MigrationExecuteResponse(BaseModel):
    migrated: int
    state_changed: int
    errors: int
    results: list[MigrationResultItem] = Field(default_factory=list)