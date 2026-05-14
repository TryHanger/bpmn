from __future__ import annotations

from fastapi import HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserCreateRequest, UserResponse


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def register(self, payload: UserCreateRequest) -> UserResponse:
        employee_result = await self.session.execute(select(Employee).where(Employee.phone == payload.phone))
        employee = employee_result.scalar_one_or_none()
        if employee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

        existing = await self.session.execute(select(User).where(User.employee_id == employee.id))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

        user = User(
            email=payload.phone,
            hashed_password=payload.phone,
            role="employee",
            employee_id=employee.id,
            company_id=employee.company_id,
        )
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return UserResponse.model_validate(user)

    async def login(self, payload: LoginRequest, response: Response) -> TokenResponse:
        employee_result = await self.session.execute(select(Employee).where(Employee.phone == payload.phone))
        employee = employee_result.scalar_one_or_none()
        if employee is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Employee not found")

        user_result = await self.session.execute(select(User).where(User.employee_id == employee.id))
        user = user_result.scalar_one_or_none()
        if user is None:
            user = User(
                email=payload.phone,
                hashed_password=payload.phone,
                role="employee",
                employee_id=employee.id,
                company_id=employee.company_id,
            )
            self.session.add(user)
            await self.session.commit()
            await self.session.refresh(user)

        return TokenResponse(access_token=payload.phone, user=UserResponse.model_validate(user))

    async def refresh(self, refresh_token: str | None, response: Response) -> TokenResponse:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Refresh is not used in phone auth mode")

    async def logout(self, refresh_token: str | None, response: Response) -> dict[str, str]:
        return {"message": "ok"}

    async def me(self, user: User) -> UserResponse:
        return UserResponse.model_validate(user)

    async def _get_user_by_email(self, email: str) -> User:
        result = await self.session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        return user

    async def _get_user_by_id(self, user_id: str) -> User:
        result = await self.session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return user

