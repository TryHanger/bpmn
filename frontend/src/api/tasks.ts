import { axiosInstance } from './axios'
import type { TaskBoardResponse, TaskCompleteInput, TaskContextResponse } from '../types/api'

export async function getMyTasks(): Promise<TaskBoardResponse> {
  const response = await axiosInstance.get<TaskBoardResponse>('/api/tasks/my')
  return response.data
}

export async function claimTask(taskId: string): Promise<void> {
  await axiosInstance.post(`/api/tasks/${taskId}/claim`)
}

export async function completeTask(taskId: string, payload: TaskCompleteInput): Promise<void> {
  await axiosInstance.post(`/api/tasks/${taskId}/complete`, payload)
}

export function rejectTask(taskId: string): Promise<{ status: string; process_instance_id: string }> {
  return axiosInstance.post(`/api/tasks/${taskId}/reject`).then((response) => response.data)
}

export async function completeTaskWithRemark(
  taskId: string,
  payload: {
    task_definition_key: string
    task_name?: string
    remark: string
    variables?: Array<{ name: string; value: unknown; type: string }>
  },
): Promise<void> {
  await axiosInstance.post(`/api/tasks/${taskId}/complete-with-remark`, payload)
}

export async function getTaskContext(taskId: string): Promise<TaskContextResponse> {
  const response = await axiosInstance.get<TaskContextResponse>(`/api/tasks/${taskId}/context`)
  return response.data
}
