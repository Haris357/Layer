import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { save } from '@tauri-apps/plugin-dialog'
import { useSettingsStore } from '../store/settingsStore'
import {
  captureScreen,
  getAppVersion,
  previewScreensaver,
  quitApp,
  registerHotkey,
  showInFolder,
} from '../lib/ipc'
import { useToastStore } from '../store/toastStore'
import { getUpdate, installUpdate } from '../lib/updater'
import { Toggle, Slider, FieldRow, Segmented } from './ui'

function buildAccelerator(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.shiftKey) mods.push('Shift')
  if (e.altKey) mods.push('Alt')
  if (e.metaKey) mods.push('Super')
  if (mods.length === 0) return null
  const name =
    e.key === ' '
      ? 'Space'
      : e.key.length === 1
        ? e.key.toUpperCase()
        : e.key
  return [...mods, name].join('+')
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const gridSize = useSettingsStore((s) => s.gridSize)
  const snapEnabled = useSettingsStore((s) => s.snapEnabled)
  const hotkey = useSettingsStore((s) => s.hotkey)
  const theme = useSettingsStore((s) => s.theme)
  const screensaverEnabled = useSettingsStore((s) => s.screensaverEnabled)
  const setGridSize = useSettingsStore((s) => s.setGridSize)
  const setSnapEnabled = useSettingsStore((s) => s.setSnapEnabled)
  const setHotkey = useSettingsStore((s) => s.setHotkey)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setScreensaverEnabled = useSettingsStore(
    (s) => s.setScreensaverEnabled,
  )

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
    // let the settings modal unmount before grabbing the screen
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
          useToastStore.getState().showToast({
            message: 'Export failed',
            icon: 'error',
          }),
        )
    }, 250)
  }

  return (
    <div
      data-hit
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="glass flex max-h-[90vh] w-[480px] flex-col overflow-y-auto rounded-[16px] border border-[var(--border)] p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          className="text-[var(--text-primary)]"
          style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-1.2px' }}
        >
          Settings
        </h2>

        <div className="mt-6 flex flex-1 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-[var(--text-secondary)]">
              Toggle edit mode
            </span>
            <button
              type="button"
              onClick={() => setCapturing(true)}
              className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
            >
              {capturing ? 'Press a key combination...' : hotkey}
            </button>
          </div>

          <FieldRow label={`Snap grid size · ${gridSize}px`}>
            <div className="w-[180px]">
              <Slider
                value={gridSize}
                min={8}
                max={40}
                onChange={setGridSize}
              />
            </div>
          </FieldRow>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-[var(--text-secondary)]">
              Widget appearance
            </span>
            <Segmented
              value={theme}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
              onChange={(v) =>
                setTheme(v as 'light' | 'dark' | 'system')
              }
            />
          </div>

          <FieldRow label="Snap widgets to grid">
            <Toggle checked={snapEnabled} onChange={setSnapEnabled} />
          </FieldRow>

          <FieldRow label="Launch Layer on startup">
            <Toggle checked={autostart} onChange={toggleAutostart} />
          </FieldRow>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-[var(--text-secondary)]">
              Screensaver
            </span>
            <FieldRow label="Use Layer as my screensaver">
              <Toggle
                checked={screensaverEnabled}
                onChange={setScreensaverEnabled}
              />
            </FieldRow>
            <button
              type="button"
              onClick={() => previewScreensaver().catch(() => {})}
              className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
            >
              Preview screensaver · Ctrl+Shift+S
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-[var(--text-secondary)]">
              Canvas
            </span>
            <button
              type="button"
              onClick={() => exportImage().catch(() => {})}
              className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
            >
              Export canvas as image
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <div
            className="text-[var(--text-primary)]"
            style={{ fontSize: 18, fontWeight: 700 }}
          >
            Layer v{version}
          </div>
          <div
            className="text-[var(--text-secondary)]"
            style={{ fontSize: 14, fontWeight: 400 }}
          >
            a quiet layer on your desktop
          </div>
          <div className="mt-3 flex items-center gap-3">
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
            className="mt-3 text-[13px] font-medium"
            style={{ color: 'var(--danger)' }}
          >
            Quit Layer
          </button>
        </div>
      </motion.div>
    </div>
  )
}
