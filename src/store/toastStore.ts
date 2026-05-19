import { create } from 'zustand'

interface ToastState {
  message: string | null
  show: (message: string) => void
}

let timer: ReturnType<typeof setTimeout> | null = null

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    set({ message })
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => set({ message: null }), 3400)
  },
}))
