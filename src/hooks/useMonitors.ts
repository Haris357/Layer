import { useEffect } from 'react'
import { useMonitorStore } from '../store/monitorStore'

// Keeps the monitor layout fresh: on mount, on window resize (covers DPI /
// virtual-desktop changes), and on a slow poll to catch monitors being
// plugged in or removed (there's no DOM event for that).
export function useMonitors(): void {
  const refresh = useMonitorStore((s) => s.refresh)
  useEffect(() => {
    refresh()
    const onResize = () => refresh()
    window.addEventListener('resize', onResize)
    const id = window.setInterval(refresh, 5000)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearInterval(id)
    }
  }, [refresh])
}
