from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserCreateRequest, UserResponse
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/register", response_model=UserResponse)
async def register(payload: UserCreateRequest, db: AsyncSession = Depends(get_db_session)) -> UserResponse:
    return await AuthService(db).register(payload)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, response: Response, db: AsyncSession = Depends(get_db_session)) -> TokenResponse:
    return await AuthService(db).login(payload, response)


@router.post("/logout")
async def logout(response: Response, db: AsyncSession = Depends(get_db_session)) -> dict[str, str]:
    return await AuthService(db).logout(None, response)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session)) -> UserResponse:
    return await AuthService(db).me(current_user)
