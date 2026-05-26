from __future__ import annotations

from typing import Optional
from xml.etree import ElementTree as ET

from app.schemas.template import ProcessMigrationResult
from app.services.flowable import FlowableClient


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


class MigrationService:
    def __init__(self, db, flowable: FlowableClient) -> None:
        self.db = db
        self.flowable = flowable

    def parse_task_order(self, bpmn_xml: str) -> list[str]:
        try:
            root = ET.fromstring(bpmn_xml)
            process = next((element for element in root.iter() if _local_name(element.tag) == "process"), None)
            if process is None:
                return []

            elements: dict[str, str] = {}
            next_nodes: dict[str, str] = {}

            for element in process:
                element_id = element.get("id")
                if not element_id:
                    continue
                elements[element_id] = _local_name(element.tag)

            for element in process:
                if _local_name(element.tag) != "sequenceFlow":
                    continue
                source_ref = element.get("sourceRef")
                target_ref = element.get("targetRef")
                if source_ref and target_ref:
                    next_nodes[source_ref] = target_ref

            start_id = next((element_id for element_id, element_type in elements.items() if element_type == "startEvent"), None)
            if not start_id:
                return []

            ordered_tasks: list[str] = []
            visited: set[str] = set()
            current_id = start_id

            while current_id and current_id not in visited:
                visited.add(current_id)
                if elements.get(current_id) == "userTask":
                    ordered_tasks.append(current_id)
                current_id = next_nodes.get(current_id)

            return ordered_tasks
        except Exception as exc:
            print(f"parse_task_order error: {exc}")
            return []

    async def get_current_task_key(self, process_instance_id: str) -> Optional[str]:
        response = await self.flowable.list_historic_task_instances(process_instance_id)
        tasks = response.get("data", [])
        active_tasks = [task for task in tasks if task.get("endTime") is None]
        if active_tasks:
            return active_tasks[0].get("taskDefinitionKey")
        return None

    async def migrate_process(
        self,
        process_instance_id: str,
        old_bpmn_xml: str,
        new_process_definition_id: str,
        new_bpmn_xml: str,
    ) -> ProcessMigrationResult:
        try:
            current_task_key = await self.get_current_task_key(process_instance_id)
            if not current_task_key:
                return ProcessMigrationResult(
                    process_instance_id=process_instance_id,
                    status="skipped",
                    current_task_key=None,
                    new_task_key=None,
                    error="Process already completed",
                )

            old_order = self.parse_task_order(old_bpmn_xml)
            new_order = self.parse_task_order(new_bpmn_xml)

            migration_response = await self.flowable.migrate_process_instance(
                process_instance_id,
                to_process_definition_id=new_process_definition_id,
            )
            _ = migration_response

            if current_task_key in new_order:
                return ProcessMigrationResult(
                    process_instance_id=process_instance_id,
                    status="migrated",
                    current_task_key=current_task_key,
                    new_task_key=None,
                    error=None,
                )

            new_task_key = self._find_next_task(current_task_key, old_order, new_order)
            if not new_task_key:
                return ProcessMigrationResult(
                    process_instance_id=process_instance_id,
                    status="error",
                    current_task_key=current_task_key,
                    new_task_key=None,
                    error="Cannot find suitable task in new template",
                )

            await self.flowable.change_process_state(
                process_instance_id,
                cancel_activity_ids=[current_task_key],
                start_activity_ids=[new_task_key],
            )

            return ProcessMigrationResult(
                process_instance_id=process_instance_id,
                status="migrated_with_state_change",
                current_task_key=current_task_key,
                new_task_key=new_task_key,
                error=None,
            )
        except Exception as exc:
            return ProcessMigrationResult(
                process_instance_id=process_instance_id,
                status="error",
                current_task_key=None,
                new_task_key=None,
                error=str(exc),
            )

    def _find_next_task(
        self,
        current_task_key: str,
        old_order: list[str],
        new_order: list[str],
    ) -> Optional[str]:
        if current_task_key not in old_order:
            return new_order[0] if new_order else None

        current_index = old_order.index(current_task_key)
        for task_key in old_order[current_index + 1 :]:
            if task_key in new_order:
                return task_key

        return new_order[-1] if new_order else None