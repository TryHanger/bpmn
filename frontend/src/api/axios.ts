import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

import { useAuthStore } from '../store/authStore'

const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8083'

export const axiosInstance = axios.create({
  baseURL,
  withCredentials: true,
})

type AuthRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean }

axiosInstance.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  config.withCredentials = true
  return config
})

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AuthRequestConfig | undefined
    if (!originalRequest || error.response?.status !== 401) {
      return Promise.reject(error)
    }

    useAuthStore.getState().clearAuth()
    window.location.assign('/login')
    return Promise.reject(error)
  },
)
