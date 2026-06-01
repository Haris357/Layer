import { motion } from 'framer-motion'
import {
  X,
  Bell,
  Download,
  Send,
  ArrowUp,
  Award,
  BatteryLow,
  Timer,
  Calendar,
  Info,
  FileDown,
  Trash2,
  Check,
} from 'lucide-react'
import {
  useNotificationStore,
  type AppNotification,
  type NotificationKind,
} from '../store/notificationStore'
import { relTime } from '../lib/notify'
import { useMonitorStore } from '../store/monitorStore'
import { Tooltip } from './Tooltip'
import { cn } from '../lib/utils'

const ICONS: Record<NotificationKind, typeof Bell> = {
  update: Download,
  publish: Send,
  upvote: ArrowUp,
  milestone: Award,
  battery: BatteryLow,
  timer: Timer,
  calendar: Calendar,
  import: FileDown,
  info: Info,
}

function tint(kind: NotificationKind): string {
  switch (kind) {
    case 'update':
      return '#5b8def'
    case 'publish':
      return '#39c277'
    case 'upvote':
    case 'milestone':
      return '#e0a13a'
    case 'battery':
      return '#d54a4a'
    case 'timer':
      return '#a965d6'
    case 'calendar':
      return '#39afc7'
    case 'import':
      return '#7a8694'
    default:
      return '#7a8694'
  }
}

function Row({ n }: { n: AppNotification }) {
  const markRead = useNotificationStore((s) => s.markRead)
  const remove = useNotificationStore((s) => s.remove)
  const Icon = ICONS[n.kind] ?? Info
  return (
    <div
      className={cn(
        'group/n relative flex items-start gap-3 rounded-[10px] border px-3 py-2.5 transition-colors',
        n.read
          ? 'border-[var(--border)] bg-[var(--fill-1)]'
          : 'border-[var(--border-strong)] bg-[var(--fill-2)]',
      )}
    >
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]"
        style={{ background: 'var(--fill-2)', color: tint(n.kind) }}
      >
        <Icon size={14} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="truncate text-[13px] font-semibold text-[var(--text-primary)]"
          >
            {n.title}
          </span>
          {!n.read && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: 'var(--accent)' }}
            />
          )}
        </div>
        {n.body && (
          <div className="mt-0.5 text-[12px] leading-snug text-[var(--text-secondary)]">
            {n.body}
          </div>
        )}
        <div className="mt-1 text-[10.5px] text-[var(--text-tertiary)]">
          {relTime(n.createdAt)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/n:opacity-100">
        {!n.read && (
          <Tooltip label="Mark as read">
            <button
              type="button"
              onClick={() => markRead(n.id)}
              className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
            >
              <Check size={13} />
            </button>
          </Tooltip>
        )}
        <Tooltip label="Remove">
          <button
            type="button"
            onClick={() => remove(n.id)}
            className="rounded-[6px] p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--fill-2)] hover:text-[var(--danger)]"
          >
            <Trash2 size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const items = useNotificationStore((s) => s.items)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const clearAll = useNotificationStore((s) => s.clearAll)
  const hasUnread = items.some((i) => !i.read)
  const primary = useMonitorStore((s) => s.primary)

  // Pick the right icon for the empty state.
  return (
    <div
      data-hit
      className="fixed inset-0 z-[10000]"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
      onMouseDown={onClose}
    >
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
        initial={{ opacity: 0, scale: 0.95, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="glass flex max-h-[80vh] w-[440px] flex-col rounded-[16px] border border-[var(--border)] p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2
            className="text-[var(--text-primary)]"
            style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-1px' }}
          >
            Notifications
          </h2>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <>
                {hasUnread && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="rounded-[7px] px-2 py-1 text-[11.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
                  >
                    Mark all read
                  </button>
                )}
                <Tooltip label="Clear all">
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded-[7px] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
                  >
                    <Trash2 size={15} />
                  </button>
                </Tooltip>
              </>
            )}
            <Tooltip label="Close" side="bottom">
              <button
                type="button"
                onClick={onClose}
                className="ml-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X size={18} />
              </button>
            </Tooltip>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-[var(--text-tertiary)]">
            <Bell size={28} strokeWidth={1.5} />
            <span className="text-[13px]">All caught up ✦</span>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
            {items.map((n) => (
              <Row key={n.id} n={n} />
            ))}
          </div>
        )}
      </motion.div>
      </div>
    </div>
  )
}
