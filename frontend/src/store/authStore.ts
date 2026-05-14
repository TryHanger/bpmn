import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { UserResponse } from '../types/api'

interface AuthState {
  user: UserResponse | null
  accessToken: string | null
  setAuth: (user: UserResponse, token: string) => void
  setAccessToken: (token: string | null) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (user, token) => set({ user, accessToken: token }),
      setAccessToken: (token) => set({ accessToken: token }),
      clearAuth: () => set({ user: null, accessToken: null }),
    }),
    {
      name: 'bpmn-auth-store',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ user: state.user }),
    },
  ),
)
