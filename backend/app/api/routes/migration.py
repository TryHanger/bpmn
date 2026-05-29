from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.migration import MigrationAnalysisRequest, MigrationAnalysisResponse, MigrationExecuteRequest, MigrationExecuteResponse
from app.services.flowable import FlowableClient
from app.services.migration_service import MigrationService
from app.core.config import get_settings

router = APIRouter()


def _flowable_client() -> FlowableClient:
    settings = get_settings()
    return FlowableClient(
        base_url=settings.flowable_base_url,
        username=settings.flowable_username,
        password=settings.flowable_password,
    )


@router.post("/{template_id}/migration-analysis", response_model=MigrationAnalysisResponse)
async def migration_analysis(
    template_id: str,
    payload: MigrationAnalysisRequest,
    db: AsyncSession = Depends(get_db_session),
) -> MigrationAnalysisResponse:
    service = MigrationService(db, _flowable_client())
    return await service.analyze_migration(
        template_id=template_id,
        target_version_id=payload.target_version_id,
        instance_ids=payload.instance_ids,
    )


@router.post("/{template_id}/migrate", response_model=MigrationExecuteResponse)
async def execute_migration(
    template_id: str,
    payload: MigrationExecuteRequest,
    db: AsyncSession = Depends(get_db_session),
) -> MigrationExecuteResponse:
    service = MigrationService(db, _flowable_client())
    return await service.execute_migration(template_id=template_id, payload=payload)