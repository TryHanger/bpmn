from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CompanyCreate(BaseModel):
    name: str


class CompanyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str


class RoleCreate(BaseModel):
    name: str
    company_id: UUID
    flowable_group: str


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    company_id: UUID
    flowable_group: str
    created_at: datetime
    updated_at: datetime


class EmployeeCreate(BaseModel):
    name: str
    phone: str
    company_id: UUID
    role_id: UUID


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    phone: str
    company_id: UUID
    role_id: UUID
    role_name: str
    flowable_group: str
    user_id: UUID | None = None
    temp_password: str | None = None
    created_at: datetime
    updated_at: datetime
