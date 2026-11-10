import { Canvas } from './components/Canvas'
import { TopIsland } from './components/TopIsland'
import { CommandPalette } from './components/CommandPalette'
import { AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Tour } from './components/tour/Tour'
import { useTourStore } from './store/tourStore'
import { WhatsNewModal } from './components/whatsnew/WhatsNewModal'
import { minorOf, releaseFor, releaseToShow } from './components/whatsnew/releases'
import { getAppVersion, isTauri } from './lib/ipc'
import { Toast } from './components/Toast'
import { QuickCaptureModal } from './components/QuickCaptureModal'
import { useHotkey } from './hooks/useHotkey'
import { useShortcuts } from './hooks/useShortcuts'
import { usePersistence } from './hooks/usePersistence'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useHitRegions } from './hooks/useHitRegions'
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
import { useMonitorProfiles } from './hooks/useMonitorProfiles'
import { useMonitorAnchor } from './hooks/useMonitorAnchor'
import { useHideAll } from './hooks/useHideAll'
// Layer Dock is parked — not shipped in current updates. Code kept in src/dock
// and the Settings → Notch tab is hidden. Re-enable when it's ready.
// import { Dock } from './dock/Dock'
import { useSettingsStore } from './store/settingsStore'
import { useVisibilityStore } from './store/visibilityStore'

export default function App() {
  useHotkey()
  useShortcuts()
  usePersistence()
  useKeyboardShortcuts()
  useHitRegions()
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
  useMonitorProfiles()
  useMonitorAnchor()
  useHideAll()

  const onboarded = useSettingsStore((s) => s.onboarded)
  const visible = useVisibilityStore((s) => s.visible)
  const tourOpen = useTourStore((s) => s.open)
  const tourKind = useTourStore((s) => s.kind)
  const startTour = useTourStore((s) => s.start)
  const whatsNewOpen = useTourStore((s) => s.whatsNewOpen)
  const [appVersion, setAppVersion] = useState('')

  // New users get the guided tour once; it marks them onboarded when it
  // ends (finished or skipped). Replay lives in Settings → About.
  useEffect(() => {
    if (!onboarded) startTour()
  }, [onboarded, startTour])

  // After an update: the "What's new" popup, once per version. Brand-new
  // users get the welcome tour instead, so their version is marked seen.
  useEffect(() => {
    if (!isTauri()) return
    let id: number | undefined
    getAppVersion()
      .then((v) => {
        setAppVersion(v)
        const s = useSettingsStore.getState()
        if (!s.onboarded || !releaseFor(v)) {
          s.setLastSeenVersion(v)
          return
        }
        if (minorOf(s.lastSeenVersion) === minorOf(v)) return
        // Let the desktop settle first; it's a hello, not an interruption.
        id = window.setTimeout(() => useTourStore.getState().openWhatsNew(), 1500)
      })
      .catch(() => {})
    return () => window.clearTimeout(id)
  }, [])
  const whatsNewRelease = appVersion ? releaseToShow(appVersion) : undefined

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* display:none (not just opacity) so every [data-hit] region inside
          collapses to zero size — useHitRegions then naturally reports no
          interactive regions to Rust, making the whole app click-through
          while hidden, with no extra wiring needed. */}
      <div style={{ display: visible ? 'contents' : 'none' }}>
        <Canvas />
        <TopIsland />
        <CommandPalette />
        <QuickCaptureModal />
        <Toast />
      </div>
      <AnimatePresence>{whatsNewOpen && <WhatsNewModal key="whatsnew" />}</AnimatePresence>
      <AnimatePresence>
        {tourOpen &&
          (tourKind === 'whatsnew' && whatsNewRelease ? (
            <Tour
              key="whatsnew-tour"
              steps={whatsNewRelease.tour}
              ns={`whatsNew.${whatsNewRelease.key}.tour`}
              onFinish={() => {}}
            />
          ) : (
            <Tour key="tour" />
          ))}
      </AnimatePresence>
    </div>
  )
}
