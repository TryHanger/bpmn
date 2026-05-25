import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { logout } from '../api/auth'
import { useAuth } from '../hooks/useAuth'
import { showToast } from '../lib/toast'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { to: '/processes', label: 'Процессы' },
  { to: '/templates', label: 'Шаблоны' },
  { to: '/schemas', label: 'Схемы процессов' },
  { to: '/tasks', label: 'Задачи' },
  { to: '/companies', label: 'Компании' },
  { to: '/roles', label: 'Роли' },
  { to: '/employees', label: 'Сотрудники' },
]

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)
  const clearAuth = useAuth((state) => state.clearAuth)

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      clearAuth()
      showToast('Выход выполнен')
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_34%),radial-gradient(circle_at_right,_rgba(16,185,129,0.14),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
      <header className="flex shrink-0 flex-col gap-4 border-b border-white/70 bg-white/85 px-4 py-4 shadow-xl shadow-slate-900/5 backdrop-blur lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20">
            🔷
          </div>
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.32em] text-slate-500">Workflow</div>
            <div className="text-lg font-semibold text-slate-950">BPM Manager</div>
          </div>
        </div>

        <nav className="flex flex-1 items-center gap-2 overflow-x-auto pb-1 lg:justify-center lg:pb-0">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/15' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 self-end lg:self-auto">
          <div className="text-right">
            <div className="text-xs uppercase tracking-[0.32em] text-slate-400">Current user</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{user?.email ?? 'Guest'}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Выход
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="flex h-full w-full flex-col">{children}</div>
      </main>
    </div>
  )
}
