import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 px-4 py-8 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white p-6 shadow-2xl shadow-slate-950/20">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
            Закрыть
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  )
}
