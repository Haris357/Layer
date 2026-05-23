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

export const saveTemplates = (json: string) =>
  invoke<void>('save_templates', { json })

export const loadTemplates = () => invoke<string>('load_templates')

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

export const openUrl = (url: string) => invoke<void>('open_url', { url })

export const importAsset = (sourcePath: string) =>
  invoke<string>('import_asset', { sourcePath })

export const deleteAsset = (assetPath: string) =>
  invoke<void>('delete_asset', { assetPath })

export const registerHotkey = (accelerator: string) =>
  invoke<void>('register_hotkey', { accelerator })

export const setScreensaverEnabled = (enabled: boolean) =>
  invoke<void>('set_screensaver_enabled', { enabled })

export const previewScreensaver = () =>
  invoke<void>('preview_screensaver')

export const showInFolder = (path: string) =>
  invoke<void>('show_in_folder', { path })

export const captureScreen = (path: string) =>
  invoke<void>('capture_screen', { path })

export const captureScreenBase64 = () =>
  invoke<string>('capture_screen_base64')

export const writeBinaryFile = (path: string, dataBase64: string) =>
  invoke<void>('write_binary_file', { path, dataBase64 })

export const readBinaryFile = (path: string) =>
  invoke<string>('read_binary_file', { path })
