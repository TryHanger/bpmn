from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.process_schema import ProcessSchema, ProcessSchemaRole, ProcessSchemaVariable
from app.models.template import Template
from app.schemas.process_schema import (
    ProcessSchemaCreate,
    ProcessSchemaRead,
    ProcessSchemaRoleCreate,
    ProcessSchemaRoleRead,
    ProcessSchemaVariableCreate,
    ProcessSchemaVariableRead,
    ProcessSchemaVariableUpdate,
)
from app.schemas.template import TemplateRead


class SchemaService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_schemas(self) -> list[ProcessSchemaRead]:
        result = await self.session.execute(self._schema_statement().order_by(ProcessSchema.created_at.desc()))
        schemas = result.scalars().unique().all()
        return [ProcessSchemaRead.model_validate(schema) for schema in schemas]

    async def get_schema(self, schema_id: str) -> ProcessSchemaRead:
        schema = await self._get_schema_or_404(schema_id)
        return ProcessSchemaRead.model_validate(schema)

    async def create_schema(self, payload: ProcessSchemaCreate) -> ProcessSchemaRead:
        schema = ProcessSchema(name=payload.name.strip(), description=payload.description.strip() if payload.description else None)
        self.session.add(schema)
        await self.session.commit()
        schema = await self._get_schema_or_404(schema.id)
        return ProcessSchemaRead.model_validate(schema)

    async def delete_schema(self, schema_id: str) -> None:
        schema = await self._get_schema_or_404(schema_id)
        await self.session.delete(schema)
        await self.session.commit()

    async def add_role(self, schema_id: str, payload: ProcessSchemaRoleCreate) -> ProcessSchemaRoleRead:
        schema = await self._get_schema_or_404(schema_id)
        role = ProcessSchemaRole(
            schema_id=schema.id,
            role_name=payload.role_name.strip(),
            display_name=payload.display_name.strip(),
            order_index=payload.order_index,
        )
        self.session.add(role)
        await self.session.commit()
        return ProcessSchemaRoleRead(id=role.id, role_name=role.role_name, display_name=role.display_name, order_index=role.order_index, variables=[])

    async def delete_role(self, role_id: str) -> None:
        role = await self._get_role_or_404(role_id)
        await self.session.delete(role)
        await self.session.commit()

    async def add_variable(self, schema_id: str, payload: ProcessSchemaVariableCreate) -> ProcessSchemaVariableRead:
        schema = await self._get_schema_or_404(schema_id)
        role = await self._get_role_or_404(str(payload.role_id))
        if role.schema_id != schema.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role does not belong to schema")

        readable_by_roles = [role_name for role_name in payload.readable_by_roles if role_name and role_name != role.role_name]
        variable = ProcessSchemaVariable(
            schema_id=schema.id,
            role_id=role.id,
            name=payload.name.strip(),
            label=payload.label.strip(),
            type=payload.type.strip(),
            required=payload.required,
            readable_by_roles=readable_by_roles,
            order_index=payload.order_index,
        )
        self.session.add(variable)
        await self.session.commit()
        return ProcessSchemaVariableRead(
            id=variable.id,
            name=variable.name,
            label=variable.label,
            type=variable.type,
            required=variable.required,
            readable_by_roles=variable.readable_by_roles,
            order_index=variable.order_index,
            role_id=variable.role_id,
        )

    async def update_variable(self, var_id: str, payload: ProcessSchemaVariableUpdate) -> ProcessSchemaVariableRead:
        variable = await self._get_variable_or_404(var_id)
        if payload.label is not None:
            variable.label = payload.label.strip()
        if payload.type is not None:
            variable.type = payload.type.strip()
        if payload.required is not None:
            variable.required = payload.required
        if payload.readable_by_roles is not None:
            variable.readable_by_roles = [role_name for role_name in payload.readable_by_roles if role_name and role_name != variable.role.role_name]
        if payload.order_index is not None:
            variable.order_index = payload.order_index
        await self.session.commit()
        return ProcessSchemaVariableRead(
            id=variable.id,
            name=variable.name,
            label=variable.label,
            type=variable.type,
            required=variable.required,
            readable_by_roles=variable.readable_by_roles,
            order_index=variable.order_index,
            role_id=variable.role_id,
        )

    async def delete_variable(self, var_id: str) -> None:
        variable = await self._get_variable_or_404(var_id)
        await self.session.delete(variable)
        await self.session.commit()

    async def link_schema_to_template(self, template_id: str, schema_id: str | None) -> TemplateRead:
        template = await self._get_template_or_404(template_id)
        if schema_id is not None:
            await self._get_schema_or_404(schema_id)
        # store schema_id as string (models use String(36)); handle UUID input from Pydantic
        template.schema_id = str(schema_id) if schema_id is not None else None
        await self.session.commit()
        template = await self._get_template_or_404(template_id)
        return TemplateRead.model_validate(template)

    def _schema_statement(self):
        return select(ProcessSchema).options(selectinload(ProcessSchema.roles).selectinload(ProcessSchemaRole.variables))

    async def _get_schema_or_404(self, schema_id: str) -> ProcessSchema:
        # Ensure schema_id is a string to avoid UUID vs VARCHAR comparison issues
        schema_id_str = str(schema_id) if schema_id is not None else schema_id
        result = await self.session.execute(self._schema_statement().where(ProcessSchema.id == schema_id_str).limit(1))
        schema = result.scalar_one_or_none()
        if schema is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schema not found")
        return schema

    async def _get_role_or_404(self, role_id: str) -> ProcessSchemaRole:
        result = await self.session.execute(
            select(ProcessSchemaRole)
            .options(selectinload(ProcessSchemaRole.variables), selectinload(ProcessSchemaRole.schema))
            .where(ProcessSchemaRole.id == role_id)
            .limit(1)
        )
        role = result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schema role not found")
        return role

    async def _get_variable_or_404(self, var_id: str) -> ProcessSchemaVariable:
        result = await self.session.execute(
            select(ProcessSchemaVariable)
            .options(selectinload(ProcessSchemaVariable.role).selectinload(ProcessSchemaRole.schema))
            .where(ProcessSchemaVariable.id == var_id)
            .limit(1)
        )
        variable = result.scalar_one_or_none()
        if variable is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schema variable not found")
        return variable

    async def _get_template_or_404(self, template_id: str) -> Template:
        result = await self.session.execute(select(Template).options(selectinload(Template.versions)).where(Template.id == template_id).limit(1))
        template = result.scalar_one_or_none()
        if template is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        return template
