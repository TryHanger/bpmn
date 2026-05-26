from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.audit import AuditResponse
from app.services.process_service import ProcessService

router = APIRouter()


@router.get("/{process_instance_id}", response_model=AuditResponse)
async def get_process_audit(
    process_instance_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AuditResponse:
    return await ProcessService(db).get_process_audit(process_instance_id, current_user)