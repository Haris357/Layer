import { Canvas } from './components/Canvas'
import { TopIsland } from './components/TopIsland'
import { CommandPalette } from './components/CommandPalette'
import { Onboarding } from './components/Onboarding'
import { Toast } from './components/Toast'
import { useHotkey } from './hooks/useHotkey'
import { usePersistence } from './hooks/usePersistence'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useHitRegions } from './hooks/useHitRegions'
import { useResponsive } from './hooks/useResponsive'
import { useTheme } from './hooks/useTheme'
import { useStartup } from './hooks/useStartup'
import { useSettingsStore } from './store/settingsStore'

export default function App() {
  useHotkey()
  usePersistence()
  useKeyboardShortcuts()
  useHitRegions()
  useResponsive()
  useTheme()
  useStartup()

  const onboarded = useSettingsStore((s) => s.onboarded)

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas />
      <TopIsland />
      <CommandPalette />
      <Toast />
      {!onboarded && <Onboarding />}
    </div>
  )
}
