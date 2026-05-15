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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_34%),radial-gradient(circle_at_right,_rgba(16,185,129,0.14),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 p-4 lg:p-6">
        <aside className="hidden w-64 shrink-0 flex-col rounded-3xl border border-white/70 bg-white/80 p-4 shadow-xl shadow-slate-900/5 backdrop-blur lg:flex">
          <div className="mb-8 rounded-2xl bg-slate-900 px-4 py-4 text-white">
            <div className="text-xs uppercase tracking-[0.35em] text-slate-300">Workflow</div>
            <div className="mt-2 text-xl font-semibold">BPM Manager</div>
          </div>
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'rounded-2xl px-4 py-3 text-sm font-medium transition',
                    isActive ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/15' : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex items-center justify-between rounded-3xl border border-white/70 bg-white/80 px-4 py-4 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Current user</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{user?.email ?? 'Guest'}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Выйти
            </button>
          </header>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  )
}
