export interface ToastPayload {
  message: string
  tone?: 'info' | 'success' | 'error'
}

const TOAST_EVENT = 'app-toast'

export function showToast(message: string, tone: ToastPayload['tone'] = 'info'): void {
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message, tone } }))
}

export function toastEventName(): string {
  return TOAST_EVENT
}
