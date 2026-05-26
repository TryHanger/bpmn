import { axiosInstance } from './axios'
import type { AuditResponse } from '../types/api'

export async function getProcessAudit(processInstanceId: string): Promise<AuditResponse> {
  const response = await axiosInstance.get<AuditResponse>(`/api/audit/${processInstanceId}`)
  return response.data
}