from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.company import router as company_router
from app.api.routes.employees import router as employees_router
from app.api.routes.health import router as health_router
from app.api.routes.process import router as process_router
from app.api.routes.roles import router as roles_router
from app.api.routes.schemas import router as schemas_router
from app.api.routes.templates import router as templates_router
from app.api.routes.tasks import router as tasks_router


api_router = APIRouter()
api_router.include_router(health_router, prefix="/health", tags=["health"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(company_router, prefix="/companies", tags=["companies"])
api_router.include_router(roles_router, prefix="/roles", tags=["roles"])
api_router.include_router(employees_router, prefix="/employees", tags=["employees"])
api_router.include_router(process_router, prefix="/instances", tags=["instances"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["tasks"])
api_router.include_router(schemas_router, prefix="/schemas", tags=["schemas"])
api_router.include_router(templates_router, prefix="/templates", tags=["templates"])
