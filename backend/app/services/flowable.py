from __future__ import annotations

from dataclasses import dataclass

import httpx


@dataclass(slots=True)
class FlowableDeploymentResult:
    deployment_id: str
    deployment_name: str
    deployment_payload: dict
    process_definition: dict


class FlowableClient:
    def __init__(self, base_url: str, username: str, password: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.auth = (username, password)

    async def get_process_definition(self, definition_id: str) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.get(f"/service/repository/process-definitions/{definition_id}")
            response.raise_for_status()
            return response.json()

    async def get_process_definition_xml(self, definition_id: str) -> str:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.get(f"/service/repository/process-definitions/{definition_id}/resourcedata")
            response.raise_for_status()
            return response.text

    async def deploy_process(self, *, xml_bytes: bytes, file_name: str, deployment_name: str) -> FlowableDeploymentResult:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=60.0) as client:
            deployment_response = await client.post(
                "/service/repository/deployments",
                data={"name": deployment_name},
                files={"file": (file_name, xml_bytes, "application/xml")},
            )
            deployment_response.raise_for_status()
            deployment_payload = deployment_response.json()

            deployment_id = deployment_payload["id"]
            definitions_response = await client.get(
                "/service/repository/process-definitions",
                params={"deploymentId": deployment_id},
            )
            definitions_response.raise_for_status()
            definitions_payload = definitions_response.json()
            process_definition = (definitions_payload.get("data") or [])[0]
            if not process_definition:
                raise ValueError("Flowable deployment finished but process definition was not returned")

            return FlowableDeploymentResult(
                deployment_id=deployment_id,
                deployment_name=deployment_payload.get("name") or deployment_name,
                deployment_payload=deployment_payload,
                process_definition=process_definition,
            )

    async def migrate_process_instance(self, process_instance_id: str, *, to_process_definition_id: str) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=60.0) as client:
            response = await client.post(
                f"/service/runtime/process-instances/{process_instance_id}/migrate",
                json={"toProcessDefinitionId": to_process_definition_id},
            )
            response.raise_for_status()
            if not response.content:
                return {}
            return response.json()

    async def change_process_state(
        self,
        process_instance_id: str,
        *,
        cancel_activity_ids: list[str],
        start_activity_ids: list[str],
    ) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=60.0) as client:
            response = await client.post(
                f"/service/runtime/process-instances/{process_instance_id}/change-state",
                json={
                    "cancelActivityIds": cancel_activity_ids,
                    "startActivityIds": start_activity_ids,
                },
            )
            response.raise_for_status()
            if not response.content:
                return {}
            return response.json()

    async def start_process(
        self,
        *,
        process_definition_key: str,
        business_key: str,
        initiator_user_id: str,
        variables: list[dict] | None = None,
    ) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=60.0) as client:
            response = await client.post(
                "/service/runtime/process-instances",
                json={
                    "processDefinitionKey": process_definition_key,
                    "businessKey": business_key,
                    "variables": variables or [],
                },
            )
            response.raise_for_status()
            return response.json()

    async def get_historic_process_instance(self, process_instance_id: str) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.get(f"/service/history/historic-process-instances/{process_instance_id}")
            response.raise_for_status()
            return response.json()

    async def get_runtime_task(self, task_id: str) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.get(f"/service/runtime/tasks/{task_id}")
            # If task not found Flowable returns 404 — propagate as HTTPStatusError
            response.raise_for_status()
            if not response.content:
                return {}
            return response.json()

    async def terminate_process_instance(self, process_instance_id: str) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.delete(f"/service/runtime/process-instances/{process_instance_id}")
            response.raise_for_status()
            if not response.content:
                return {}
            return response.json()

    async def get_process_instance_variables(self, process_instance_id: str) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.get(f"/service/runtime/process-instances/{process_instance_id}/variables")
            response.raise_for_status()
            if not response.content:
                return {"data": []}
            return response.json()

    async def list_historic_activity_instances(self, process_instance_id: str, *, start: int = 0, size: int = 100) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.get(
                "/service/history/historic-activity-instances",
                params={"processInstanceId": process_instance_id, "start": start, "size": size},
            )
            response.raise_for_status()
            return response.json()

    async def list_historic_variable_instances(self, process_instance_id: str) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.get(
                "/service/history/historic-variable-instances",
                params={"processInstanceId": process_instance_id},
            )
            response.raise_for_status()
            return response.json()

    async def list_runtime_tasks(self, params: dict | None = None) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.get("/service/runtime/tasks", params=params)
            response.raise_for_status()
            return response.json()

    # async def claim_task(self, task_id: str, assignee: str) -> dict:
    #     async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
    #         response = await client.post(
    #             f"/service/runtime/tasks/{task_id}",
    #             json={"action": "claim", "assignee": assignee},
    #         )
    #         response.raise_for_status()
    #         # Flowable may return 204 No Content — handle empty body gracefully
    #         if not response.content:
    #             return {}
    #         return response.json()
    
    async def claim_task(self, task_id: str, assignee: str) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.put(
                f"/service/runtime/tasks/{task_id}",
                json={"assignee": assignee},
            )
            response.raise_for_status()

            if not response.content:
                return {}
            return response.json()

    async def complete_task(self, task_id: str, *, variable_name: str, approved: bool, variables: list[dict] | None = None) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.post(
                f"/service/runtime/tasks/{task_id}",
                json={
                    "action": "complete",
                    "variables": ([{"name": variable_name, "value": approved}] + (variables or [])),
                },
            )
            
            if response.status_code >= 400:
                import logging
                logging.error(f"Flowable error {response.status_code}: {response.text}")
            response.raise_for_status()
            
            # Flowable may respond with empty body for successful complete; return empty dict in that case
            if not response.content:
                return {}
            return response.json()

    async def list_runtime_executions(self, process_instance_id: str) -> dict:
        """Get all active execution paths for a process instance."""
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.get(
                "/service/runtime/executions",
                params={"processInstanceId": process_instance_id},
            )
            response.raise_for_status()
            return response.json()

    async def list_historic_task_instances(self, process_instance_id: str) -> dict:
        """Get all historic task instances for a process instance."""
        async with httpx.AsyncClient(base_url=self.base_url, auth=self.auth, timeout=30.0) as client:
            response = await client.get(
                "/service/history/historic-task-instances",
                params={"processInstanceId": process_instance_id},
            )
            response.raise_for_status()
            return response.json()
