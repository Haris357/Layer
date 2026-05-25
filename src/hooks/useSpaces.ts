import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useCanvasStore } from '../store/canvasStore'

// Listens for the "cycle-space" event (Ctrl+Shift+E hotkey or the hot corner,
// both emitted from Rust) and switches to the next space.
export function useSpaces(): void {
  useEffect(() => {
    const un = listen('cycle-space', () =>
      useCanvasStore.getState().cycleSpace(1),
    )
    return () => {
      un.then((f) => f()).catch(() => {})
    }
  }, [])
}
