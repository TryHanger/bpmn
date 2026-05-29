from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.user_types import TemplateStatus, TemplateVersionStatus


class TemplateVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    template_id: str
    version: int
    deployment_id: str | None
    process_definition_id: str | None
    xml_template: str
    flowable_version: int | None
    status: TemplateVersionStatus
    created_at: datetime


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    process_definition_key: str
    status: TemplateStatus
    current_version_id: str | None
    schema_id: str | None
    created_at: datetime
    updated_at: datetime
    versions: list[TemplateVersionRead] = Field(default_factory=list)


class TemplateListResponse(BaseModel):
    items: list[TemplateRead]
    total: int


class DeployTemplateResponse(BaseModel):
    template: TemplateRead
    version: TemplateVersionRead


class ActiveProcessInstance(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    flowable_process_instance_id: str
    business_key: str
    status: str
    start_time: datetime
    current_activities: list[str] = Field(default_factory=list)


class ActiveInstancesResponse(BaseModel):
    items: list[ActiveProcessInstance]
    total: int


class DeployWithMigrationRequest(BaseModel):
    deployment_name: str | None = None
    instance_ids: list[str] | None = None


class ProcessMigrationResult(BaseModel):
    process_instance_id: str
    status: Literal["migrated", "migrated_with_state_change", "error", "skipped"]
    current_task_key: str | None = None
    new_task_key: str | None = None
    error: str | None = None


class DeployWithMigrationResponse(BaseModel):
    template: TemplateRead
    version: TemplateVersionRead
    total_processes: int
    migrated: int
    state_changed: int
    errors: int
    results: list[ProcessMigrationResult] = Field(default_factory=list)


class TemplateVersionListResponse(BaseModel):
    items: list[TemplateVersionRead]
