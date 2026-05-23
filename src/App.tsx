import { Canvas } from './components/Canvas'
import { TopIsland } from './components/TopIsland'
import { CommandPalette } from './components/CommandPalette'
import { Onboarding } from './components/Onboarding'
import { Toast } from './components/Toast'
import { QuickCaptureModal } from './components/QuickCaptureModal'
import { useHotkey } from './hooks/useHotkey'
import { usePersistence } from './hooks/usePersistence'
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
import { useSettingsStore } from './store/settingsStore'

export default function App() {
  useHotkey()
  usePersistence()
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
