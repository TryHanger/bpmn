from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.employee import Employee
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db_session)) -> User:
    phone = token.strip()
    if not phone:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing phone")

    employee_result = await db.execute(select(Employee).where(Employee.phone == phone))
    employee = employee_result.scalar_one_or_none()
    if employee is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Employee not found")

    user_result = await db.execute(select(User).where(User.employee_id == employee.id))
    user = user_result.scalar_one_or_none()
    if user is None:
        user = User(
            email=phone,
            hashed_password=phone,
            role="employee",
            employee_id=employee.id,
            company_id=employee.company_id,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user