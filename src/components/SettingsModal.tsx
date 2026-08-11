import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useDragControls } from 'framer-motion'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { save } from '@tauri-apps/plugin-dialog'
import {
  Loader2,
  X,
  GripVertical,
  SlidersHorizontal,
  Palette,
  MonitorPlay,
  Keyboard,
  Info,
  Cloud,
  type LucideIcon,
} from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import type { SecondaryShortcut } from '../store/settingsStore'
import { useThemeStatus } from '../store/themeStatusStore'
import {
  captureScreen,
  getAppVersion,
  openUrl,
  previewScreensaver,
  quitApp,
  setShortcuts,
  showInFolder,
} from '../lib/ipc'
import { buildShortcuts } from '../hooks/useShortcuts'
import { useCanvasStore } from '../store/canvasStore'
import { useMonitorStore, useAnchorMonitor } from '../store/monitorStore'
import { useToastStore } from '../store/toastStore'
import { getUpdate } from '../lib/updater'
import { runUpdate } from '../lib/updateFlow'
import { Toggle, Slider, FieldRow, Segmented, Select } from './ui'
import { SyncTab } from './SyncTab'
import { useNotchStore, type NotchModuleId } from '../notch/notchStore'
import { IS_STORE } from '../lib/dist'
import { LANGUAGES, changeLanguage, type LanguageCode } from '../lib/i18n'

// ☕ Support link — shown only in the direct-download build (the Microsoft Store
// rejects external donation/payment links).
// Flip SUPPORT_ENABLED to true once the GitHub Sponsors page is approved and
// live; until then the button is hidden so users never hit a 404.
const SUPPORT_ENABLED = false
const SUPPORT_URL = 'https://github.com/sponsors/Haris357'

const NOTCH_MODULE_LABELS: Record<NotchModuleId, string> = {
  nowplaying: 'Now Playing',
  shortcuts: 'Shortcuts',
  timer: 'Timer',
  system: 'System',
  weather: 'Weather',
  calendar: 'Calendar',
  notifications: 'Notifications',
  clipboard: 'Clipboard',
  toggles: 'Quick toggles',
}

type TabId =
  | 'general'
  | 'appearance'
  | 'screensaver'
  | 'notch'
  | 'sync'
  | 'shortcuts'
  | 'about'

