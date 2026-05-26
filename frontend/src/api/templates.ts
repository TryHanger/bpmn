import { axiosInstance } from './axios'
import type {
  DeployTemplateResponse,
  DeployWithMigrationResponse,
  TemplateListResponse,
  TemplateRead,
  TemplateVersionListResponse,
} from '../types/api'

export async function getTemplates(): Promise<TemplateRead[]> {
  const response = await axiosInstance.get<TemplateListResponse>('/api/templates')
  return response.data.items
}

export async function getTemplateVersions(templateId: string): Promise<TemplateVersionListResponse['items']> {
  const response = await axiosInstance.get<TemplateVersionListResponse>(`/api/templates/${templateId}/versions`)
  return response.data.items
}

export async function uploadTemplate(file: File, templateName?: string): Promise<TemplateRead> {
  const formData = new FormData()
  formData.append('file', file)
  if (templateName) {
    formData.append('template_name', templateName)
  }

  const response = await axiosInstance.post<TemplateRead>('/api/templates/upload', formData)
  return response.data
}

export async function deployTemplate(templateId: string): Promise<DeployTemplateResponse> {
  const formData = new FormData()
  const response = await axiosInstance.post<DeployTemplateResponse>(`/api/templates/${templateId}/deploy`, formData)
  return response.data
}

export async function deployTemplateWithMigration(
  templateId: string,
  deploymentName?: string,
): Promise<DeployWithMigrationResponse> {
  const response = await axiosInstance.post<DeployWithMigrationResponse>(`/api/templates/${templateId}/deploy-with-migration`, {
    deployment_name: deploymentName ?? null,
  })
  return response.data
}

export async function deleteTemplateVersion(versionId: string): Promise<void> {
  await axiosInstance.delete(`/api/templates/versions/${versionId}`)
}

export async function linkSchemaToTemplate(templateId: string, schemaId: string | null): Promise<TemplateRead> {
  const response = await axiosInstance.patch<TemplateRead>(`/api/templates/${templateId}/schema`, { schema_id: schemaId })
  return response.data
}