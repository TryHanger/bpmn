from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.template import Template
from app.models.process_instance import ProcessInstance
from app.models.template_version import TemplateVersion
from app.models.user_types import ProcessInstanceStatus, TemplateStatus, TemplateVersionStatus
from app.schemas.template import (
    DeployTemplateResponse,
    DeployWithMigrationResponse,
    ProcessMigrationResult,
    TemplateListResponse,
    TemplateRead,
    TemplateVersionListResponse,
    TemplateVersionRead,
)
from app.services.migration_service import MigrationService
from app.services.flowable import FlowableClient


@dataclass(slots=True)
class ParsedXmlTemplate:
    process_definition_key: str
    template_name: str
    xml_text: str


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def parse_bpmn_xml(xml_text: str, fallback_name: str | None = None) -> ParsedXmlTemplate:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid XML: {exc}") from exc

    process_element = None
    for element in root.iter():
        if _local_name(element.tag) == "process":
            process_element = element
            break

    if process_element is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="BPMN process element was not found")

    process_definition_key = process_element.attrib.get("id")
    if not process_definition_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Process id is required as processDefinitionKey")

    template_name = process_element.attrib.get("name") or fallback_name or Path(fallback_name or "template.xml").stem
    return ParsedXmlTemplate(
        process_definition_key=process_definition_key,
        template_name=template_name,
        xml_text=xml_text,
    )


