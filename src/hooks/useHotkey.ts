import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useCanvasStore } from '../store/canvasStore'
import { isTauri, setFront } from '../lib/ipc'

export function useHotkey(): void {
  const toggleMode = useCanvasStore((s) => s.toggleMode)
  const mode = useCanvasStore((s) => s.mode)

  useEffect(() => {
    if (!isTauri()) return
    const unlisten = listen('toggle-mode', () => {
      toggleMode()
    })
    return () => {
      unlisten.then((fn) => fn()).catch(() => {})
    }
  }, [toggleMode])

  useEffect(() => {
    if (!isTauri()) return
    setFront(mode === 'edit').catch(() => {})
  }, [mode])
}
