from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.template import DeployTemplateResponse, TemplateListResponse, TemplateRead
from app.services.template_service import TemplateService

router = APIRouter()


@router.post("/upload", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
async def upload_template(
    file: UploadFile = File(...),
    template_name: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db_session),
) -> TemplateRead:
    service = TemplateService(db)
    return await service.save_draft_from_upload(file=file, explicit_name=template_name)


@router.get("", response_model=TemplateListResponse)
async def list_templates(db: AsyncSession = Depends(get_db_session)) -> TemplateListResponse:
    service = TemplateService(db)
    return await service.list_templates()


@router.get("/{template_id}", response_model=TemplateRead)
async def get_template(template_id: str, db: AsyncSession = Depends(get_db_session)) -> TemplateRead:
    service = TemplateService(db)
    template = await service.get_template(template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return template


@router.post("/{template_id}/deploy", response_model=DeployTemplateResponse)
async def deploy_template(
    template_id: str,
    file: UploadFile | None = File(default=None),
    deployment_name: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db_session),
) -> DeployTemplateResponse:
    service = TemplateService(db)
    return await service.deploy_template(template_id=template_id, file=file, deployment_name=deployment_name)


@router.get("/{template_id}/versions")
async def list_template_versions(template_id: str, db: AsyncSession = Depends(get_db_session)) -> dict:
    service = TemplateService(db)
    return await service.list_template_versions(template_id)
