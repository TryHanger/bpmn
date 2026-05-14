import { useEffect, useState } from 'react'

import { toastEventName, type ToastPayload } from '../lib/toast'

interface ToastItem extends ToastPayload {
  id: number
}

const TOAST_CLASSES: Record<NonNullable<ToastPayload['tone']>, string> = {
  info: 'border-slate-200 bg-white/95 text-slate-900',
  success: 'border-emerald-200 bg-emerald-50/95 text-emerald-950',
  error: 'border-rose-200 bg-rose-50/95 text-rose-950',
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ToastPayload>
      const id = window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id))
      }, 3500)
      setToasts((current) => [...current, { id, message: customEvent.detail.message }])
    }

    window.addEventListener(toastEventName(), handler)
    return () => window.removeEventListener(toastEventName(), handler)
  }, [])

  return (
    <div className="fixed right-4 top-4 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg shadow-slate-900/10 backdrop-blur ${TOAST_CLASSES[toast.tone ?? 'info']}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
