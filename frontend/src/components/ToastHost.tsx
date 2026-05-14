import { useEffect, useState } from 'react'

import { toastEventName, type ToastPayload } from '../lib/toast'

interface ToastItem extends ToastPayload {
  id: number
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
          className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-sm font-medium text-slate-900 shadow-lg shadow-slate-900/10 backdrop-blur"
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
