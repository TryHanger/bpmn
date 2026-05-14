from __future__ import annotations

import asyncio
import logging
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.process_instance import ProcessInstance
from app.models.template import Template
from app.models.user import User
from app.models.user_types import ProcessInstanceStatus
from app.schemas.process import (
    ActivityStatus,
    ProcessInstanceResponse,
    ProcessListResponse,
    ProcessStartRequest,
    ProcessStateResponse,
)
from app.services.flowable import FlowableClient

logger = logging.getLogger(__name__)


def build_flow_graph(xml: str) -> dict:
    ns = "{http://www.omg.org/spec/BPMN/20100524/MODEL}"
    elements: dict[str, dict[str, str]] = {}
    sequence_flows: dict[str, dict[str, str]] = {}
    outgoing: dict[str, list[str]] = defaultdict(list)
    incoming: dict[str, list[str]] = defaultdict(list)

    root = ET.fromstring(xml)
    process = root.find(f"{ns}process")
    if process is None:
        return {"elements": elements, "sequenceFlows": sequence_flows, "outgoing": outgoing, "incoming": incoming}

    for elem in process:
        elem_id = elem.get("id")
        if not elem_id:
            continue
        elements[elem_id] = {"type": elem.tag.replace(ns, ""), "name": elem.get("name", "") or ""}

    for flow in process.findall(f"{ns}sequenceFlow"):
        flow_id = flow.get("id")
        source = flow.get("sourceRef")
        target = flow.get("targetRef")
        if flow_id and source and target:
            sequence_flows[flow_id] = {"source": source, "target": target}
            outgoing[source].append(flow_id)
            incoming[target].append(flow_id)

    return {"elements": elements, "sequenceFlows": sequence_flows, "outgoing": outgoing, "incoming": incoming}


def _collect_downstream(start: str, graph: dict, stop_at: set[str]) -> set[str]:
    visited: set[str] = set()
    queue = [start]
    while queue:
        current = queue.pop(0)
        if current in visited or current in stop_at:
            continue
        visited.add(current)
        element_info = graph["elements"].get(current, {})
        elem_type = element_info.get("type", "")
        incoming_flows = graph["incoming"].get(current, [])
        is_joining_gateway = elem_type in {"exclusiveGateway", "parallelGateway", "inclusiveGateway"} and len(incoming_flows) > 1
        if is_joining_gateway:
            continue
        for flow_id in graph["outgoing"].get(current, []):
            target = graph["sequenceFlows"].get(flow_id, {}).get("target")
            if target and target not in visited:
                queue.append(target)
    return visited


def find_skipped_tasks(
    graph: dict,
    active_ids: set[str],
    completed_ids: set[str],
    rejected_ids: set[str],
    process_is_finished: bool,
) -> set[str]:
    known_ids = active_ids | completed_ids | rejected_ids
    skipped: set[str] = set()

    for elem_id, elem_info in graph["elements"].items():
        if elem_info.get("type", "") not in {"exclusiveGateway", "inclusiveGateway"}:
            continue

        outgoing_flow_ids = graph["outgoing"].get(elem_id, [])
        targets = [graph["sequenceFlows"].get(flow_id, {}).get("target") for flow_id in outgoing_flow_ids]
        targets = [target for target in targets if target]
        if not targets:
            continue

        chosen_targets = {target for target in targets if target in known_ids}
        if elem_info.get("type") == "inclusiveGateway" and not process_is_finished:
            continue
        if not chosen_targets:
            continue

        for target in targets:
            if target not in chosen_targets:
                skipped.update(_collect_downstream(target, graph, known_ids))

    return {node for node in skipped if graph["elements"].get(node, {}).get("type") == "userTask"}


