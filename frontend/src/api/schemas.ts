import { axiosInstance } from './axios'
import type { ProcessSchemaRead } from '../types/api'

export const getSchemas = () =>
  axiosInstance.get<ProcessSchemaRead[]>('/api/schemas').then((r) => r.data)

export const getSchema = (id: string) =>
  axiosInstance.get<ProcessSchemaRead>(`/api/schemas/${id}`).then((r) => r.data)

export const createSchema = (data: { name: string; description?: string }) =>
  axiosInstance.post<ProcessSchemaRead>('/api/schemas', data).then((r) => r.data)

export const deleteSchema = (id: string) =>
  axiosInstance.delete(`/api/schemas/${id}`)

export const addRole = (schemaId: string, data: { role_name: string; display_name: string; order_index?: number }) =>
  axiosInstance.post(`/api/schemas/${schemaId}/roles`, data).then((r) => r.data)

export const deleteRole = (roleId: string) =>
  axiosInstance.delete(`/api/schemas/roles/${roleId}`)

export const addVariable = (schemaId: string, data: {
  role_id: string
  name: string
  label: string
  type: string
  required?: boolean
  readable_by_roles?: string[]
  order_index?: number
}) => axiosInstance.post(`/api/schemas/${schemaId}/variables`, data).then((r) => r.data)

export const updateVariable = (varId: string, data: Partial<{
  label: string
  type: string
  required: boolean
  readable_by_roles: string[]
  order_index: number
}>) => axiosInstance.put(`/api/schemas/variables/${varId}`, data).then((r) => r.data)

export const deleteVariable = (varId: string) =>
  axiosInstance.delete(`/api/schemas/variables/${varId}`)