// Labels come from i18n (settings.tabs.<id>) at render time.
const TABS: { id: TabId; icon: LucideIcon }[] = [
  { id: 'general', icon: SlidersHorizontal },
  { id: 'appearance', icon: Palette },
  { id: 'screensaver', icon: MonitorPlay },
  // Notch/Dock is parked — its tab is hidden from release builds while the
  // feature is finished. The panel code below stays so re-enabling is one line.
  // { id: 'notch', icon: PanelTop },
  { id: 'sync', icon: Cloud },
  { id: 'shortcuts', icon: Keyboard },
  { id: 'about', icon: Info },
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
  const { t } = useTranslation()
  const language = useSettingsStore((s) => s.language)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapEnabled = useSettingsStore((s) => s.snapEnabled)
  const hotkey = useSettingsStore((s) => s.hotkey)
  const secondaryShortcuts = useSettingsStore((s) => s.secondaryShortcuts)
  const setSecondaryShortcut = useSettingsStore((s) => s.setSecondaryShortcut)
  const theme = useSettingsStore((s) => s.theme)
  const screensaverEnabled = useSettingsStore((s) => s.screensaverEnabled)
  const screensaverTheme = useSettingsStore((s) => s.screensaverTheme)
  const setScreensaverTheme = useSettingsStore((s) => s.setScreensaverTheme)
  const wallpaperAccent = useSettingsStore((s) => s.wallpaperAccent)
  const hotCorner = useSettingsStore((s) => s.hotCorner)
  const setGridSize = useSettingsStore((s) => s.setGridSize)
  const setSnapEnabled = useSettingsStore((s) => s.setSnapEnabled)
  const setHotkey = useSettingsStore((s) => s.setHotkey)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setScreensaverEnabled = useSettingsStore((s) => s.setScreensaverEnabled)
  const setWallpaperAccent = useSettingsStore((s) => s.setWallpaperAccent)
  const setHotCorner = useSettingsStore((s) => s.setHotCorner)
  const wallpaperLoading = useThemeStatus((s) => s.wallpaperLoading)
  const resetSpace = useCanvasStore((s) => s.resetSpace)
  const activeId = useCanvasStore((s) => s.activeId)
  const activeSpaceName = useCanvasStore(
    (s) => s.spaces.find((t) => t.id === s.activeId)?.name ?? 'this space',
  )
  const primary = useAnchorMonitor()
  const monitors = useMonitorStore((s) => s.monitors)
  const uiMonitor = useSettingsStore((s) => s.uiMonitor)
  const setUiMonitor = useSettingsStore((s) => s.setUiMonitor)
  const notchEnabled = useSettingsStore((s) => s.notchEnabled)
  const setNotchEnabled = useSettingsStore((s) => s.setNotchEnabled)
  const notchMonitor = useSettingsStore((s) => s.notchMonitor)
  const setNotchMonitor = useSettingsStore((s) => s.setNotchMonitor)
  const notchModules = useNotchStore((s) => s.modules)
  const toggleNotchModule = useNotchStore((s) => s.toggleModule)
  const dragControls = useDragControls()

  const [tab, setTab] = useState<TabId>('general')
  const [confirmReset, setConfirmReset] = useState(false)
  // Which shortcut is currently being rebound (null = none).
  const [capturing, setCapturing] = useState<'toggle' | SecondaryShortcut | null>(
    null,
  )
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
      // Esc cancels the rebind without changing anything.
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      const accel = buildAccelerator(e)
      if (!accel) return
      if (capturing === 'toggle') {
        setHotkey(accel)
      } else {
        setSecondaryShortcut(capturing, { accelerator: accel, enabled: true })
      }
      setCapturing(null)
      // useShortcuts() re-registers automatically when the store changes.
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [capturing, setHotkey, setSecondaryShortcut])

  // While rebinding, unregister every global shortcut so Windows stops
  // swallowing the combos (otherwise pressing e.g. Ctrl+Shift+S just fires the
  // action and never reaches the capture box). Re-apply the saved config the
  // moment rebinding ends — whether the user set a new key or pressed Esc.
  useEffect(() => {
    if (capturing) {
      setShortcuts([]).catch(() => {})
      return
    }
    const s = useSettingsStore.getState()
    setShortcuts(buildShortcuts(s.hotkey, s.secondaryShortcuts)).catch(() => {})
  }, [capturing])

  // Safety: if Settings is closed while still mid-rebind, make sure the saved
  // shortcuts get re-registered.
  useEffect(() => {
    return () => {
      const s = useSettingsStore.getState()
      setShortcuts(buildShortcuts(s.hotkey, s.secondaryShortcuts)).catch(() => {})
    }
  }, [])

  const toggleAutostart = (value: boolean) => {
    setAutostart(value)
    ;(value ? enable() : disable()).catch(() => {})
  }

  const checkUpdates = async () => {
    setUpdateBusy(true)
    setUpdateMsg(t('settings.about.checking'))
    try {
      const update = await getUpdate()
      setUpdateBusy(false)
      if (!update) {
        setUpdateMsg(t('settings.about.upToDate'))
        return
      }
      // Hand off to the toast flow: it downloads in the background and offers a
      // Relaunch / Later choice when ready. Close Settings so the toast shows.
      setUpdateMsg('')
      onClose()
      runUpdate(update)
    } catch {
      setUpdateBusy(false)
      setUpdateMsg(t('settings.about.updateFailed'))
    }
  }

  const exportImage = async () => {
    const path = await save({
      title: t('settings.toasts.exportDialogTitle'),
      defaultPath: 'layer-canvas.png',
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    })
    if (!path) return
    onClose()
    setTimeout(() => {
      captureScreen(path)
        .then(() =>
          useToastStore.getState().showToast({
            message: t('settings.toasts.canvasExported'),
            icon: 'success',
            duration: 7000,
            actions: [
              {
                label: t('settings.toasts.openFolder'),
                onClick: () => showInFolder(path).catch(() => {}),
              },
            ],
          }),
        )
        .catch(() =>
          useToastStore
            .getState()
            .showToast({ message: t('settings.toasts.exportFailed'), icon: 'error' }),
        )
    }, 250)
  }

  const handleReset = () => {
    resetSpace(activeId)
    setConfirmReset(false)
    onClose()
  }

  const ghostBtn =
    'rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]'

  return (
    <div
      data-hit
      className="fixed inset-0 z-[10000]"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
      onMouseDown={onClose}
    >
      {/* Centre the modal within the primary monitor (not the whole virtual
          desktop) so it never opens in the gap between monitors. */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: primary ? primary.x : 0,
          top: primary ? primary.y : 0,
          width: primary ? primary.w : '100%',
          height: primary ? primary.h : '100%',
        }}
      >
        <motion.div
          drag
          dragListener={false}
          dragControls={dragControls}
          dragMomentum={false}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="glass flex h-[min(560px,90vh)] w-[min(720px,94vw)] overflow-hidden rounded-[18px] border border-[var(--border)]"
          onMouseDown={(e) => e.stopPropagation()}
        >
        {/* sidebar */}
        <div className="flex w-[176px] shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--fill-1)] p-3">
          <div
            className="select-none px-2 pb-3 pt-1 text-[var(--text-primary)]"
            style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.8px' }}
          >
            {t('settings.title')}
          </div>
          {TABS.map((tb) => {
            const active = tab === tb.id
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                className={`flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-[var(--fill-3)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--fill-2)]'
                }`}
              >
                <tb.icon size={15} strokeWidth={2} />
                {t(`settings.tabs.${tb.id}`)}
              </button>
            )
          })}
          <div className="mt-auto px-2 text-[10px] text-[var(--text-tertiary)]">
            {t('settings.version', { version })}
          </div>
        </div>

        {/* content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* header bar: drag handle pinned left, close pinned right, divider
              underneath so the settings below can never collide with them */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <button
              type="button"
              onPointerDown={(e) => dragControls.start(e)}
              title={t('common.dragToMove')}
              className="flex h-7 w-7 cursor-grab items-center justify-center rounded-[7px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-secondary)] active:cursor-grabbing"
            >
              <GripVertical size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title={t('common.close')}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]"
            >
              <X size={17} />
            </button>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto p-6">
          {tab === 'general' && (
            <div className="flex flex-col gap-5">
              <FieldRow label={t('settings.general.snapToGrid')}>
                <Toggle checked={snapEnabled} onChange={setSnapEnabled} />
              </FieldRow>
              <FieldRow label={t('settings.general.gridSize', { size: gridSize })}>
                <div className="w-[160px]">
                  <Slider
                    value={gridSize}
                    min={8}
                    max={40}
                    onChange={setGridSize}
                  />
                </div>
              </FieldRow>
              {IS_STORE ? (
                <FieldRow label={t('settings.general.launchOnStartup')}>
                  <span className="text-[11.5px] text-[var(--text-tertiary)]">
                    {t('settings.general.startupViaWindows')}
                  </span>
                </FieldRow>
              ) : (
                <FieldRow label={t('settings.general.launchOnStartup')}>
                  <Toggle checked={autostart} onChange={toggleAutostart} />
                </FieldRow>
              )}
              <FieldRow label={t('settings.general.hotCorner')}>
                <Toggle checked={hotCorner} onChange={setHotCorner} />
              </FieldRow>

              <div className="flex flex-col gap-2">
                <SectionTitle>{t('settings.general.language')}</SectionTitle>
                <span className="text-[11.5px] text-[var(--text-tertiary)]">
                  {t('settings.general.languageHint')}
                </span>
                <Select
                  className="w-[220px]"
                  value={language}
                  options={LANGUAGES.map((l) => ({
                    value: l.code,
                    label: l.label,
                  }))}
                  onChange={(v) => {
                    setLanguage(v)
                    changeLanguage(v as LanguageCode)
                  }}
                />
              </div>

              <div className="flex flex-col gap-2">
                <SectionTitle>{t('settings.general.canvas')}</SectionTitle>
                <button
                  type="button"
                  onClick={() => exportImage().catch(() => {})}
                  className={ghostBtn}
                >
                  {t('settings.general.exportImage')}
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
                    ? t('settings.general.resetSpaceConfirm', {
                        name: activeSpaceName,
                      })
                    : t('settings.general.resetSpace')}
                </button>
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <SectionTitle>{t('settings.appearance.theme')}</SectionTitle>
                <Segmented
                  value={theme}
                  options={[
                    { value: 'light', label: t('settings.appearance.light') },
                    { value: 'dark', label: t('settings.appearance.dark') },
                    { value: 'system', label: t('settings.appearance.system') },
                  ]}
                  onChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
                />
              </div>
              <FieldRow label={t('settings.appearance.matchWallpaper')}>
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

              {monitors.length > 1 && (
                <div className="flex flex-col gap-2">
                  <SectionTitle>{t('settings.appearance.showOn')}</SectionTitle>
                  <span className="text-[11.5px] text-[var(--text-tertiary)]">
                    {t('settings.appearance.showOnHint')}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setUiMonitor(-1)}
                      className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        uiMonitor < 0
                          ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                          : 'border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--fill-2)]'
                      }`}
                    >
                      {t('settings.appearance.autoPrimary')}
                    </button>
                    {monitors.map((m, i) => {
                      const active = uiMonitor === i
                      const dpr = window.devicePixelRatio || 1
                      const w = Math.round(m.w * dpr)
                      const h = Math.round(m.h * dpr)
                      return (
                        <button
                          key={`${m.x},${m.y},${i}`}
                          type="button"
                          onClick={() => setUiMonitor(i)}
                          className={`flex flex-col items-start rounded-[8px] px-3 py-1.5 text-left transition-colors ${
                            active
                              ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                              : 'border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--fill-2)]'
                          }`}
                        >
                          <span className="text-[12px] font-semibold">
                            {t('settings.appearance.display', { n: i + 1 })}
                          </span>
                          <span
                            className="text-[10px]"
                            style={{ opacity: active ? 0.85 : 0.6 }}
                          >
                            {w}×{h}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'screensaver' && (
            <div className="flex flex-col gap-5">
              {IS_STORE ? (
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  {t('settings.screensaver.storeNote')}
                </div>
              ) : (
                <FieldRow label={t('settings.screensaver.useAsScreensaver')}>
                  <Toggle
                    checked={screensaverEnabled}
                    onChange={setScreensaverEnabled}
                  />
                </FieldRow>
              )}

              <div className="flex flex-col gap-2">
                <SectionTitle>{t('settings.screensaver.style')}</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {(['ambient', 'minimal', 'quote'] as const).map((value) => {
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
                        {t(`settings.screensaver.${value}`)}
                      </button>
                    )
                  })}
                </div>
                <span className="text-[11.5px] text-[var(--text-tertiary)]">
                  {screensaverTheme === 'minimal'
                    ? t('settings.screensaver.descMinimal')
                    : screensaverTheme === 'quote'
                      ? t('settings.screensaver.descQuote')
                      : t('settings.screensaver.descAmbient')}
                </span>
              </div>

              <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                {t('settings.screensaver.idleNote')}
              </p>
              <button
                type="button"
                onClick={() => previewScreensaver().catch(() => {})}
                className={ghostBtn}
              >
                {t('settings.screensaver.previewNow')}
              </button>
            </div>
          )}

          {tab === 'shortcuts' && (
            <div className="flex flex-col gap-1">
              <SectionTitle>{t('settings.shortcuts.keyboard')}</SectionTitle>

              {/* Main edit-mode toggle: rebindable (always on). */}
              <div className="mt-1 flex items-center justify-between border-b border-[var(--border)] py-2.5">
                <span className="text-[13px] text-[var(--text-primary)]">
                  {t('settings.shortcuts.toggleEdit')}
                </span>
                <button
                  type="button"
                  onClick={() => setCapturing('toggle')}
                  className="rounded-[7px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                >
                  {capturing === 'toggle'
                    ? t('settings.shortcuts.pressKeys')
                    : hotkey}
                </button>
              </div>

              {/* Secondary shortcuts: rebindable AND disable-able (each frees
                  its key combo for other apps when turned off). */}
              {(
                [
                  ['capture', 'quickCapture'],
                  ['cycle', 'cycleSpaces'],
                  ['screensaver', 'previewScreensaver'],
                ] as [SecondaryShortcut, string][]
              ).map(([action, labelKey]) => {
                const cfg = secondaryShortcuts[action]
                return (
                  <div
                    key={action}
                    className="flex items-center justify-between border-b border-[var(--border)] py-2.5"
                  >
                    <span className="text-[13px] text-[var(--text-primary)]">
                      {t(`settings.shortcuts.${labelKey}`)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!cfg.enabled}
                        onClick={() => setCapturing(action)}
                        className="min-w-[92px] rounded-[7px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-40 disabled:hover:border-[var(--border)]"
                      >
                        {capturing === action
                          ? t('settings.shortcuts.pressKeys')
                          : cfg.enabled
                            ? cfg.accelerator
                            : t('settings.shortcuts.disabled')}
                      </button>
                      <Toggle
                        checked={cfg.enabled}
                        onChange={(v) =>
                          setSecondaryShortcut(action, { enabled: v })
                        }
                      />
                    </div>
                  </div>
                )
              })}

              {/* Peek is window-local (not a global shortcut), so it can't
                  clash with other apps — shown for reference only. */}
              <div className="flex items-center justify-between border-b border-[var(--border)] py-2.5 last:border-0">
                <span className="text-[13px] text-[var(--text-primary)]">
                  {t('settings.shortcuts.peek')}
                </span>
                <Kbd combo="Ctrl+Shift+`" />
              </div>

              <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">
                {t('settings.shortcuts.remapHint')}
              </p>
              <p className="text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">
                {t('settings.shortcuts.hotCornerNote')}
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
                  {t('settings.version', { version })}
                </div>
                <div className="text-[14px] text-[var(--text-secondary)]">
                  {t('settings.about.tagline')}
                </div>
              </div>
              {IS_STORE ? (
                <span className="text-[12px] text-[var(--text-secondary)]">
                  {t('settings.about.storeUpdates')}
                </span>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={updateBusy}
                    onClick={() => checkUpdates()}
                    className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-50"
                  >
                    {t('settings.about.checkUpdates')}
                  </button>
                  {updateMsg && (
                    <span className="text-[12px] text-[var(--text-secondary)]">
                      {updateMsg}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    openUrl(
                      'https://apps.microsoft.com/detail/9NL577X16L1N',
                    ).catch(() => {})
                  }
                  className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
                >
                  <span className="grid grid-cols-2 grid-rows-2 gap-[2px]">
                    <i className="h-[7px] w-[7px] rounded-[1px]" style={{ background: '#f25022' }} />
                    <i className="h-[7px] w-[7px] rounded-[1px]" style={{ background: '#7fba00' }} />
                    <i className="h-[7px] w-[7px] rounded-[1px]" style={{ background: '#00a4ef' }} />
                    <i className="h-[7px] w-[7px] rounded-[1px]" style={{ background: '#ffb900' }} />
                  </span>
                  {IS_STORE
                    ? t('settings.about.rateStore')
                    : t('settings.about.store')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openUrl('https://github.com/Haris357/Layer-releases').catch(
                      () => {},
                    )
                  }
                  className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
                >
                  {t('settings.about.github')}
                </button>
                {!IS_STORE && SUPPORT_ENABLED && (
                  <button
                    type="button"
                    onClick={() => openUrl(SUPPORT_URL).catch(() => {})}
                    className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
                  >
                    {t('settings.about.support')}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => quitApp().catch(() => {})}
                className="mt-2 self-start text-[13px] font-medium"
                style={{ color: 'var(--danger)' }}
              >
                {t('common.quit')}
              </button>
            </div>
          )}

          {tab === 'notch' && (
            <div className="flex flex-col gap-5">
              <FieldRow label="Enable Layer Notch">
                <Toggle checked={notchEnabled} onChange={setNotchEnabled} />
              </FieldRow>
              <p className="text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">
                A macOS-style notch pinned to the top of your screen — a
                dynamic island for media, timers and quick shortcuts. It runs
                as its own window, separate from your desktop widgets.
              </p>

              {monitors.length > 1 && (
                <div className="flex flex-col gap-2">
                  <SectionTitle>Show notch on</SectionTitle>
                  <Segmented
                    value={String(notchMonitor)}
                    options={[
                      { value: '-1', label: 'Primary' },
                      ...monitors.map((_, i) => ({
                        value: String(i),
                        label: `Display ${i + 1}`,
                      })),
                    ]}
                    onChange={(v) => setNotchMonitor(Number(v))}
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <SectionTitle>Modules</SectionTitle>
                {notchModules.map((m) => (
                  <FieldRow key={m.id} label={NOTCH_MODULE_LABELS[m.id]}>
                    <Toggle
                      checked={m.enabled}
                      onChange={() => toggleNotchModule(m.id)}
                    />
                  </FieldRow>
                ))}
              </div>
            </div>
          )}

          {tab === 'sync' && <SyncTab />}
          </div>
        </div>
        </motion.div>
      </div>
    </div>
  )
}
