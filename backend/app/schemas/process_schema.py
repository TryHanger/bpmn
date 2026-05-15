from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProcessSchemaVariableRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    label: str
    type: str
    required: bool
    readable_by_roles: list[str]
    order_index: int
    role_id: UUID


class ProcessSchemaRoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role_name: str
    display_name: str
    order_index: int
    variables: list[ProcessSchemaVariableRead] = Field(default_factory=list)


class ProcessSchemaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    created_at: datetime
    roles: list[ProcessSchemaRoleRead] = Field(default_factory=list)


class ProcessSchemaCreate(BaseModel):
    name: str
    description: str | None = None


class ProcessSchemaRoleCreate(BaseModel):
    role_name: str
    display_name: str
    order_index: int = 0


class ProcessSchemaVariableCreate(BaseModel):
    role_id: UUID
    name: str
    label: str
    type: str
    required: bool = True
    readable_by_roles: list[str] = Field(default_factory=list)
    order_index: int = 0


class ProcessSchemaVariableUpdate(BaseModel):
    label: str | None = None
    type: str | None = None
    required: bool | None = None
    readable_by_roles: list[str] | None = None
    order_index: int | None = None


class TemplateSchemaUpdate(BaseModel):
    schema_id: UUID | None = None