import { create } from 'zustand'

// Tiny non-persisted flag so Settings can show a spinner while the wallpaper
// accent is being sampled.
interface ThemeStatus {
  wallpaperLoading: boolean
  setWallpaperLoading: (v: boolean) => void
}

export const useThemeStatus = create<ThemeStatus>((set) => ({
  wallpaperLoading: false,
  setWallpaperLoading: (wallpaperLoading) => set({ wallpaperLoading }),
}))
