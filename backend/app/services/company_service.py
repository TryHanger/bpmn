from __future__ import annotations

import re
import secrets
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import HTTPException, status

from app.core.security import hash_password
from app.models.company import Company
from app.models.employee import Employee
from app.models.role import Role
from app.models.user import User
from app.schemas.company import CompanyCreate, CompanyResponse, EmployeeCreate, EmployeeResponse, RoleCreate, RoleResponse


class CompanyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_company(self, payload: CompanyCreate, current_user: User) -> CompanyResponse:
        exists = await self.session.execute(select(Company).where(Company.name == payload.name))
        if exists.scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Company name must be unique")

        company = Company(name=payload.name, admin_user_id=current_user.id)
        self.session.add(company)
        await self.session.flush()

        current_user.company_id = company.id
        current_user.role = "admin"
        await self.session.commit()
        await self.session.refresh(company)
        return CompanyResponse.model_validate(company)

    async def list_companies(self, current_user: User) -> list[CompanyResponse]:
        if current_user.company_id:
            result = await self.session.execute(select(Company).where(Company.id == current_user.company_id))
        else:
            result = await self.session.execute(select(Company).order_by(Company.created_at.desc()))
        return [CompanyResponse.model_validate(item) for item in result.scalars().all()]

    async def create_role(self, payload: RoleCreate, current_user: User) -> RoleResponse:
        self._assert_company_access(current_user, str(payload.company_id))
        exists = await self.session.execute(
            select(Role)
            .where(Role.company_id == str(payload.company_id))
            .where(Role.name == payload.name)
        )
        if exists.scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role name must be unique within company")

        role = Role(company_id=str(payload.company_id), name=payload.name, flowable_group=payload.flowable_group)
        self.session.add(role)
        await self.session.commit()
        await self.session.refresh(role)
        return RoleResponse.model_validate(role)

    async def list_roles(self, company_id: str, current_user: User) -> list[RoleResponse]:
        self._assert_company_access(current_user, company_id)
        result = await self.session.execute(
            select(Role).where(Role.company_id == company_id).order_by(Role.created_at.desc())
        )
        return [RoleResponse.model_validate(item) for item in result.scalars().all()]

    async def create_employee(self, payload: EmployeeCreate, current_user: User) -> EmployeeResponse:
        self._assert_company_access(current_user, str(payload.company_id))

        role_result = await self.session.execute(select(Role).where(Role.id == str(payload.role_id)))
        role = role_result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        if role.company_id != str(payload.company_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role does not belong to the specified company")

        # create employee with provided phone, but do not create a user or assign email/password
        employee = Employee(phone=payload.phone, name=payload.name, role_id=str(payload.role_id), company_id=str(payload.company_id))
        self.session.add(employee)
        await self.session.commit()
        await self.session.refresh(employee)

        return EmployeeResponse(
            id=employee.id,
            name=employee.name,
            phone=employee.phone,
            company_id=employee.company_id,
            role_id=employee.role_id,
            role_name=role.name,
            flowable_group=role.flowable_group,
            user_id=None,
            temp_password=None,
            created_at=employee.created_at,
            updated_at=employee.updated_at,
        )

    async def list_employees(self, company_id: str, current_user: User) -> list[EmployeeResponse]:
        self._assert_company_access(current_user, company_id)
        result = await self.session.execute(
            select(Employee, Role, User)
            .join(Role, Role.id == Employee.role_id)
            .outerjoin(User, User.employee_id == Employee.id)
            .where(Employee.company_id == company_id)
            .order_by(Employee.created_at.desc())
        )
        items: list[EmployeeResponse] = []
        for employee, role, user in result.all():
            items.append(
                EmployeeResponse(
                    id=employee.id,
                    name=employee.name,
                    phone=employee.phone,
                    company_id=employee.company_id,
                    role_id=employee.role_id,
                    role_name=role.name,
                    flowable_group=role.flowable_group,
                    user_id=user.id if user else None,
                    temp_password=None,
                    created_at=employee.created_at,
                    updated_at=employee.updated_at,
                )
            )
        return items

    async def _get_company(self, company_id: str) -> Company:
        result = await self.session.execute(select(Company).where(Company.id == company_id))
        company = result.scalar_one_or_none()
        if company is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
        return company

    def _assert_company_access(self, current_user: User, company_id: str) -> None:
        if current_user.company_id and current_user.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden for this company")

    def _build_employee_email(self, name: str, company_id: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", ".", name.lower()).strip(".") or "employee"
        suffix = company_id.replace("-", "")[:8]
        return f"{slug}@{suffix}.company.internal"
