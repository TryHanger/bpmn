from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserCreateRequest(BaseModel):
    phone: str


class LoginRequest(BaseModel):
    phone: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role: str
    employee_id: UUID | None
    company_id: UUID | None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse | None = None
