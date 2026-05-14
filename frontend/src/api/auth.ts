import { axiosInstance } from './axios'
import type { LoginRequest, TokenResponse, UserCreateRequest, UserResponse } from '../types/api'

export async function login(payload: LoginRequest): Promise<TokenResponse> {
  const response = await axiosInstance.post<TokenResponse>('/api/auth/login', payload)
  return response.data
}

export async function register(payload: UserCreateRequest): Promise<UserResponse> {
  const response = await axiosInstance.post<UserResponse>('/api/auth/register', payload)
  return response.data
}

export async function me(): Promise<UserResponse> {
  const response = await axiosInstance.get<UserResponse>('/api/auth/me')
  return response.data
}

export async function logout(): Promise<void> {
  await axiosInstance.post('/api/auth/logout')
}
