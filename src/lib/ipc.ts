import { invoke } from '@tauri-apps/api/core'

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const setHitRegions = (regions: number[][]) =>
  invoke<void>('set_hit_regions', { regions })

export const setForceInteractive = (force: boolean) =>
  invoke<void>('set_force_interactive', { force })

export const setFront = (front: boolean) =>
  invoke<void>('set_front', { front })

export const saveCanvas = (json: string) =>
  invoke<void>('save_canvas', { json })

export const loadCanvas = () => invoke<string>('load_canvas')

export const saveJournal = (json: string) =>
  invoke<void>('save_journal', { json })

export const loadJournal = () => invoke<string>('load_journal')

export const saveSpaces = (json: string) =>
  invoke<void>('save_spaces', { json })

export const loadSpaces = () => invoke<string>('load_spaces')

export const writeTextFile = (path: string, contents: string) =>
  invoke<void>('write_text_file', { path, contents })

export const readTextFile = (path: string) =>
  invoke<string>('read_text_file', { path })

export const resetAll = () => invoke<void>('reset_all')

export const quitApp = () => invoke<void>('quit_app')

export const getAppVersion = () => invoke<string>('get_app_version')

export interface SystemStats {
  cpu: number
  memUsed: number
  memTotal: number
  diskUsed: number
  diskTotal: number
  battery: number
  charging: boolean
}

export const getSystemStats = () =>
  invoke<SystemStats>('get_system_stats')

// [latitude, longitude] from the Windows location service. Rejects if location
// is disabled/blocked.
export const getSystemLocation = () =>
  invoke<[number, number]>('get_system_location')

export interface AppEntry {
  name: string
  path: string
}

export const listApps = () => invoke<AppEntry[]>('list_apps')

export const launchApp = (path: string) =>
  invoke<void>('launch_app', { path })

export const getAppIcon = (path: string) =>
  invoke<string | null>('get_app_icon', { path })

export interface NowPlaying {
  hasSession: boolean
  title: string
  artist: string
  playing: boolean
  // Album/track art as a `data:` URL ('' when none).
  thumb: string
  // Source app id (e.g. "Spotify.exe" / a Store AUMID / "msedge.exe").
  source: string
  // Playback position + length in seconds (0 when the app reports none).
  position: number
  duration: number
}

export const getNowPlaying = () => invoke<NowPlaying>('get_now_playing')

export const mediaControl = (action: 'playpause' | 'next' | 'prev') =>
  invoke<void>('media_control', { action })

export interface NotificationItem {
  id: number
  app: string
  title: string
  body: string
}

export const getNotifications = () =>
  invoke<NotificationItem[]>('get_notifications')

export const clearNotification = (id: number) =>
  invoke<void>('clear_notification', { id })

export const clearAllNotifications = () =>
  invoke<void>('clear_all_notifications')

export const getVolume = () => invoke<number>('get_volume')

export const setVolume = (level: number) =>
  invoke<void>('set_volume', { level })

// ── Audio devices ──
export interface AudioDevice {
  id: string
  name: string
  direction: 'output' | 'input'
  isDefault: boolean
}

export const listAudioDevices = () =>
  invoke<AudioDevice[]>('list_audio_devices')

export const setAudioDevice = (id: string) =>
  invoke<boolean>('set_audio_device', { id })

export const openUrl = (url: string) => invoke<void>('open_url', { url })

export const importAsset = (sourcePath: string) =>
  invoke<string>('import_asset', { sourcePath })

// ── DiskInfo ──
export interface DiskInfo {
  name: string
  mount: string
  fs: string
  kind: 'ssd' | 'hdd' | 'unknown'
  total: number
  available: number
  removable: boolean
}
export const getDisks = () => invoke<DiskInfo[]>('get_disks')

export interface DiskIo {
  name: string // PDH instance, e.g. "0 C:" or "_Total"
  readBps: number
  writeBps: number
  activePct: number
}
export const getDiskIo = () => invoke<DiskIo[]>('get_disk_io')

// ── Shelf ──
export interface ShelfFile {
  name: string
  path: string
  size: number
  kind: 'image' | 'video' | 'audio' | 'file' | 'folder'
}
export const shelfImport = (sourcePath: string) =>
  invoke<ShelfFile>('shelf_import', { sourcePath })
export const shelfRemove = (path: string) =>
  invoke<void>('shelf_remove', { path })

export const deleteAsset = (assetPath: string) =>
  invoke<void>('delete_asset', { assetPath })

// A configurable global shortcut. `action` is one of
// 'toggle' | 'capture' | 'screensaver' | 'cycle'.
export interface ShortcutDef {
  action: string
  accelerator: string
  enabled: boolean
}

// Replace the whole set of registered global shortcuts. Disabled ones are
// simply not registered, freeing the key combo for other apps.
export const setShortcuts = (shortcuts: ShortcutDef[]) =>
  invoke<void>('set_shortcuts', { shortcuts })

export const setScreensaverEnabled = (enabled: boolean) =>
  invoke<void>('set_screensaver_enabled', { enabled })

export const previewScreensaver = () =>
  invoke<void>('preview_screensaver')

export const setScreensaverTheme = (theme: string) =>
  invoke<void>('set_screensaver_theme', { theme })

export const getScreensaverTheme = () =>
  invoke<string>('get_screensaver_theme')

export const showInFolder = (path: string) =>
  invoke<void>('show_in_folder', { path })

// Dominant accent colour (#rrggbb) sampled from the desktop wallpaper.
export const getWallpaperAccent = () =>
  invoke<string>('get_wallpaper_accent')

export const setHotcorner = (enabled: boolean) =>
  invoke<void>('set_hotcorner', { enabled })

export const captureScreen = (path: string) =>
  invoke<void>('capture_screen', { path })

export const captureScreenBase64 = () =>
  invoke<string>('capture_screen_base64')

export const writeBinaryFile = (path: string, dataBase64: string) =>
  invoke<void>('write_binary_file', { path, dataBase64 })

export const readBinaryFile = (path: string) =>
  invoke<string>('read_binary_file', { path })

// ---------- Layer Notch ----------
export const createNotchWindow = (monitor: number) =>
  invoke<void>('create_notch_window', { monitor })

export const closeNotchWindow = () => invoke<void>('close_notch_window')

export const repositionNotch = (monitor: number) =>
  invoke<void>('reposition_notch', { monitor })

export const setNotchSize = (width: number, height: number) =>
  invoke<void>('set_notch_size', { width, height })

export const setNotchHitbox = (rect: [number, number, number, number]) =>
  invoke<void>('set_notch_hitbox', { rect })

export const isDesktopForeground = () =>
  invoke<boolean>('is_desktop_foreground')
