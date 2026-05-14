import { axiosInstance } from './axios'
import type { RoleCreateInput, RoleResponse } from '../types/api'

export async function getRoles(companyId: string): Promise<RoleResponse[]> {
  const response = await axiosInstance.get<RoleResponse[]>('/api/roles', {
    params: { company_id: companyId },
  })
  return response.data
}

export async function createRole(payload: RoleCreateInput): Promise<RoleResponse> {
  const response = await axiosInstance.post<RoleResponse>('/api/roles', payload)
  return response.data
}
