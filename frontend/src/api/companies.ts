import { axiosInstance } from './axios'
import type { CompanyCreateInput, CompanyResponse } from '../types/api'

export async function getCompanies(): Promise<CompanyResponse[]> {
  const response = await axiosInstance.get<CompanyResponse[]>('/api/companies')
  return response.data
}

export async function createCompany(payload: CompanyCreateInput): Promise<CompanyResponse> {
  const response = await axiosInstance.post<CompanyResponse>('/api/companies', payload)
  return response.data
}
