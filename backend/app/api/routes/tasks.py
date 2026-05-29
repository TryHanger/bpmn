from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.process import TaskBoardResponse, TaskCompleteRequest, TaskContextResponse
from app.schemas.task_remark import TaskRemarkCreate, TaskRemarkRead
from app.services.flowable import FlowableClient
from app.services.task_service import TaskService

router = APIRouter()


def _flowable_client() -> FlowableClient:
    settings = get_settings()
    return FlowableClient(
        base_url=settings.flowable_base_url,
        username=settings.flowable_username,
        password=settings.flowable_password,
    )


@router.get("/my", response_model=TaskBoardResponse)
async def list_my_tasks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> TaskBoardResponse:
    return await TaskService(db, _flowable_client()).list_my_tasks(current_user)


@router.post("/{task_id}/claim")
async def claim_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    return await TaskService(db, _flowable_client()).claim_task(task_id, current_user)


@router.post("/{task_id}/complete")
async def complete_task(
    task_id: str,
    payload: TaskCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    return await TaskService(db, _flowable_client()).complete_task(task_id, payload, current_user)


@router.post("/{task_id}/reject")
async def reject_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    return await TaskService(db, _flowable_client()).reject_and_terminate_process(task_id, current_user)


@router.post("/{task_id}/complete-with-remark")
async def complete_task_with_remark(
    task_id: str,
    payload: TaskRemarkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    return await TaskService(db, _flowable_client()).complete_with_remark(task_id, payload, current_user)


@router.get("/{process_instance_id}/remarks", response_model=list[TaskRemarkRead])
async def get_process_remarks(
    process_instance_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[TaskRemarkRead]:
    return await TaskService(db, _flowable_client()).get_remarks_by_process(process_instance_id)


@router.get("/{task_id}/context", response_model=TaskContextResponse)
async def get_task_context(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> TaskContextResponse:
    return await TaskService(db, _flowable_client()).get_task_context(task_id, current_user)
