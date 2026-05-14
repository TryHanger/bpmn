from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.user_types import TemplateStatus, TemplateVersionStatus


class TemplateVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    template_id: str
    deployment_id: str | None
    process_definition_id: str | None
    xml_template: str
    version: int
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
    created_at: datetime
    updated_at: datetime
    versions: list[TemplateVersionRead] = Field(default_factory=list)


class TemplateListResponse(BaseModel):
    items: list[TemplateRead]
    total: int


class DeployTemplateResponse(BaseModel):
    template: TemplateRead
    version: TemplateVersionRead
