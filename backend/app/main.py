from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import select

from app.api.router import api_router
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine, async_session_maker
from app.models.user import User
from app.models.company import Company
from app.models.role import Role
from app.models.employee import Employee


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.auto_create_tables:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    # Auto-generate a default admin user if no users exist (useful for dev)
    async with async_session_maker() as session:
        result = await session.execute(select(User))
        existing = result.scalars().first()
        if existing is None:
            company = Company(name="Default Company")
            session.add(company)
            await session.flush()

            role = Role(name="Admin", flowable_group="admin", company_id=company.id)
            session.add(role)
            await session.flush()

            # use a simple phone-based user for compatibility with phone auth flow
            admin_phone = "0000000000"
            employee = Employee(name="Admin", phone=admin_phone, role_id=role.id, company_id=company.id)
            session.add(employee)
            await session.flush()

            user = User(
                email=admin_phone,
                hashed_password=admin_phone,
                role="admin",
                employee_id=employee.id,
                company_id=company.id,
            )
            session.add(user)
            await session.flush()

            company.admin_user_id = user.id
            await session.commit()
            print(f"Created default admin user with phone={admin_phone}")
    yield


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        settings.frontend_origin,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
