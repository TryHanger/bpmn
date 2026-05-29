from __future__ import annotations

from collections import defaultdict
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.employee import Employee
from app.models.process_instance import ProcessInstance
from app.models.process_schema import ProcessSchema, ProcessSchemaRole, ProcessSchemaVariable
from app.models.role import Role
from app.models.template import Template
from app.models.template_version import TemplateVersion
from app.models.task_remark import TaskRemark
from app.models.user import User
from app.models.user_types import ProcessInstanceStatus
from app.schemas.process import TaskBoardResponse, TaskCompleteRequest, TaskContextResponse, TaskRead
from app.schemas.process_schema import ProcessSchemaRead
from app.schemas.task_remark import TaskRemarkCreate, TaskRemarkRead
from app.services.flowable import FlowableClient


class TaskService:
    def __init__(self, session: AsyncSession, flowable: FlowableClient) -> None:
        self.session = session
        self.flowable = flowable

    async def list_my_tasks(self, current_user: User) -> TaskBoardResponse:
        employee, role = await self._get_employee_role(current_user)
        # role_key = role.name.lower()
        available_payload = await self.flowable.list_runtime_tasks(params={"assignee": role.flowable_group})
        claimed_payload = await self.flowable.list_runtime_tasks(params={"assignee": str(employee.id)})

        process_names = await self._load_process_names(
            [task.get("processInstanceId") for task in (available_payload.get("data") or []) + (claimed_payload.get("data") or [])]
        )

        available = [self._map_task(task, process_names, claimed=False) for task in available_payload.get("data") or []]
        claimed = [self._map_task(task, process_names, claimed=True) for task in claimed_payload.get("data") or []]
        return TaskBoardResponse(available=available, claimed=claimed)

    async def claim_task(self, task_id: str, current_user: User) -> dict:
        employee, _ = await self._get_employee_role(current_user)
        return await self.flowable.claim_task(task_id, str(employee.id))

    async def complete_task(self, task_id: str, payload: TaskCompleteRequest, current_user: User) -> dict:
        _, role = await self._get_employee_role(current_user)
        # role_key = role.name.lower()
        variable_name = f"{role.flowable_group}Approved"
        approved = payload.outcome == "approved"
        return await self.flowable.complete_task(
            task_id,
            variable_name=variable_name,
            approved=approved,
            variables=self._serialize_variables(payload.variables),
        )

    async def reject_and_terminate_process(self, task_id: str, current_user: User) -> dict:
        await self._get_employee_role(current_user)

        try:
            task = await self.flowable.get_runtime_task(task_id)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == status.HTTP_404_NOT_FOUND:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found in Flowable") from exc
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to load task from Flowable") from exc

        process_instance_id = str(task.get("processInstanceId") or "")
        if not process_instance_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="processInstanceId not found")

        try:
            await self.flowable.terminate_process_instance(process_instance_id)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Flowable terminate failed: {exc.response.text}") from exc

        instance = await self.session.scalar(
            select(ProcessInstance).where(ProcessInstance.flowable_process_instance_id == process_instance_id)
        )
        if instance is not None:
            instance.status = ProcessInstanceStatus.TERMINATED
            if instance.completed_at is None:
                from datetime import datetime, timezone

                instance.completed_at = datetime.now(timezone.utc)
            self.session.add(instance)
            await self.session.commit()

        return {
            "status": "terminated",
            "process_instance_id": process_instance_id,
            "rejected_by": str(current_user.id),
        }

    async def complete_with_remark(self, task_id: str, payload: TaskRemarkCreate, current_user: User) -> dict:
        _, role = await self._get_employee_role(current_user)
        variable_name = f"{role.flowable_group}Approved"

        try:
            task = await self.flowable.get_runtime_task(task_id)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == status.HTTP_404_NOT_FOUND:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found in Flowable") from exc
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to load task from Flowable") from exc

        process_instance_id = str(task.get("processInstanceId") or "")
        if not process_instance_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task is missing process instance id")

        try:
            await self.flowable.complete_task(
                task_id,
                variable_name=variable_name,
                approved=True,
                variables=self._serialize_variables(payload.variables),
            )
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Flowable complete failed") from exc

        remark = TaskRemark(
            process_instance_id=process_instance_id,
            task_definition_key=payload.task_definition_key,
            task_id=task_id,
            task_name=payload.task_name,
            remark=payload.remark,
            author_id=current_user.id,
        )
        self.session.add(remark)
        await self.session.commit()
        await self.session.refresh(remark)

        return {"status": "completed_with_remark", "remark_id": remark.id}

    async def get_remarks_by_process(self, process_instance_id: str) -> list[TaskRemarkRead]:
        result = await self.session.execute(
            select(TaskRemark)
            .options(selectinload(TaskRemark.author).selectinload(User.employee))
            .where(TaskRemark.process_instance_id == process_instance_id)
            .order_by(TaskRemark.created_at.asc())
        )
        remarks = result.scalars().all()
        return [self._map_task_remark(remark) for remark in remarks]

    async def get_task_context(self, task_id: str, current_user: User) -> TaskContextResponse:
        await self._get_employee_role(current_user)
        task = await self.flowable.get_runtime_task(task_id)
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

        process_definition_id = str(task.get("processDefinitionId") or "")
        schema = await self._load_schema_for_process_definition(process_definition_id)
        variables = await self._load_process_variables(str(task.get("processInstanceId") or ""))

        return TaskContextResponse(
            task=self._map_task(task, {}, claimed=bool(task.get("assignee"))),
            schema=schema,
            variables=variables,
        )

    async def _get_employee_role(self, current_user: User) -> tuple[Employee, Role]:
        if current_user.employee_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current user is not linked to an employee")

        employee_result = await self.session.execute(
            select(Employee).where(Employee.id == current_user.employee_id).limit(1)
        )
        employee = employee_result.scalar_one_or_none()
        if employee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

        role_result = await self.session.execute(select(Role).where(Role.id == employee.role_id).limit(1))
        role = role_result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        return employee, role

    async def _load_process_names(self, process_instance_ids: list[str | None]) -> dict[str, str]:
        ids = [process_instance_id for process_instance_id in process_instance_ids if process_instance_id]
        if not ids:
            return {}
        result = await self.session.execute(
            select(ProcessInstance.flowable_process_instance_id, ProcessInstance.name).where(
                ProcessInstance.flowable_process_instance_id.in_(ids)
            )
        )
        return {flowable_id: name for flowable_id, name in result.all()}

    async def _load_schema_for_process_definition(self, process_definition_id: str) -> ProcessSchemaRead | None:
        if not process_definition_id:
            return None

        result = await self.session.execute(
            select(TemplateVersion)
            .options(
                selectinload(TemplateVersion.template)
                .selectinload(Template.schema)
                .selectinload(ProcessSchema.roles)
                .selectinload(ProcessSchemaRole.variables)
            )
            .where(TemplateVersion.process_definition_id == process_definition_id)
            .limit(1)
        )
        version = result.scalar_one_or_none()
        template = version.template if version else None
        schema = template.schema if template else None
        if schema is None:
            return None
        return ProcessSchemaRead.model_validate(schema)

    async def _load_process_variables(self, process_instance_id: str) -> dict[str, Any]:
        if not process_instance_id:
            return {}
        try:
            response = await self.flowable.get_process_instance_variables(process_instance_id)
        except Exception:
            return {}

        if isinstance(response, list):
            variables_payload = response
        elif isinstance(response, dict):
            variables_payload = response.get("data") or []
        else:
            variables_payload = []

        variables: dict[str, Any] = {}
        for item in variables_payload:
            name = item.get("name")
            if not name:
                continue
            variables[name] = item.get("value")
        return variables

    def _serialize_variables(self, variables: list) -> list[dict[str, object]]:
        payload: list[dict[str, object]] = []
        for variable in variables:
            payload.append({"name": variable.name, "value": variable.value, "type": variable.type})
        return payload

    def _map_task(self, task: dict, process_names: dict[str, str], *, claimed: bool) -> TaskRead:
        process_instance_id = task.get("processInstanceId")
        return TaskRead(
            id=str(task.get("id") or ""),
            assignee=task.get("assignee"),
            name=task.get("name"),
            createTime=task.get("createTime"),
            taskDefinitionKey=task.get("taskDefinitionKey"),
            processInstanceId=process_instance_id,
            processDefinitionId=task.get("processDefinitionId"),
            processName=process_names.get(process_instance_id or ""),
            claimed=claimed,
        )

    def _map_task_remark(self, remark: TaskRemark) -> TaskRemarkRead:
        author_name = None
        if remark.author is not None:
            author_name = remark.author.employee.name if remark.author.employee is not None else remark.author.email

        return TaskRemarkRead(
            id=remark.id,
            task_definition_key=remark.task_definition_key,
            task_name=remark.task_name,
            remark=remark.remark,
            author_id=remark.author_id,
            author_name=author_name,
            created_at=remark.created_at,
        )