class ProcessService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        settings = get_settings()
        self.flowable = FlowableClient(
            base_url=settings.flowable_base_url,
            username=settings.flowable_username,
            password=settings.flowable_password,
        )

    async def start_process(self, payload: ProcessStartRequest, current_user: User) -> ProcessInstanceResponse:
        self._assert_company_access(current_user, str(payload.company_id))
        xml_template = await self._get_xml_template(payload.process_definition_key)
        variables = self._variables_to_flowable(payload.variables, current_user.id)
        business_key = self._generate_business_key()

        response = await self.flowable.start_process(
            process_definition_key=payload.process_definition_key,
            business_key=business_key,
            initiator_user_id=current_user.id,
            variables=variables,
        )

        process_instance = ProcessInstance(
            name=payload.name,
            company_id=str(payload.company_id),
            flowable_process_instance_id=response["id"],
            template_id=None,
            process_definition_key=payload.process_definition_key,
            process_definition_id=response["processDefinitionId"],
            business_key=business_key,
            xml_template=xml_template,
            status=ProcessInstanceStatus.STARTED,
            initiator_user_id=current_user.id,
            start_time=self._parse_datetime(response["startTime"]),
        )
        self.session.add(process_instance)
        await self.session.commit()
        await self.session.refresh(process_instance)
        return ProcessInstanceResponse.model_validate({**process_instance.__dict__, "started_by": process_instance.initiator_user_id, "current_activities": []})

    async def list_processes(self, current_user: User, company_id: str | None = None) -> ProcessListResponse:
        effective_company_id = company_id or current_user.company_id
        if effective_company_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="company_id is required")
        self._assert_company_access(current_user, effective_company_id)

        await self._sync_started_processes(str(effective_company_id))
        result = await self.session.execute(
            select(ProcessInstance)
            .where(ProcessInstance.company_id == str(effective_company_id))
            .order_by(ProcessInstance.start_time.desc())
        )
        processes = list(result.scalars().all())
        items = await asyncio.gather(*(self._build_process_item(process_instance) for process_instance in processes))
        return ProcessListResponse(items=items, total=len(items))

    async def get_process_state(self, process_instance_id: str) -> ProcessStateResponse:
        result = await self.session.execute(select(ProcessInstance).where(ProcessInstance.id == process_instance_id))
        process_instance = result.scalar_one_or_none()
        if process_instance is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process instance not found")

        xml_template = await self._resolve_process_xml(process_instance)
        try:
            executions_data, history_data = await asyncio.gather(
                self.flowable.list_runtime_executions(process_instance.flowable_process_instance_id),
                self.flowable.list_historic_task_instances(process_instance.flowable_process_instance_id),
            )
        except Exception as exc:
            logger.error("Flowable service error: %s", exc)
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Flowable service unavailable") from exc

        active_ids = {item["activityId"] for item in executions_data.get("data", []) if item.get("activityId")}
        process_is_finished = len(active_ids) == 0
        history_by_key = {item["taskDefinitionKey"]: item for item in history_data.get("data", []) if item.get("taskDefinitionKey")}

        try:
            root = ET.fromstring(xml_template)
        except ET.ParseError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid BPMN XML") from exc
        ns = {
            "bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL",
            "flowable": "http://flowable.org/bpmn",
        }
        all_tasks: list[dict[str, str | None]] = []
        for task_elem in root.findall("bpmn:process/bpmn:userTask", ns):
            all_tasks.append(
                {
                    "activityId": task_elem.get("id"),
                    "name": task_elem.get("name") or "",
                    "bpmn_assignee": task_elem.get("{http://flowable.org/bpmn}assignee"),
                }
            )

        activities: list[ActivityStatus] = []
        for task in all_tasks:
            task_key = task["activityId"] or ""
            if task_key in history_by_key:
                hist = history_by_key[task_key]
                end_time = hist.get("endTime")
                delete_reason = hist.get("deleteReason")
                status_value = "completed" if end_time and not delete_reason else "rejected" if end_time and delete_reason else "active"
                activities.append(
                    ActivityStatus(
                        activityId=task_key,
                        name=task["name"],
                        status=status_value,
                        assignee=hist.get("assignee"),
                        bpmn_assignee=task["bpmn_assignee"],
                        startTime=self._parse_datetime_optional(hist.get("startTime")),
                        endTime=self._parse_datetime_optional(end_time),
                        deleteReason=delete_reason,
                    )
                )
            elif task_key in active_ids:
                activities.append(
                    ActivityStatus(
                        activityId=task_key,
                        name=task["name"],
                        status="active",
                        assignee=None,
                        bpmn_assignee=task["bpmn_assignee"],
                    )
                )
            else:
                activities.append(
                    ActivityStatus(
                        activityId=task_key,
                        name=task["name"],
                        status="pending",
                        assignee=None,
                        bpmn_assignee=task["bpmn_assignee"],
                    )
                )

        completed_ids = {key for key, item in history_by_key.items() if item.get("endTime") is not None and item.get("deleteReason") is None}
        rejected_ids = {key for key, item in history_by_key.items() if item.get("endTime") is not None and item.get("deleteReason") is not None}
        if process_is_finished:
            try:
                historic_process = await self.flowable.get_historic_process_instance(process_instance.flowable_process_instance_id)
                end_event_id = historic_process.get("endActivityId")
                if end_event_id:
                    completed_ids.add(end_event_id)
            except Exception:
                logger.debug("Could not fetch endActivityId for finished process")

        skipped = find_skipped_tasks(
            graph=build_flow_graph(xml_template),
            active_ids=active_ids,
            completed_ids=completed_ids,
            rejected_ids=rejected_ids,
            process_is_finished=process_is_finished,
        )
        for activity in activities:
            if activity.status == "pending" and activity.activityId in skipped:
                activity.status = "skipped"

        return ProcessStateResponse(
            process_instance_id=process_instance.id,
            flowable_instance_id=process_instance.flowable_process_instance_id,
            activities=activities,
        )

    async def _build_process_item(self, process_instance: ProcessInstance) -> ProcessInstanceResponse:
        current_activities: list[str] = []
        if process_instance.status == ProcessInstanceStatus.STARTED:
            try:
                runtime = await self.flowable.list_runtime_executions(process_instance.flowable_process_instance_id)
                current_activities = [item["activityId"] for item in runtime.get("data", []) if item.get("activityId")]
            except Exception:
                logger.debug("Failed to load current activities for process %s", process_instance.id)

        status = "running" if process_instance.status == ProcessInstanceStatus.STARTED else "completed"
        return ProcessInstanceResponse.model_validate(
            {
                "id": process_instance.id,
                "name": process_instance.name,
                "company_id": process_instance.company_id,
                "flowable_process_instance_id": process_instance.flowable_process_instance_id,
                "process_definition_key": process_instance.process_definition_key,
                "process_definition_id": process_instance.process_definition_id,
                "business_key": process_instance.business_key,
                "status": status,
                "started_by": process_instance.initiator_user_id,
                "xml_template": process_instance.xml_template,
                "start_time": process_instance.start_time,
                "completed_at": process_instance.completed_at,
                "created_at": process_instance.created_at,
                "updated_at": process_instance.updated_at,
                "current_activities": current_activities,
            }
        )

    async def _sync_started_processes(self, company_id: str) -> None:
        result = await self.session.execute(
            select(ProcessInstance)
            .where(ProcessInstance.company_id == company_id)
            .where(ProcessInstance.status == ProcessInstanceStatus.STARTED)
        )
        started_processes = result.scalars().all()
        changed = False
        for process_instance in started_processes:
            historic = await self.flowable.get_historic_process_instance(process_instance.flowable_process_instance_id)
            if historic.get("endTime") is not None:
                process_instance.status = ProcessInstanceStatus.COMPLETED
                process_instance.completed_at = self._parse_datetime(historic["endTime"])
                changed = True
        if changed:
            await self.session.commit()

    async def _get_xml_template(self, process_definition_key: str) -> str:
        result = await self.session.execute(
            select(Template)
            .where(Template.process_definition_key == process_definition_key)
            .options(selectinload(Template.current_version))
        )
        template = result.scalar_one_or_none()
        if template is None or template.current_version is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found for processDefinitionKey")
        return template.current_version.xml_template

    async def _resolve_process_xml(self, process_instance: ProcessInstance) -> str:
        if process_instance.xml_template:
            return process_instance.xml_template
        if process_instance.template_id:
            result = await self.session.execute(
                select(Template)
                .where(Template.id == process_instance.template_id)
                .options(selectinload(Template.current_version))
            )
            template = result.scalar_one_or_none()
            if template and template.current_version:
                return template.current_version.xml_template
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BPMN template not found for process instance")

    def _dict_variables_to_flowable(self, variables: dict[str, object]) -> list[dict[str, object]]:
        payload: list[dict[str, object]] = []
        for key, value in variables.items():
            payload.append({"name": key, "value": value, "type": self._infer_flowable_type(value)})
        return payload

    def _variables_to_flowable(self, variables, initiator_user_id: str) -> list[dict[str, object]]:
        payload: list[dict[str, object]] = []
        for variable in variables:
            payload.append({"name": variable.name, "value": variable.value, "type": variable.type})

        payload = [item for item in payload if item["name"] != "initiatorUserId"]
        payload.append({"name": "initiatorUserId", "value": initiator_user_id, "type": "string"})
        return payload

    def _infer_flowable_type(self, value: object) -> str:
        if isinstance(value, bool):
            return "boolean"
        if isinstance(value, int):
            return "integer"
        return "string"

    def _generate_business_key(self) -> str:
        return f"bk_{uuid4().hex}"

    def _parse_datetime(self, value: str) -> datetime:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))

    def _parse_datetime_optional(self, value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None

    def _assert_company_access(self, current_user: User, company_id: str) -> None:
        if current_user.company_id and current_user.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden for this company")
