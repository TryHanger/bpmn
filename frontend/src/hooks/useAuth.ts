import { useAuthStore } from '../store/authStore'

export function useAuth<T>(selector: (state: ReturnType<typeof useAuthStore.getState>) => T): T {
  return useAuthStore(selector)
}
