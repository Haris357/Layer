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
import { useClipboardWatcher } from './hooks/useClipboardWatcher'
import { useScreensaver } from './hooks/useScreensaver'
import { useWallpaperAccent } from './hooks/useWallpaperAccent'
import { useSpaces } from './hooks/useSpaces'
import { useHotcorner } from './hooks/useHotcorner'
import { useMonitors } from './hooks/useMonitors'
import { AmbientBackground } from './components/AmbientBackground'
import { Dock } from './dock/Dock'
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
  useClipboardWatcher()
  useScreensaver()
  useWallpaperAccent()
  useSpaces()
  useHotcorner()
  useMonitors()

  const onboarded = useSettingsStore((s) => s.onboarded)
  const dockEnabled = useSettingsStore((s) => s.notchEnabled)

  return (
    <div className="relative h-full w-full overflow-hidden">
      <AmbientBackground />
      <Canvas />
      <TopIsland />
      <CommandPalette />
      <QuickCaptureModal />
      <Toast />
      {dockEnabled && <Dock />}
      {!onboarded && <Onboarding />}
    </div>
  )
}
