import { Canvas } from './components/Canvas'
import { TopIsland } from './components/TopIsland'
import { CommandPalette } from './components/CommandPalette'
import { Onboarding } from './components/Onboarding'
import { Toast } from './components/Toast'
import { QuickCaptureModal } from './components/QuickCaptureModal'
import { useHotkey } from './hooks/useHotkey'
import { usePersistence } from './hooks/usePersistence'
import { useSync } from './hooks/useSync'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useHitRegions } from './hooks/useHitRegions'
import { useResponsive } from './hooks/useResponsive'
import { useTheme } from './hooks/useTheme'
import { useStartup } from './hooks/useStartup'
import { useUpdateNotifications } from './hooks/useUpdateNotifications'
import { useGalleryNotifications } from './hooks/useGalleryNotifications'
import { useBatteryNotifications } from './hooks/useBatteryNotifications'
import { useCalendarReminders } from './hooks/useCalendarReminders'
import { useCalendarSources } from './hooks/useCalendarSources'
import { useClipboardWatcher } from './hooks/useClipboardWatcher'
import { useScreensaver } from './hooks/useScreensaver'
import { useWallpaperAccent } from './hooks/useWallpaperAccent'
import { useSpaces } from './hooks/useSpaces'
import { useHotcorner } from './hooks/useHotcorner'
import { useMonitors } from './hooks/useMonitors'
// Layer Dock is parked — not shipped in current updates. Code kept in src/dock
// and the Settings → Notch tab is hidden. Re-enable when it's ready.
// import { Dock } from './dock/Dock'
import { useSettingsStore } from './store/settingsStore'

export default function App() {
  useHotkey()
  usePersistence()
  useSync()
  useKeyboardShortcuts()
  useHitRegions()
  useResponsive()
  useTheme()
  useStartup()
  useUpdateNotifications()
  useGalleryNotifications()
  useBatteryNotifications()
  useCalendarReminders()
  useCalendarSources()
  useClipboardWatcher()
  useScreensaver()
  useWallpaperAccent()
  useSpaces()
  useHotcorner()
  useMonitors()

  const onboarded = useSettingsStore((s) => s.onboarded)

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas />
      <TopIsland />
      <CommandPalette />
      <QuickCaptureModal />
      <Toast />
      {!onboarded && <Onboarding />}
    </div>
  )
}
