from __future__ import annotations

from collections import defaultdict
from typing import Any

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
from app.models.user import User
from app.schemas.process import TaskBoardResponse, TaskCompleteRequest, TaskContextResponse, TaskRead
from app.schemas.process_schema import ProcessSchemaRead
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
