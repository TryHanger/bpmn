from __future__ import annotations

from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.process_instance import ProcessInstance
from app.models.role import Role
from app.models.user import User
from app.schemas.process import TaskBoardResponse, TaskCompleteRequest, TaskRead
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
        return await self.flowable.complete_task(task_id, variable_name=variable_name, approved=approved)

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
