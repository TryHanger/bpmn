import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'

import { login } from '../api/auth'
import { useAuth } from '../hooks/useAuth'
import { showToast } from '../lib/toast'
import type { UserResponse } from '../types/api'

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuth((state) => state.setAuth)
  const [phone, setPhone] = useState('')

  const loginMutation = useMutation({
    mutationFn: login,
  })

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    loginMutation.reset()

    try {
      const data = await loginMutation.mutateAsync({ phone })
      const user: UserResponse = data.user ?? {
        id: phone,
        email: phone,
        role: 'employee',
        employee_id: null,
        company_id: null,
      }
      setAuth(user, data.access_token)
      showToast('Вход выполнен')
      navigate('/processes', { replace: true })
    } catch {
      // mutation state already captures the error for the banner
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_35%),linear-gradient(180deg,_#0f172a_0%,_#1e293b_100%)] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl border border-white/10 bg-white/95 p-8 shadow-2xl shadow-slate-950/30 backdrop-blur"
      >
        <div className="mb-8">
          <div className="text-xs uppercase tracking-[0.45em] text-slate-400">BPM workflow</div>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">Вход в систему</h1>
          <p className="mt-2 text-sm text-slate-500">Введите номер телефона сотрудника для входа.</p>
        </div>

        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Номер телефона</span>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
            required
          />
        </label>

        {loginMutation.isError ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось выполнить вход: {loginMutation.error instanceof Error ? loginMutation.error.message : 'ошибка запроса'}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loginMutation.isPending ? 'Входим...' : 'Войти по телефону'}
        </button>
      </form>
    </div>
  )
}
