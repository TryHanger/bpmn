from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db_session
from app.schemas.process_schema import TemplateSchemaUpdate
from app.schemas.template import (
    ActiveInstancesResponse,
    DeployTemplateResponse,
    DeployWithMigrationRequest,
    DeployWithMigrationResponse,
    TemplateListResponse,
    TemplateRead,
    TemplateVersionListResponse,
)
from app.services.flowable import FlowableClient
from app.services.migration_service import MigrationService
from app.services.template_service import TemplateService
from app.services.schema_service import SchemaService

router = APIRouter()


def _flowable_client() -> FlowableClient:
    settings = get_settings()
    return FlowableClient(
        base_url=settings.flowable_base_url,
        username=settings.flowable_username,
        password=settings.flowable_password,
    )


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


@router.get("/{template_id}/active-instances", response_model=ActiveInstancesResponse)
async def get_active_instances(
    template_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> ActiveInstancesResponse:
    service = MigrationService(db, _flowable_client())
    return await service.get_active_instances(template_id)


@router.post("/{template_id}/deploy-with-migration", response_model=DeployWithMigrationResponse)
async def deploy_with_migration(
    template_id: str,
    payload: DeployWithMigrationRequest,
    db: AsyncSession = Depends(get_db_session),
) -> DeployWithMigrationResponse:
    service = TemplateService(db)
    return await service.deploy_with_migration(
        template_id=template_id,
        deployment_name=payload.deployment_name,
        instance_ids=payload.instance_ids,
    )


@router.get("/{template_id}/versions")
async def list_template_versions(template_id: str, db: AsyncSession = Depends(get_db_session)) -> TemplateVersionListResponse:
    service = TemplateService(db)
    return await service.list_template_versions(template_id)


@router.delete("/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template_version(version_id: str, db: AsyncSession = Depends(get_db_session)) -> None:
    service = TemplateService(db)
    await service.delete_template_version(version_id)


@router.patch("/{template_id}/schema", response_model=TemplateRead)
async def link_schema_to_template(
    template_id: str,
    payload: TemplateSchemaUpdate,
    db: AsyncSession = Depends(get_db_session),
) -> TemplateRead:
    return await SchemaService(db).link_schema_to_template(template_id, payload.schema_id)
