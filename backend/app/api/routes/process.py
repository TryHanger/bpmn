from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.process import ProcessInstanceResponse, ProcessListResponse, ProcessStartRequest, ProcessStateResponse
from app.services.process_service import ProcessService

router = APIRouter()


@router.post("/start", response_model=ProcessInstanceResponse)
async def start_process(
    payload: ProcessStartRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ProcessInstanceResponse:
    return await ProcessService(db).start_process(payload, current_user)


@router.get("", response_model=ProcessListResponse)
async def list_processes(
    company_id: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ProcessListResponse:
    return await ProcessService(db).list_processes(current_user, company_id)


@router.get("/{process_instance_id}/state", response_model=ProcessStateResponse)
async def get_process_state(
    process_instance_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> ProcessStateResponse:
    return await ProcessService(db).get_process_state(process_instance_id)
