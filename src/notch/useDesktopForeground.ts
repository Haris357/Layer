import { useEffect, useState } from 'react'
import { isDesktopForeground, isTauri } from '../lib/ipc'

// Polls whether the Windows desktop (shell) is the foreground surface, so the
// notch can show its "edit widgets" button only when you're on the desktop.
export function useDesktopForeground(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!isTauri()) return
    let alive = true
    const run = () => {
      if (document.hidden) return
      isDesktopForeground()
        .then((v) => alive && setOn(v))
        .catch(() => {})
    }
    run()
    const id = window.setInterval(run, 700)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])
  return on
}