class TemplateService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.settings = get_settings()

    async def list_templates(self) -> TemplateListResponse:
        result = await self.session.execute(
            select(Template).options(selectinload(Template.versions)).order_by(Template.created_at.desc())
        )
        templates = result.scalars().unique().all()
        return TemplateListResponse(items=[TemplateRead.model_validate(template) for template in templates], total=len(templates))

    async def get_template(self, template_id: str) -> TemplateRead | None:
        template = await self._get_template_with_versions(template_id, raise_404=False)
        if template is None:
            return None
        return TemplateRead.model_validate(template)

    async def list_template_versions(self, template_id: str) -> TemplateVersionListResponse:
        template = await self._get_template_with_versions(template_id)
        return TemplateVersionListResponse(items=[TemplateVersionRead.model_validate(version) for version in template.versions])

    async def delete_template_version(self, version_id: str) -> None:
        result = await self.session.execute(
            select(TemplateVersion)
            .options(selectinload(TemplateVersion.template))
            .where(TemplateVersion.id == version_id)
        )
        version = result.scalar_one_or_none()
        if version is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template version not found")

        if version.status == TemplateVersionStatus.DEPLOYED:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete deployed version")

        template = version.template
        assert template is not None

        if template.current_version_id == version.id:
            fallback_result = await self.session.execute(
                select(TemplateVersion)
                .where(TemplateVersion.template_id == template.id)
                .where(TemplateVersion.status == TemplateVersionStatus.DEPLOYED)
                .order_by(TemplateVersion.created_at.desc(), TemplateVersion.version.desc())
                .limit(1)
            )
            fallback_version = fallback_result.scalar_one_or_none()
            if fallback_version is None:
                template.current_version_id = None
                template.status = TemplateStatus.DRAFT
            else:
                template.current_version_id = fallback_version.id
                template.status = TemplateStatus.DEPLOYED

        await self.session.delete(version)
        await self.session.commit()

    async def save_draft_from_upload(self, *, file: UploadFile, explicit_name: str | None = None) -> TemplateRead:
        xml_bytes = await file.read()
        if not xml_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="XML file is empty")

        xml_text = xml_bytes.decode("utf-8")
        parsed = parse_bpmn_xml(xml_text, fallback_name=file.filename)
        template_name = explicit_name or parsed.template_name
        template = await self._get_or_create_template(parsed.process_definition_key, template_name)

        draft_versions = await self._get_draft_versions_for_template(template.id)
        has_deployed = await self._has_deployed_version(template.id)

        if draft_versions:
            current_draft = draft_versions[0]
            current_draft.xml_template = xml_text
            current_draft.status = TemplateVersionStatus.DRAFT
            template.current_version_id = current_draft.id
            template.status = TemplateStatus.DRAFT
            for extra_draft in draft_versions[1:]:
                extra_draft.status = TemplateVersionStatus.ARCHIVED
        elif has_deployed:
            await self._create_version(template, xml_text, status_value=TemplateVersionStatus.DRAFT)
        else:
            await self._create_version(template, xml_text, status_value=TemplateVersionStatus.DRAFT)

        await self.session.commit()
        template = await self._get_template_with_versions(template.id)
        return TemplateRead.model_validate(template)

    async def deploy_template(
        self,
        *,
        template_id: str,
        file: UploadFile | None,
        deployment_name: str | None,
    ) -> DeployTemplateResponse:
        template = await self._get_template_or_404(template_id)

        if file is not None:
            xml_bytes = await file.read()
            if not xml_bytes:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="XML file is empty")
            xml_text = xml_bytes.decode("utf-8")
            parsed = parse_bpmn_xml(xml_text, fallback_name=file.filename)
            if parsed.process_definition_key != template.process_definition_key:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Uploaded XML processDefinitionKey does not match template processDefinitionKey",
                )
            # Update or create DRAFT version from upload
            draft_versions = await self._get_draft_versions_for_template(template_id)
            if draft_versions:
                version_to_deploy = draft_versions[0]
                version_to_deploy.xml_template = xml_text
                version_to_deploy.status = TemplateVersionStatus.DRAFT
                for extra_draft in draft_versions[1:]:
                    extra_draft.status = TemplateVersionStatus.ARCHIVED
            else:
                version_to_deploy = await self._create_version(template, xml_text, status_value=TemplateVersionStatus.DRAFT)
            await self.session.commit()
            await self.session.refresh(version_to_deploy)
        else:
            # Deploy requires a DRAFT version
            version_to_deploy = await self._get_draft_version_for_template(template_id)
            if not version_to_deploy:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No DRAFT version found to deploy. Please upload or create a DRAFT version first.",
                )

        if deployment_name is None:
            deployment_name = template.name
        elif template.name != deployment_name:
            await self._assert_template_name_available(deployment_name, exclude_template_id=template.id)

        flowable = FlowableClient(
            base_url=self.settings.flowable_base_url,
            username=self.settings.flowable_username,
            password=self.settings.flowable_password,
        )
        deployment_result = await flowable.deploy_process(
            xml_bytes=version_to_deploy.xml_template.encode("utf-8"),
            file_name=f"{template.name}.bpmn20.xml",
            deployment_name=deployment_name,
        )

        version_to_deploy.deployment_id = deployment_result.deployment_id
        version_to_deploy.process_definition_id = deployment_result.process_definition["id"]
        version_to_deploy.flowable_version = deployment_result.process_definition.get("version")
        version_to_deploy.status = TemplateVersionStatus.DEPLOYED
        template.status = TemplateStatus.DEPLOYED
        template.current_version_id = version_to_deploy.id

        if template.name != deployment_name:
            template.name = deployment_name

        await self.session.commit()
        template = await self._get_template_with_versions(template.id)
        await self.session.refresh(version_to_deploy)

        return DeployTemplateResponse(
            template=TemplateRead.model_validate(template),
            version=TemplateVersionRead.model_validate(version_to_deploy),
        )

    async def deploy_with_migration(
        self,
        *,
        template_id: str,
        deployment_name: str | None,
    ) -> DeployWithMigrationResponse:
        template = await self._get_template_or_404(template_id)
        template_pk = template.id

        old_version_result = await self.session.execute(
            select(TemplateVersion)
            .where(TemplateVersion.template_id == template_id)
            .where(TemplateVersion.status == TemplateVersionStatus.DEPLOYED)
            .order_by(TemplateVersion.created_at.desc())
            .limit(1)
        )
        old_version = old_version_result.scalar_one_or_none()
        old_process_definition_id = old_version.process_definition_id if old_version else None
        old_bpmn_xml = old_version.xml_template if old_version else None

        deploy_result = await self.deploy_template(template_id=template_id, file=None, deployment_name=deployment_name)
        new_version = deploy_result.version
        new_process_definition_id = new_version.process_definition_id

        if old_process_definition_id is None or old_bpmn_xml is None:
            return DeployWithMigrationResponse(
                template=deploy_result.template,
                version=new_version,
                total_processes=0,
                migrated=0,
                state_changed=0,
                errors=0,
                results=[],
            )

        if not new_process_definition_id:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="New process definition id was not returned by Flowable")

        migration_service = MigrationService(
            db=self.session,
            flowable=FlowableClient(
                base_url=self.settings.flowable_base_url,
                username=self.settings.flowable_username,
                password=self.settings.flowable_password,
            ),
        )

        active_instances_result = await self.session.execute(
            select(ProcessInstance)
            .where(ProcessInstance.process_definition_id == old_process_definition_id)
            .where(ProcessInstance.status == ProcessInstanceStatus.STARTED)
        )
        active_instances = list(active_instances_result.scalars().all())

        results: list[ProcessMigrationResult] = []
        for instance in active_instances:
            migration_result = await migration_service.migrate_process(
                process_instance_id=instance.flowable_process_instance_id,
                old_bpmn_xml=old_bpmn_xml,
                new_process_definition_id=new_process_definition_id,
                new_bpmn_xml=new_version.xml_template,
            )
            results.append(migration_result)

            if migration_result.status in {"migrated", "migrated_with_state_change"}:
                instance.template_id = template_pk
                instance.process_definition_id = new_process_definition_id
                self.session.add(instance)

        await self.session.commit()

        migrated = sum(1 for item in results if item.status == "migrated")
        state_changed = sum(1 for item in results if item.status == "migrated_with_state_change")
        errors = sum(1 for item in results if item.status == "error")

        return DeployWithMigrationResponse(
            template=deploy_result.template,
            version=new_version,
            total_processes=len(active_instances),
            migrated=migrated,
            state_changed=state_changed,
            errors=errors,
            results=results,
        )

    async def _get_template_or_404(self, template_id: str, *, raise_404: bool = True) -> Template | None:
        result = await self.session.execute(select(Template).where(Template.id == template_id))
        template = result.scalar_one_or_none()
        if template is None and raise_404:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        return template

    async def _get_or_create_template(self, process_definition_key: str, template_name: str) -> Template:
        existing_by_key = await self.session.execute(
            select(Template).where(Template.process_definition_key == process_definition_key)
        )
        template = existing_by_key.scalar_one_or_none()
        if template is not None:
            await self._assert_template_name_available(template_name, exclude_template_id=template.id)
            if template.name != template_name:
                template.name = template_name
            return template

        existing_by_name = await self.session.execute(select(Template).where(Template.name == template_name))
        if existing_by_name.scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Template name must be unique")

        template = Template(name=template_name, process_definition_key=process_definition_key, status=TemplateStatus.DRAFT)
        self.session.add(template)
        await self.session.flush()
        return template

    async def _assert_template_name_available(self, template_name: str, *, exclude_template_id: str | None = None) -> None:
        statement = select(Template).where(Template.name == template_name)
        if exclude_template_id is not None:
            statement = statement.where(Template.id != exclude_template_id)

        result = await self.session.execute(statement)
        if result.scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Template name must be unique")

    async def _create_version(self, template: Template, xml_text: str, *, status_value: TemplateVersionStatus) -> TemplateVersion:
        result = await self.session.execute(
            select(func.coalesce(func.max(TemplateVersion.version), 0)).where(TemplateVersion.template_id == template.id)
        )
        next_version = int(result.scalar_one()) + 1
        version = TemplateVersion(
            template_id=template.id,
            xml_template=xml_text,
            version=next_version,
            status=status_value,
        )
        self.session.add(version)
        await self.session.flush()
        template.current_version_id = version.id
        template.status = TemplateStatus.DRAFT
        return version

    async def _get_template_with_versions(self, template_id: str, *, raise_404: bool = True) -> Template | None:
        result = await self.session.execute(
            select(Template).options(selectinload(Template.versions)).where(Template.id == template_id)
        )
        template = result.scalar_one_or_none()
        if template is None and raise_404:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        return template

    async def _get_draft_version_for_template(self, template_id: str) -> TemplateVersion | None:
        result = await self.session.execute(
            select(TemplateVersion)
            .where(TemplateVersion.template_id == template_id)
            .where(TemplateVersion.status == TemplateVersionStatus.DRAFT)
            .order_by(TemplateVersion.created_at.desc())
        )
        return result.scalar_one_or_none()

    async def _get_draft_versions_for_template(self, template_id: str) -> list[TemplateVersion]:
        result = await self.session.execute(
            select(TemplateVersion)
            .where(TemplateVersion.template_id == template_id)
            .where(TemplateVersion.status == TemplateVersionStatus.DRAFT)
            .order_by(TemplateVersion.created_at.desc())
        )
        return list(result.scalars().all())

    async def _has_deployed_version(self, template_id: str) -> bool:
        result = await self.session.execute(
            select(TemplateVersion)
            .where(TemplateVersion.template_id == template_id)
            .where(TemplateVersion.status == TemplateVersionStatus.DEPLOYED)
            .limit(1)
        )
        return result.scalar_one_or_none() is not None
