import { useEffect } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useThemeStatus } from '../store/themeStatusStore'
import { getWallpaperAccent, isTauri } from '../lib/ipc'

// Black or white text for legibility on top of the given accent colour.
function onAccentColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.6 ? '#141416' : '#ffffff'
}

// When enabled, tints Layer's accent to match the desktop wallpaper. Re-samples
// on window focus and every few minutes so it follows wallpaper changes.
export function useWallpaperAccent(): void {
  const enabled = useSettingsStore((s) => s.wallpaperAccent)
  useEffect(() => {
    const root = document.documentElement
    const clear = () => {
      root.style.removeProperty('--accent')
      root.style.removeProperty('--on-accent')
    }
    const setLoading = useThemeStatus.getState().setWallpaperLoading
    if (!enabled || !isTauri()) {
      setLoading(false)
      clear()
      return
    }
    let cancelled = false
    const apply = () => {
      setLoading(true)
      getWallpaperAccent()
        .then((hex) => {
          if (cancelled || !/^#[0-9a-f]{6}$/i.test(hex)) return
          root.style.setProperty('--accent', hex)
          root.style.setProperty('--on-accent', onAccentColor(hex))
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    apply()
    const onFocus = () => apply()
    window.addEventListener('focus', onFocus)
    const id = window.setInterval(apply, 5 * 60 * 1000)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      window.clearInterval(id)
    }
  }, [enabled])
}
