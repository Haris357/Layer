import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellOff, X } from 'lucide-react'
import {
  clearAllNotifications,
  clearNotification,
  getNotifications,
  isTauri,
  type NotificationItem,
} from '../../lib/ipc'
import type { NotificationsWidget as NotificationsWidgetType } from '../../types/widget'
import { Tooltip } from '../Tooltip'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

function NotificationsRenderer() {
  const { t } = useTranslation()
  const [items, setItems] = useState<NotificationItem[]>([])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const poll = () => {
      getNotifications()
        .then((d) => {
          if (!cancelled) setItems(d)
        })
        .catch(() => {})
    }
    poll()
    const id = window.setInterval(poll, 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const clearOne = (id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    clearNotification(id).catch(() => {})
  }

  const clearAll = () => {
    setItems([])
    clearAllNotifications().catch(() => {})
  }

  return (
    <div className="glass flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-[var(--border)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
          <Bell size={12} strokeWidth={1.8} />
          <span
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.3px' }}
          >
            {t('notifications.title', { count: items.length })}
          </span>
        </span>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {t('notifications.clearAll')}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]">
          <BellOff size={22} strokeWidth={1.5} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>
            {t('notifications.empty')}
          </span>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          <AnimatePresence initial={false}>
            {items.map((n) => (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.18 }}
                className="group flex items-start gap-2 rounded-[8px] bg-white/[0.04] p-2"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  {n.app && (
                    <span
                      className="truncate text-[var(--text-tertiary)]"
                      style={{ fontSize: 10, fontWeight: 600 }}
                    >
                      {n.app}
                    </span>
                  )}
                  {n.title && (
                    <span
                      className="truncate text-[var(--text-primary)]"
                      style={{ fontSize: 12.5, fontWeight: 600 }}
                    >
                      {n.title}
                    </span>
                  )}
                  {n.body && (
                    <span
                      className="line-clamp-2 text-[var(--text-secondary)]"
                      style={{ fontSize: 12 }}
                    >
                      {n.body}
                    </span>
                  )}
                </div>
                <Tooltip label={t('notifications.dismiss')} side="left">
                  <button
                    type="button"
                    onClick={() => clearOne(n.id)}
                    className="shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--danger)]"
                  >
                    <X size={14} />
                  </button>
                </Tooltip>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

export const notificationsDefinition: WidgetDefinition<NotificationsWidgetType> =
  {
    type: 'notifications',
    label: 'Notifications',
    icon: Bell,
    enabled: true,
    minSize: { width: 260, height: 170 },
    create: (x, y) => ({
      type: 'notifications',
      x,
      y,
      width: 320,
      height: 280,
      locked: false,
    }),
    Renderer: NotificationsRenderer,
  }
