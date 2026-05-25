import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { save } from '@tauri-apps/plugin-dialog'
import {
  Loader2,
  X,
  SlidersHorizontal,
  Palette,
  MonitorPlay,
  Keyboard,
  Info,
  type LucideIcon,
} from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import { useThemeStatus } from '../store/themeStatusStore'
import {
  captureScreen,
  getAppVersion,
  previewScreensaver,
  quitApp,
  registerHotkey,
  showInFolder,
  resetAll as resetAllFiles,
} from '../lib/ipc'
import { useCanvasStore } from '../store/canvasStore'
import { useToastStore } from '../store/toastStore'
import { getUpdate, installUpdate } from '../lib/updater'
import { Toggle, Slider, FieldRow, Segmented } from './ui'

type TabId = 'general' | 'appearance' | 'screensaver' | 'shortcuts' | 'about'

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'screensaver', label: 'Screensaver', icon: MonitorPlay },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
]

function buildAccelerator(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.shiftKey) mods.push('Shift')
  if (e.altKey) mods.push('Alt')
  if (e.metaKey) mods.push('Super')
  if (mods.length === 0) return null
  const name =
    e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
  return [...mods, name].join('+')
}

function Kbd({ combo }: { combo: string }) {
  return (
    <span className="flex items-center gap-1">
      {combo.split('+').map((k, i) => (
        <kbd
          key={i}
          className="rounded-[5px] border border-[var(--border)] bg-[var(--fill-2)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]"
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[var(--text-tertiary)]">
      {children}
    </div>
  )
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapEnabled = useSettingsStore((s) => s.snapEnabled)
  const hotkey = useSettingsStore((s) => s.hotkey)
  const theme = useSettingsStore((s) => s.theme)
  const screensaverEnabled = useSettingsStore((s) => s.screensaverEnabled)
  const screensaverTheme = useSettingsStore((s) => s.screensaverTheme)
  const setScreensaverTheme = useSettingsStore((s) => s.setScreensaverTheme)
  const wallpaperAccent = useSettingsStore((s) => s.wallpaperAccent)
  const ambientEffects = useSettingsStore((s) => s.ambientEffects)
  const hotCorner = useSettingsStore((s) => s.hotCorner)
  const setGridSize = useSettingsStore((s) => s.setGridSize)
  const setSnapEnabled = useSettingsStore((s) => s.setSnapEnabled)
  const setHotkey = useSettingsStore((s) => s.setHotkey)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setScreensaverEnabled = useSettingsStore((s) => s.setScreensaverEnabled)
  const setWallpaperAccent = useSettingsStore((s) => s.setWallpaperAccent)
  const setAmbientEffects = useSettingsStore((s) => s.setAmbientEffects)
  const setHotCorner = useSettingsStore((s) => s.setHotCorner)
  const wallpaperLoading = useThemeStatus((s) => s.wallpaperLoading)
  const resetCanvas = useCanvasStore((s) => s.resetAll)

  const [tab, setTab] = useState<TabId>('general')
  const [confirmReset, setConfirmReset] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [autostart, setAutostart] = useState(false)
  const [version, setVersion] = useState('1.0.0')
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')

  useEffect(() => {
    isEnabled()
      .then(setAutostart)
      .catch(() => {})
    getAppVersion()
      .then(setVersion)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!capturing) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      const accel = buildAccelerator(e)
      if (!accel) return
      setHotkey(accel)
      registerHotkey(accel).catch(() => {})
      setCapturing(false)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [capturing, setHotkey])

  const toggleAutostart = (value: boolean) => {
    setAutostart(value)
    ;(value ? enable() : disable()).catch(() => {})
  }

  const checkUpdates = async () => {
    setUpdateBusy(true)
    setUpdateMsg('Checking for updates…')
    try {
      const update = await getUpdate()
      if (!update) {
        setUpdateMsg("You're on the latest version.")
        setUpdateBusy(false)
        return
      }
      setUpdateMsg(`Downloading v${update.version}…`)
      await installUpdate(update, (p) =>
        setUpdateMsg(`Downloading v${update.version}… ${p}%`),
      )
      setUpdateMsg('Installing — Layer will restart…')
    } catch {
      setUpdateMsg('Could not check for updates.')
      setUpdateBusy(false)
    }
  }

  const exportImage = async () => {
    const path = await save({
      title: 'Export canvas as image',
      defaultPath: 'layer-canvas.png',
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    })
    if (!path) return
    onClose()
    setTimeout(() => {
      captureScreen(path)
        .then(() =>
          useToastStore.getState().showToast({
            message: 'Canvas exported',
            icon: 'success',
            duration: 7000,
            actions: [
              {
                label: 'Open folder',
                onClick: () => showInFolder(path).catch(() => {}),
              },
            ],
          }),
        )
        .catch(() =>
          useToastStore
            .getState()
            .showToast({ message: 'Export failed', icon: 'error' }),
        )
    }, 250)
  }

  const handleReset = () => {
    resetCanvas()
    resetAllFiles().catch(() => {})
    setConfirmReset(false)
    onClose()
  }

  const ghostBtn =
    'rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]'

  return (
    <div
      data-hit
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="glass flex h-[min(560px,90vh)] w-[min(720px,94vw)] overflow-hidden rounded-[18px] border border-[var(--border)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* sidebar */}
        <div className="flex w-[176px] shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--fill-1)] p-3">
          <div
            className="px-2 pb-3 pt-1 text-[var(--text-primary)]"
            style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.8px' }}
          >
            Settings
          </div>
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-[var(--fill-3)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--fill-2)]'
                }`}
              >
                <t.icon size={15} strokeWidth={2} />
                {t.label}
              </button>
            )
          })}
          <div className="mt-auto px-2 text-[10px] text-[var(--text-tertiary)]">
            Layer v{version}
          </div>
        </div>

        {/* content */}
        <div className="relative flex flex-1 flex-col overflow-y-auto p-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X size={18} />
          </button>

          {tab === 'general' && (
            <div className="flex flex-col gap-5">
              <FieldRow label="Snap widgets to grid">
                <Toggle checked={snapEnabled} onChange={setSnapEnabled} />
              </FieldRow>
              <FieldRow label={`Snap grid size · ${gridSize}px`}>
                <div className="w-[160px]">
                  <Slider
                    value={gridSize}
                    min={8}
                    max={40}
                    onChange={setGridSize}
                  />
                </div>
              </FieldRow>
              <FieldRow label="Launch Layer on startup">
                <Toggle checked={autostart} onChange={toggleAutostart} />
              </FieldRow>
              <FieldRow label="Hot corner switches spaces">
                <Toggle checked={hotCorner} onChange={setHotCorner} />
              </FieldRow>
              <div className="flex flex-col gap-2">
                <SectionTitle>Canvas</SectionTitle>
                <button
                  type="button"
                  onClick={() => exportImage().catch(() => {})}
                  className={ghostBtn}
                >
                  Export canvas as image
                </button>
                <button
                  type="button"
                  onClick={() =>
                    confirmReset ? handleReset() : setConfirmReset(true)
                  }
                  onMouseLeave={() => setConfirmReset(false)}
                  className={
                    confirmReset
                      ? 'rounded-[8px] border border-[var(--danger)] bg-[var(--danger)] px-3 py-2 text-[13px] font-semibold text-white transition-colors'
                      : 'rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13px] font-medium text-[var(--danger)] transition-colors hover:border-[var(--danger)]'
                  }
                >
                  {confirmReset
                    ? 'Click again to clear every widget'
                    : 'Reset canvas'}
                </button>
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <SectionTitle>Theme</SectionTitle>
                <Segmented
                  value={theme}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'system', label: 'System' },
                  ]}
                  onChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
                />
              </div>
              <FieldRow label="Match accent to wallpaper">
                <div className="flex items-center gap-2">
                  {wallpaperLoading && (
                    <Loader2
                      size={13}
                      strokeWidth={2}
                      className="animate-spin text-[var(--text-tertiary)]"
                    />
                  )}
                  <Toggle
                    checked={wallpaperAccent}
                    onChange={setWallpaperAccent}
                  />
                </div>
              </FieldRow>
              <FieldRow label="Ambient background & weather">
                <Toggle checked={ambientEffects} onChange={setAmbientEffects} />
              </FieldRow>
            </div>
          )}

          {tab === 'screensaver' && (
            <div className="flex flex-col gap-5">
              <FieldRow label="Use Layer as my screensaver">
                <Toggle
                  checked={screensaverEnabled}
                  onChange={setScreensaverEnabled}
                />
              </FieldRow>

              <div className="flex flex-col gap-2">
                <SectionTitle>Style</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['ambient', 'Ambient'],
                      ['minimal', 'Minimal'],
                      ['quote', 'Quote'],
                    ] as const
                  ).map(([value, label]) => {
                    const active = screensaverTheme === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setScreensaverTheme(value)}
                        className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors ${
                          active
                            ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                            : 'border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--fill-2)]'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <span className="text-[11.5px] text-[var(--text-tertiary)]">
                  {screensaverTheme === 'minimal'
                    ? 'Just a large clock and date.'
                    : screensaverTheme === 'quote'
                      ? 'A rotating calm line with the time.'
                      : 'Clock, date, live weather and now-playing.'}
                </span>
              </div>

              <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                When idle, Layer fills every screen with the view above. Any key
                or mouse movement dismisses it.
              </p>
              <button
                type="button"
                onClick={() => previewScreensaver().catch(() => {})}
                className={ghostBtn}
              >
                Preview now
              </button>
            </div>
          )}

          {tab === 'shortcuts' && (
            <div className="flex flex-col gap-1">
              <SectionTitle>Keyboard</SectionTitle>
              <div className="mt-1 flex items-center justify-between border-b border-[var(--border)] py-2.5">
                <span className="text-[13px] text-[var(--text-primary)]">
                  Toggle edit mode
                </span>
                <button
                  type="button"
                  onClick={() => setCapturing(true)}
                  className="rounded-[7px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                >
                  {capturing ? 'Press keys…' : hotkey}
                </button>
              </div>
              {[
                { label: 'Quick capture', combo: 'Ctrl+Shift+N' },
                { label: 'Cycle spaces', combo: 'Ctrl+Shift+E' },
                { label: 'Peek (hold)', combo: 'Ctrl+Shift+`' },
                { label: 'Preview screensaver', combo: 'Ctrl+Shift+S' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between border-b border-[var(--border)] py-2.5 last:border-0"
                >
                  <span className="text-[13px] text-[var(--text-primary)]">
                    {s.label}
                  </span>
                  <Kbd combo={s.combo} />
                </div>
              ))}
              <p className="mt-3 text-[11.5px] text-[var(--text-tertiary)]">
                You can also flick the mouse to the top-left corner to switch
                spaces (enable “Hot corner” in General).
              </p>
            </div>
          )}

          {tab === 'about' && (
            <div className="flex flex-col gap-3">
              <div>
                <div
                  className="text-[var(--text-primary)]"
                  style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.8px' }}
                >
                  Layer v{version}
                </div>
                <div className="text-[14px] text-[var(--text-secondary)]">
                  a quiet layer on your desktop
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={updateBusy}
                  onClick={() => checkUpdates()}
                  className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-50"
                >
                  Check for updates
                </button>
                {updateMsg && (
                  <span className="text-[12px] text-[var(--text-secondary)]">
                    {updateMsg}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => quitApp().catch(() => {})}
                className="mt-2 self-start text-[13px] font-medium"
                style={{ color: 'var(--danger)' }}
              >
                Quit Layer
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
