from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.company import RoleCreate, RoleResponse
from app.services.company_service import CompanyService

router = APIRouter()


@router.post("", response_model=RoleResponse)
async def create_role(
    payload: RoleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> RoleResponse:
    return await CompanyService(db).create_role(payload, current_user)


@router.get("", response_model=list[RoleResponse])
async def list_roles(
    company_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[RoleResponse]:
    return await CompanyService(db).list_roles(company_id, current_user)
