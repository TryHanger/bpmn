import { axiosInstance } from './axios'
import type { EmployeeCreateInput, EmployeeResponse } from '../types/api'

export async function getEmployees(companyId: string): Promise<EmployeeResponse[]> {
  const response = await axiosInstance.get<EmployeeResponse[]>('/api/employees', {
    params: { company_id: companyId },
  })
  return response.data
}

export async function createEmployee(payload: EmployeeCreateInput): Promise<EmployeeResponse> {
  const response = await axiosInstance.post<EmployeeResponse>('/api/employees', payload)
  return response.data
}
