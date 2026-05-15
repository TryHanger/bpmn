from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.schemas.process_schema import (
    ProcessSchemaCreate,
    ProcessSchemaRead,
    ProcessSchemaRoleCreate,
    ProcessSchemaRoleRead,
    ProcessSchemaVariableCreate,
    ProcessSchemaVariableRead,
    ProcessSchemaVariableUpdate,
)
from app.services.schema_service import SchemaService

router = APIRouter()


@router.get("", response_model=list[ProcessSchemaRead])
async def list_schemas(db: AsyncSession = Depends(get_db_session)) -> list[ProcessSchemaRead]:
    return await SchemaService(db).list_schemas()


@router.post("", response_model=ProcessSchemaRead, status_code=status.HTTP_201_CREATED)
async def create_schema(payload: ProcessSchemaCreate, db: AsyncSession = Depends(get_db_session)) -> ProcessSchemaRead:
    return await SchemaService(db).create_schema(payload)


@router.get("/{schema_id}", response_model=ProcessSchemaRead)
async def get_schema(schema_id: str, db: AsyncSession = Depends(get_db_session)) -> ProcessSchemaRead:
    return await SchemaService(db).get_schema(schema_id)


@router.delete("/{schema_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schema(schema_id: str, db: AsyncSession = Depends(get_db_session)) -> None:
    await SchemaService(db).delete_schema(schema_id)


@router.post("/{schema_id}/roles", response_model=ProcessSchemaRoleRead, status_code=status.HTTP_201_CREATED)
async def add_role(schema_id: str, payload: ProcessSchemaRoleCreate, db: AsyncSession = Depends(get_db_session)) -> ProcessSchemaRoleRead:
    return await SchemaService(db).add_role(schema_id, payload)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(role_id: str, db: AsyncSession = Depends(get_db_session)) -> None:
    await SchemaService(db).delete_role(role_id)


@router.post("/{schema_id}/variables", response_model=ProcessSchemaVariableRead, status_code=status.HTTP_201_CREATED)
async def add_variable(schema_id: str, payload: ProcessSchemaVariableCreate, db: AsyncSession = Depends(get_db_session)) -> ProcessSchemaVariableRead:
    return await SchemaService(db).add_variable(schema_id, payload)


@router.put("/variables/{var_id}", response_model=ProcessSchemaVariableRead)
async def update_variable(var_id: str, payload: ProcessSchemaVariableUpdate, db: AsyncSession = Depends(get_db_session)) -> ProcessSchemaVariableRead:
    return await SchemaService(db).update_variable(var_id, payload)


@router.delete("/variables/{var_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_variable(var_id: str, db: AsyncSession = Depends(get_db_session)) -> None:
    await SchemaService(db).delete_variable(var_id)