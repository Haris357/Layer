import { useEffect, useRef } from 'react'
import { readText } from '@tauri-apps/plugin-clipboard-manager'
import { useClipboardStore } from '../store/clipboardStore'
import { isTauri } from '../lib/ipc'

// Polls the OS clipboard for text every 1.5s. New / changed text is
// pushed onto the clipboardStore (deduped + capped). Lives once at the
// app level — every Clipboard widget reads from the same store.
export function useClipboardWatcher(): void {
  const last = useRef('')
  useEffect(() => {
    if (!isTauri()) return
    let alive = true
    const tick = async () => {
      if (!alive) return
      try {
        const text = await readText()
        if (text && text !== last.current) {
          last.current = text
          useClipboardStore.getState().push(text)
        }
      } catch {
        /* ignore — clipboard may briefly be locked by other apps */
      }
    }
    tick()
    const id = window.setInterval(tick, 1500)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])
}
