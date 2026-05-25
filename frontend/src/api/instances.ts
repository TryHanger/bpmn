import { axiosInstance } from './axios'
import type { ProcessInstanceResponse, ProcessListResponse, ProcessStartInput, ProcessStateResponse } from '../types/api'

export async function getProcesses(companyId?: string): Promise<ProcessListResponse> {
  const response = await axiosInstance.get<ProcessListResponse>('/api/instances', {
    params: companyId ? { company_id: companyId } : undefined,
  })
  return response.data
}

export async function startProcess(payload: ProcessStartInput): Promise<ProcessInstanceResponse> {
  const response = await axiosInstance.post<ProcessInstanceResponse>('/api/instances/start', payload)
  return response.data
}

export async function getProcessState(instanceId: string): Promise<ProcessStateResponse> {
  const response = await axiosInstance.get<ProcessStateResponse>(`/api/process-instances/${instanceId}/state`)
  return response.data
}
