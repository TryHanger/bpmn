from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.company import EmployeeCreate, EmployeeResponse
from app.services.company_service import CompanyService

router = APIRouter()


@router.post("", response_model=EmployeeResponse)
async def create_employee(
    payload: EmployeeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> EmployeeResponse:
    return await CompanyService(db).create_employee(payload, current_user)


@router.get("", response_model=list[EmployeeResponse])
async def list_employees(
    company_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[EmployeeResponse]:
    return await CompanyService(db).list_employees(company_id, current_user)
