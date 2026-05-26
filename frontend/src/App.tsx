import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useNavigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { Layout } from './components/Layout'
import { PageErrorBoundary } from './components/PageErrorBoundary'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ToastHost } from './components/ToastHost'
import { useAuth } from './hooks/useAuth'
import { CompaniesPage } from './pages/CompaniesPage'
import { EmployeesPage } from './pages/EmployeesPage'
import { AuditPage } from './pages/AuditPage'
import { LoginPage } from './pages/LoginPage'
import { ProcessDetailPage } from './pages/ProcessDetailPage'
import { ProcessesPage } from './pages/ProcessesPage'
import { SchemasPage } from './pages/SchemasPage'
import { RolesPage } from './pages/RolesPage'
import { TaskPage } from './pages/TaskPage'
import { TasksPage } from './pages/TasksPage'
import { TemplatesPage } from './pages/TemplatesPage'

const queryClient = new QueryClient()

function AppBootstrap({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)
  const accessToken = useAuth((state) => state.accessToken)
  const setAccessToken = useAuth((state) => state.setAccessToken)
  const clearAuth = useAuth((state) => state.clearAuth)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (user && !accessToken) {
      setAccessToken(user.email)
    }
    setReady(true)
  }, [accessToken, setAccessToken, user])

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Загрузка...</div>
  }

  return <>{children}</>
}

function ProtectedLayout() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppBootstrap>
        <ToastHost />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<Navigate to="/processes" replace />} />
              <Route path="/companies" element={<PageErrorBoundary><CompaniesPage /></PageErrorBoundary>} />
              <Route path="/roles" element={<PageErrorBoundary><RolesPage /></PageErrorBoundary>} />
              <Route path="/employees" element={<PageErrorBoundary><EmployeesPage /></PageErrorBoundary>} />
              <Route path="/processes" element={<PageErrorBoundary><ProcessesPage /></PageErrorBoundary>} />
              <Route path="/processes/:id" element={<PageErrorBoundary><ProcessDetailPage /></PageErrorBoundary>} />
              <Route path="/audit/:processInstanceId" element={<PageErrorBoundary><AuditPage /></PageErrorBoundary>} />
              <Route path="/schemas" element={<PageErrorBoundary><SchemasPage /></PageErrorBoundary>} />
              <Route path="/templates" element={<PageErrorBoundary><TemplatesPage /></PageErrorBoundary>} />
              <Route path="/tasks" element={<PageErrorBoundary><TasksPage /></PageErrorBoundary>} />
              <Route path="/tasks/:taskId" element={<PageErrorBoundary><TaskPage /></PageErrorBoundary>} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/processes" replace />} />
        </Routes>
      </AppBootstrap>
    </QueryClientProvider>
  )
}
