import { axiosInstance } from './axios'
import type { TemplateListResponse, TemplateResponse } from '../types/api'

export async function getTemplates(): Promise<TemplateResponse[]> {
  const response = await axiosInstance.get<TemplateListResponse>('/api/templates')
  return response.data.items
}