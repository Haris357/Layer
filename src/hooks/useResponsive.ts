import { useEffect } from 'react'
import { useCanvasStore } from '../store/canvasStore'

export function useResponsive(): void {
  const hydrated = useCanvasStore((s) => s.hydrated)
  const clampViewport = useCanvasStore((s) => s.clampViewport)

  useEffect(() => {
    if (!hydrated) return
    const apply = () =>
      clampViewport(window.innerWidth, window.innerHeight)
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [hydrated, clampViewport])
}
