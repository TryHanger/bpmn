import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'

export function ProtectedRoute() {
  const user = useAuth((state) => state.user)
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
