import { axiosInstance } from './axios'
import type { AuditResponse } from '../types/api'

export async function getProcessAudit(processInstanceId: string): Promise<AuditResponse> {
  const response = await axiosInstance.get<AuditResponse>(`/api/audit/${processInstanceId}`)
  console.log('audit tasks with remarks:', response.data.tasks?.map((task) => ({
    id: task.activityId,
    remarks: task.remarks,
  })))
  return response.data
}