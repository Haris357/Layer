import { useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'

interface SnapResult {
  grid: [number, number]
  active: boolean
}

export function useSnapToGrid(): SnapResult {
  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapEnabled = useSettingsStore((s) => s.snapEnabled)
  const [altHeld, setAltHeld] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const active = snapEnabled && !altHeld
  return {
    grid: active ? [gridSize, gridSize] : [1, 1],
    active,
  }
}
