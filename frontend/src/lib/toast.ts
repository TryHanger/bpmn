export interface ToastPayload {
  message: string
}

const TOAST_EVENT = 'app-toast'

export function showToast(message: string): void {
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message } }))
}

export function toastEventName(): string {
  return TOAST_EVENT
}
