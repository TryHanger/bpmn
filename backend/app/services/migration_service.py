from __future__ import annotations

import asyncio

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.process_instance import ProcessInstance
from app.models.template_version import TemplateVersion
from app.models.user_types import ProcessInstanceStatus, TemplateVersionStatus
from app.schemas.migration import (
    MigrationAnalysisInstanceRead,
    MigrationAnalysisResponse,
    MigrationExecuteRequest,
    MigrationExecuteResponse,
    MigrationResultItem,
    TaskInfo,
)
from app.schemas.template import ActiveInstancesResponse, ActiveProcessInstance
from app.services.flowable import FlowableClient
from app.services.process_service import _collect_downstream, build_flow_graph


class MigrationService:
    def __init__(self, db: AsyncSession, flowable: FlowableClient) -> None:
        self.db = db
        self.flowable = flowable

    async def get_active_instances(self, template_id: str) -> ActiveInstancesResponse:
        instances = await self._load_active_instances(template_id)
        current_activity_map = await self._load_current_activities(instances)
        return ActiveInstancesResponse(
            items=[
                ActiveProcessInstance.model_validate(
                    {
                        **instance.__dict__,
                        "current_activities": current_activity_map.get(instance.id, []),
                    }
                )
                for instance in instances
            ],
            total=len(instances),
        )

    async def analyze_migration(self, template_id: str, target_version_id: str, instance_ids: list[str]) -> MigrationAnalysisResponse:
        target_version = await self._get_version_or_404(target_version_id)
        if target_version.template_id != template_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_version_id does not belong to this template")
        if not target_version.xml_template:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target version has no XML template")

        old_version = await self._get_previous_deployed_version(template_id, exclude_version_id=target_version_id)
        if old_version is None or not old_version.xml_template:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Previous deployed version was not found")

        old_graph = build_flow_graph(old_version.xml_template)
        new_graph = build_flow_graph(target_version.xml_template)

        old_ids = {activity_id for activity_id, info in old_graph["elements"].items() if info.get("type") in {"userTask", "serviceTask"}}
        new_ids = {activity_id for activity_id, info in new_graph["elements"].items() if info.get("type") in {"userTask", "serviceTask"}}
        added_activity_ids = sorted(new_ids - old_ids)
        removed_activity_ids = sorted(old_ids - new_ids)

        old_schema_tasks = [
            TaskInfo(id=activity_id, name=info.get("name") or activity_id)
            for activity_id, info in old_graph["elements"].items()
            if info.get("name")
        ]
        new_schema_tasks = [
            TaskInfo(id=activity_id, name=info.get("name") or activity_id)
            for activity_id, info in new_graph["elements"].items()
            if info.get("type") == "userTask"
        ]

        instances = await self._load_selected_instances(template_id, instance_ids)
        current_activity_map = await self._load_current_activities(instances)

        analysis_instances: list[MigrationAnalysisInstanceRead] = []
        for instance in instances:
            current_activity_ids = current_activity_map.get(instance.id, [])
            downstream_ids: set[str] = set()
            for activity_id in current_activity_ids:
                downstream_ids.update(_collect_downstream(activity_id, new_graph, stop_at=set(), skip_joining_gateways=False))

            # State change is needed when:
            # 1. The process is currently sitting on a task that was REMOVED from the new schema, or
            # 2. New tasks were added upstream of (not downstream of) the current position.
            current_tasks_removed = bool(set(current_activity_ids) & set(removed_activity_ids))
            new_tasks_not_downstream = bool(set(added_activity_ids) - downstream_ids)
            needs_state_change = current_tasks_removed or new_tasks_not_downstream
            analysis_instances.append(
                MigrationAnalysisInstanceRead(
                    id=instance.id,
                    flowable_process_instance_id=instance.flowable_process_instance_id,
                    name=instance.name,
                    start_time=instance.start_time,
                    current_activity_ids=current_activity_ids,
                    needs_state_change=needs_state_change,
                )
            )

        return MigrationAnalysisResponse(
            old_bpmn_xml=old_version.xml_template,
            new_bpmn_xml=target_version.xml_template,
            added_activity_ids=added_activity_ids,
            removed_activity_ids=removed_activity_ids,
            old_schema_tasks=old_schema_tasks,
            new_schema_tasks=new_schema_tasks,
            instances=analysis_instances,
        )

    async def execute_migration(self, template_id: str, payload: MigrationExecuteRequest) -> MigrationExecuteResponse:
        target_version = await self._get_version_or_404(payload.target_version_id)
        if target_version.template_id != template_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_version_id does not belong to this template")
        if not target_version.process_definition_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target version is not deployed yet — deploy first")

        migrated = 0
        state_changed = 0
        errors = 0
        results: list[MigrationResultItem] = []

        for item in payload.migrations:
            result = await self._execute_single_migration(
                instance_id=item.instance_id,
                template_id=template_id,
                new_process_definition_id=target_version.process_definition_id,
                cancel_activity_ids=item.cancel_activity_ids,
                start_activity_ids=item.start_activity_ids,
            )
            results.append(result)
            if result.status == "migrated":
                migrated += 1
            elif result.status == "migrated_with_state_change":
                state_changed += 1
            else:
                errors += 1

        return MigrationExecuteResponse(migrated=migrated, state_changed=state_changed, errors=errors, results=results)

    async def _execute_single_migration(
        self,
        *,
        instance_id: str,
        template_id: str,
        new_process_definition_id: str,
        cancel_activity_ids: list[str],
        start_activity_ids: list[str],
    ) -> MigrationResultItem:
        result = await self.db.execute(
            select(ProcessInstance).where(ProcessInstance.id == instance_id).where(ProcessInstance.template_id == template_id)
        )
        instance = result.scalar_one_or_none()
        if instance is None:
            return MigrationResultItem(instance_id=instance_id, status="error", error="Process instance not found")

        if not instance.flowable_process_instance_id:
            return MigrationResultItem(instance_id=instance_id, status="error", error="Flowable process instance id not found")

        try:
            await self.flowable.migrate_process_instance(
                instance.flowable_process_instance_id,
                to_process_definition_id=new_process_definition_id,
            )

            state_change_required = bool(cancel_activity_ids or start_activity_ids)
            if state_change_required:
                await self.flowable.change_process_state(
                    instance.flowable_process_instance_id,
                    cancel_activity_ids=cancel_activity_ids,
                    start_activity_ids=start_activity_ids,
                )

            instance.process_definition_id = new_process_definition_id
            self.db.add(instance)
            await self.db.commit()

            return MigrationResultItem(
                instance_id=instance_id,
                status="migrated_with_state_change" if state_change_required else "migrated",
            )
        except Exception as exc:
            await self.db.rollback()
            return MigrationResultItem(instance_id=instance_id, status="error", error=str(exc))

    async def _load_active_instances(self, template_id: str) -> list[ProcessInstance]:
        result = await self.db.execute(
            select(ProcessInstance)
            .where(ProcessInstance.template_id == template_id)
            .where(ProcessInstance.status == ProcessInstanceStatus.STARTED)
            .order_by(ProcessInstance.start_time.desc())
        )
        return list(result.scalars().all())

    async def _load_selected_instances(self, template_id: str, instance_ids: list[str]) -> list[ProcessInstance]:
        query = (
            select(ProcessInstance)
            .where(ProcessInstance.template_id == template_id)
            .where(ProcessInstance.status == ProcessInstanceStatus.STARTED)
            .order_by(ProcessInstance.start_time.desc())
        )
        if instance_ids:
            query = query.where(ProcessInstance.id.in_(instance_ids))

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _load_current_activities(self, instances: list[ProcessInstance]) -> dict[str, list[str]]:
        if not instances:
            return {}

        async def load_current(instance: ProcessInstance) -> tuple[str, list[str]]:
            try:
                response = await self.flowable.list_runtime_executions(instance.flowable_process_instance_id)
            except Exception:
                return instance.id, []

            activities: list[str] = []
            for item in response.get("data", []) or []:
                activity_id = item.get("activityId")
                if activity_id:
                    activities.append(str(activity_id))
            return instance.id, sorted(set(activities))

        pairs = await asyncio.gather(*(load_current(instance) for instance in instances))
        return {instance_id: activities for instance_id, activities in pairs}

    async def _get_version_or_404(self, version_id: str) -> TemplateVersion:
        result = await self.db.execute(select(TemplateVersion).where(TemplateVersion.id == version_id).limit(1))
        version = result.scalar_one_or_none()
        if version is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template version not found")
        return version

    async def _get_previous_deployed_version(self, template_id: str, *, exclude_version_id: str) -> TemplateVersion | None:
        result = await self.db.execute(
            select(TemplateVersion)
            .where(TemplateVersion.template_id == template_id)
            .where(TemplateVersion.status == TemplateVersionStatus.DEPLOYED)
            .where(TemplateVersion.id != exclude_version_id)
            .order_by(TemplateVersion.created_at.desc(), TemplateVersion.version.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
