import {
  useNotificationStore,
  type NotificationKind,
} from '../store/notificationStore'

// Fire a notification from anywhere — outside React or inside.
export function notify(opts: {
  kind: NotificationKind
  title: string
  body?: string
  href?: string
  spaceId?: string
  dedupe?: string
}): void {
  useNotificationStore.getState().add(opts)
}

// Friendly relative time for the panel.
export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  const s = Math.floor(diff / 1000)
  if (s < 45) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString()
}
